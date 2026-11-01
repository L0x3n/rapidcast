import { spawn, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, copyFile, cp, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)); const out = join(root, 'out'); await mkdir(out, { recursive: true })
if (!process.env.npm_execpath) throw new Error('Run npm run check:clean-clone.')
if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('Commit the release candidate before verifying a clean clone.')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const clone = await mkdtemp(join(out, 'clean-clone-'))
execFileSync('git', ['clone', '--no-local', '--no-hardlinks', root, clone], { cwd: root, stdio: 'inherit', windowsHide: true })
const cloned = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).trim(); if (cloned !== commit) throw new Error('Clean clone revision mismatch.')
const steps = [['ci'], ['test'], ['run', 'build'], ['audit'], ...['smoke:engine', 'smoke:widgets', 'smoke:ai', 'smoke:setup', 'smoke:stats', 'smoke:packs', 'check:rtmp', 'package:win', 'smoke:portable'].map(name => ['run', name])]
const results = []
for (const args of steps) {
  console.log(`Clean clone check: npm ${args.join(' ')}`); const start = Date.now()
  const child = spawn(process.execPath, [process.env.npm_execpath, ...args], { cwd: clone, env: process.env, windowsHide: true, stdio: 'inherit' })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  results.push({ command: `npm ${args.join(' ')}`, exitCode: code, seconds: (Date.now() - start) / 1000 })
  await writeFile(join(out, 'clean-clone-report.json'), JSON.stringify({ commit, clone, noLocalObjects: true, noHardlinks: true, sequentialNativeTests: true, results }, null, 2))
  if (code !== 0) throw new Error(`Clean clone failed: npm ${args.join(' ')}`)
}
if (execFileSync('git', ['status', '--porcelain'], { cwd: clone, encoding: 'utf8' }).trim()) throw new Error('Verification modified tracked clone files.')
const source = join(clone, 'out', 'release'); const target = join(out, 'release')
if (!resolve(source).startsWith(`${resolve(clone)}\\`) || !resolve(target).startsWith(`${resolve(root)}\\`)) throw new Error('Release artifact copy escaped the workspace.')
await mkdir(target, { recursive: true }); const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
for (const file of [manifest.archive, 'SHA256SUMS.txt', 'manifest.json', 'portable-smoke.json']) await copyFile(join(source, file), join(target, file))
await cp(join(source, 'RapidCast-win32-x64'), join(target, 'RapidCast-win32-x64'), { recursive: true, force: true })
console.log(`Clean clone release checks passed: ${commit}. Verified portable archive copied to out/release.`)
