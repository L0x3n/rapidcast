import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)); const output = join(root, 'out', 'release')
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
const extracted = await mkdtemp(join(output, 'verify-extracted-'))
// Exercise the actual archive, not only Packager's source directory.
execFileSync('tar.exe', ['-xf', join(output, manifest.archive), '-C', extracted], { windowsHide: true })
const binary = join(extracted, 'RapidCast-win32-x64', 'RapidCast.exe')
const profile = await mkdtemp(join(tmpdir(), 'rapidcast-portable-'))
const env = { ...process.env, RAPIDCAST_SMOKE_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
try {
  const child = spawn(binary, ['--rapidcast-smoke-test', '--rapidcast-release-test', '--rapidcast-stats-test'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let publicConfig = false; let stats = false
  const timeout = setTimeout(() => { console.error('Portable smoke timed out.'); child.kill() }, 90000)
  child.stdout.on('data', bytes => { const value = bytes.toString(); publicConfig ||= value.includes('RapidCast release smoke passed:'); stats ||= value.includes('RapidCast stats smoke passed:'); process.stdout.write(value) }); child.stderr.pipe(process.stderr)
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) }).finally(() => clearTimeout(timeout))
  if (code !== 0 || !publicConfig || !stats) throw new Error('The extracted portable build did not pass startup, shipped configuration and output/report checks.')
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'portable-smoke.json'), JSON.stringify({ version: manifest.version, archiveSha256: manifest.sha256, extractedArchive: true, freshProfile: true, shippedPublicClientId: true, credentialsAbsent: true, widgetRecordingAndReport: true, exitCode: code }, null, 2))
  console.log('Extracted portable smoke passed.')
} finally { await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }) }
