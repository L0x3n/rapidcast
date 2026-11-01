import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, copyFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)); const out = join(root, 'out', 'security'); await mkdir(out, { recursive: true })
const version = '8.30.1'; const checksum = 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e'
const tool = join(root, 'out', 'tools', `gitleaks-${version}`); await mkdir(tool, { recursive: true }); const binary = join(tool, 'gitleaks.exe')
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This pinned scanner bootstrap supports Windows x64. Install Gitleaks 8.30.1 and use the commands in docs/RELEASE.md on other systems.')
const archive = join(tool, 'gitleaks.zip')
let zip
try { zip = await readFile(archive) } catch {
  const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_windows_x64.zip`)
  if (!response.ok) throw new Error('The pinned Gitleaks release could not be downloaded.')
  zip = Buffer.from(await response.arrayBuffer()); await writeFile(archive, zip)
}
if (createHash('sha256').update(zip).digest('hex') !== checksum) throw new Error('Gitleaks checksum mismatch. Remove the cached ZIP and retry.')
execFileSync('tar.exe', ['-xf', archive, '-C', tool], { windowsHide: true })
const actual = execFileSync(binary, ['version'], { encoding: 'utf8', windowsHide: true }).trim(); if (actual !== version) throw new Error('Unexpected Gitleaks version.')
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
const tree = await mkdtemp(join(out, 'tracked-'))
for (const file of files) {
  const path = resolve(tree, file); if (!path.startsWith(`${resolve(tree)}\\`)) throw new Error('Unexpected tracked path.')
  await mkdir(dirname(path), { recursive: true }); await copyFile(join(root, file), path)
}
const common = ['--redact=100', '--no-banner', '--no-color', '--ignore-gitleaks-allow', `--config=${join(root, '.gitleaks.toml')}`, '--report-format=json']
const environment = { ...process.env }; delete environment.GITLEAKS_CONFIG; delete environment.GITLEAKS_CONFIG_TOML
const publicId = JSON.parse(await readFile(join(root, 'config', 'public.json'), 'utf8')).twitchClientId
const detectorTests = await mkdtemp(join(out, 'detector-'))
for (const [name, file, value, expected] of [
  ['public', 'config/public.json', publicId, 0],
  ['other-path', 'other/twitch.json', publicId, 1],
  ['other-value', 'config/public.json', [...publicId].reverse().join(''), 1]
]) {
  const target = join(detectorTests, name); await mkdir(dirname(join(target, file)), { recursive: true })
  await writeFile(join(target, file), JSON.stringify({ twitchClientId: value }))
  const check = spawnSync(binary, ['dir', ...common, `--report-path=${join(out, `detector-${name}.json`)}`, target], { cwd: root, env: environment, windowsHide: true, encoding: 'utf8' })
  if (check.status !== expected) throw new Error(`Secret-detector boundary check failed: ${name}. Inspect only redacted reports.`)
}
console.log('Secret-detector self-test passed: only the exact public ID at its exact config path is exempt.')
const results = []
for (const [mode, target, extra] of [['git', root, ['--log-opts=--all']], ['dir', tree, []]]) {
  const report = join(out, `${mode}.json`)
  const result = spawnSync(binary, [mode, ...common, ...extra, `--report-path=${report}`, target], { cwd: root, env: environment, windowsHide: true, encoding: 'utf8' })
  // Gitleaks is explicitly configured to redact every finding before output or JSON persistence.
  if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw new Error('Gitleaks could not run.')
  results.push({ mode, exitCode: result.status, report: `${mode}.json` })
}
const commits = Number(execFileSync('git', ['rev-list', '--all', '--count'], { cwd: root, encoding: 'utf8' }).trim())
await writeFile(join(out, 'summary.json'), JSON.stringify({ version, archiveSha256: checksum, scannedAt: new Date().toISOString(), reachableCommits: commits, trackedFiles: files.length, redacted: true, detectorBoundariesPassed: true, results }, null, 2))
if (results.some(r => r.exitCode !== 0)) throw new Error('Secret scan did not pass. Inspect only redacted reports under out/security before releasing.')
console.log(`Secret scan passed: all ${commits} reachable commits and ${files.length} tracked working files.`)
