import { open, readFile, rename, writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { record } from '../../shared/events'
import { PACK_LIMIT } from '../../shared/packs'

const names = ['engine.json', 'widgets.json', 'setup.json'] as const
type Name = typeof names[number]
export type PackFiles = Record<Name, string | null>
export async function boundedRead(path: string, limit = PACK_LIMIT): Promise<string> {
  const file = await open(path, 'r')
  try {
    const info = await file.stat(); if (!info.isFile() || info.size > limit) throw new Error('Choose a regular .rcpack file smaller than 16 MB.')
    const buffer = Buffer.alloc(Math.min(info.size + 1, limit + 1)); let length = 0
    while (length < buffer.length) { const result = await file.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead }
    if (length > limit || length > info.size) throw new Error('The pack changed while reading. Select a stable copy and retry.')
    return buffer.subarray(0, length).toString('utf8')
  } finally { await file.close() }
}
async function atomic(path: string, value: string): Promise<void> { await writeFile(`${path}.tmp`, value, { mode: 0o600 }); await rename(`${path}.tmp`, path) }
export async function snapshotFiles(directory: string): Promise<PackFiles> {
  const result = {} as PackFiles
  for (const name of names) {
    try { result[name] = await boundedRead(join(directory, name), 12 * 1024 * 1024) }
    catch (error: unknown) { if (record(error).code === 'ENOENT') result[name] = null; else throw new Error('Existing layout files could not be backed up. Check app data permissions before importing.') }
  }
  return result
}
async function restore(directory: string, files: PackFiles): Promise<void> {
  for (const name of names) { if (files[name] === null) await unlink(join(directory, name)).catch((e: unknown) => { if (record(e).code !== 'ENOENT') throw e }); else await atomic(join(directory, name), files[name]!) }
}
export async function recoverPackTransaction(directory: string): Promise<boolean> {
  const path = join(directory, 'pack-transaction.json'); let source: string
  try { source = await boundedRead(path, 48 * 1024 * 1024) } catch (error: unknown) { if (record(error).code === 'ENOENT') return false; throw new Error('The interrupted pack backup could not be opened. Preserve app data and check disk permissions.') }
  const value = record(JSON.parse(source)); const before = record(value.before)
  if (value.version !== 1 || Object.keys(before).length !== 3 || !names.every(name => before[name] === null || typeof before[name] === 'string' && String(before[name]).length <= 12 * 1024 * 1024)) throw new Error('The interrupted pack backup is invalid. Preserve pack-transaction.json for manual recovery.')
  await restore(directory, before as PackFiles); await unlink(path); return true
}
export async function commitPackFiles(directory: string, next: PackFiles, apply: () => void, rollback: () => void): Promise<void> {
  await mkdir(directory, { recursive: true }); const path = join(directory, 'pack-transaction.json')
  try { await readFile(path); throw new Error('Restart RapidCast to recover an earlier interrupted pack import first.') } catch (error: unknown) { if (record(error).code !== 'ENOENT') throw error }
  const before = await snapshotFiles(directory); await atomic(path, JSON.stringify({ version: 1, before }))
  try {
    for (const name of names) { if (next[name] === null) throw new Error('The new pack layout is incomplete.'); await atomic(join(directory, name), next[name]!) }
    apply(); await unlink(path)
  } catch {
    rollback()
    try { await restore(directory, before); await unlink(path) } catch { throw new Error('The import could not save or restore every file. Restart RapidCast to recover the previous layout from its backup.') }
    throw new Error('The import could not be saved. The previous layout was restored; check disk space and retry.')
  }
}
