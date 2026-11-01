import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boundedRead, commitPackFiles, recoverPackTransaction, snapshotFiles, type PackFiles } from './files'
const directories: string[] = []
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })
async function fixture() { const path = await mkdtemp(join(tmpdir(), 'rapidcast-pack-files-')); directories.push(path); await writeFile(join(path, 'engine.json'), 'old engine'); return path }
const next: PackFiles = { 'engine.json': 'new engine', 'widgets.json': 'new widgets', 'setup.json': 'new setup' }
describe('pack transaction and bounded files', () => {
  it('commits the three owned files and applies memory only after staging', async () => {
    const directory = await fixture(); const apply = vi.fn(); await commitPackFiles(directory, next, apply, vi.fn())
    expect(apply).toHaveBeenCalledOnce(); expect(await snapshotFiles(directory)).toEqual(next); expect(await recoverPackTransaction(directory)).toBe(false)
  })
  it('restores all previous files and memory if adoption fails', async () => {
    const directory = await fixture(); const before = await snapshotFiles(directory); const rollback = vi.fn()
    await expect(commitPackFiles(directory, next, () => { throw new Error('failure') }, rollback)).rejects.toThrow('previous layout was restored')
    expect(rollback).toHaveBeenCalledOnce(); expect(await snapshotFiles(directory)).toEqual(before)
  })
  it('recovers a partial crash before startup and rejects backups with missing owned fields', async () => {
    const directory = await fixture(); const before = await snapshotFiles(directory)
    await writeFile(join(directory, 'pack-transaction.json'), JSON.stringify({ version: 1, before })); await writeFile(join(directory, 'engine.json'), 'partially new')
    expect(await recoverPackTransaction(directory)).toBe(true); expect(await readFile(join(directory, 'engine.json'), 'utf8')).toBe('old engine')
    await writeFile(join(directory, 'pack-transaction.json'), JSON.stringify({ version: 1, before: { '../private': 'value' } }))
    await expect(recoverPackTransaction(directory)).rejects.toThrow('invalid')
  })
  it('does not overwrite a pending recovery and rejects oversized input', async () => {
    const directory = await fixture(); await writeFile(join(directory, 'pack-transaction.json'), 'pending')
    await expect(commitPackFiles(directory, next, vi.fn(), vi.fn())).rejects.toThrow('Restart')
    await writeFile(join(directory, 'large.rcpack'), 'x'.repeat(200)); await expect(boundedRead(join(directory, 'large.rcpack'), 100)).rejects.toThrow('16 MB')
  })
})
