import { packager } from '@electron/packager'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releasePathAllowed } from './release-files.mjs'

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This release target requires Windows x64.')
const root = fileURLToPath(new URL('..', import.meta.url)); const output = join(root, 'out', 'release')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
for (const file of ['out/main/index.js', 'out/preload/index.cjs', 'out/renderer/index.html', 'out/overlay/index.html']) await stat(join(root, file))
if (!process.env.npm_execpath) throw new Error('Run npm run package:win after npm run build.')
const modules = execFileSync(process.execPath, [process.env.npm_execpath, 'ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).slice(1).map(path => relative(root, path).replaceAll('\\', '/'))
await mkdir(output, { recursive: true })
const paths = await packager({ dir: root, out: output, name: 'RapidCast', executableName: 'RapidCast', platform: 'win32', arch: 'x64', electronVersion: pkg.devDependencies.electron,
  appVersion: pkg.version, buildVersion: pkg.version, appCopyright: 'Copyright 2026 Linus', asar: false, prune: false, overwrite: true,
  ignore: path => !releasePathAllowed(path, modules), win32metadata: { CompanyName: 'Linus', FileDescription: 'RapidCast streaming studio (engine beta)', ProductName: 'RapidCast' } })
const directory = paths[0]; if (!directory || !resolve(directory).startsWith(`${resolve(output)}\\`)) throw new Error('Packager returned an unexpected output path.')
const app = join(directory, 'resources', 'app')
for (const file of ['RapidCast.exe', 'LICENSE', 'LICENSES.chromium.html', 'resources/app/LICENSE', 'resources/app/THIRD_PARTY_NOTICES.md', 'resources/app/node_modules/ffmpeg-static/ffmpeg.exe', 'resources/app/node_modules/ffmpeg-static/ffmpeg.exe.LICENSE', 'resources/app/node_modules/ffmpeg-static/ffmpeg.exe.README']) await stat(join(directory, file))
const expected = new Set([...topLevel(), 'out', 'config', 'docs', 'node_modules'])
for (const name of await readdir(app)) if (!expected.has(name)) throw new Error(`Unexpected packaged app entry: ${name}`)
if ((await readdir(join(app, 'out'))).some(name => !['main', 'preload', 'renderer', 'overlay'].includes(name))) throw new Error('Test artifacts entered the application package.')
await writeFile(join(directory, 'START-HERE.txt'), `RapidCast ${pkg.version}\r\n\r\nExtract the entire ZIP into a folder, then launch RapidCast.exe. Keep all files together. Node.js, OBS and a global FFmpeg installation are not required.\r\n\r\nThe streaming engine remains BETA. Connect Twitch yourself in Setup; the public application ID is included. AI is optional and configured in Settings. Use a private bandwidth test and verify picture/audio before intentional public output. OBS browser-source URLs remain the fallback.\r\n\r\nThis portable build is unsigned. Build/run details, known limits, submission material and licenses are under resources/app/README.md, docs and THIRD_PARTY_NOTICES.md. Credentials and sessions are stored in your Windows app data, not this folder.\r\n`)
const zipName = `RapidCast-${pkg.version}-windows-x64.zip`; const zip = join(output, zipName)
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Compress-Archive -LiteralPath $env:RAPIDCAST_RELEASE_DIRECTORY -DestinationPath $env:RAPIDCAST_RELEASE_ZIP -CompressionLevel Optimal -Force"],
  { env: { ...process.env, RAPIDCAST_RELEASE_DIRECTORY: directory, RAPIDCAST_RELEASE_ZIP: zip }, windowsHide: true, stdio: 'inherit', timeout: 300000 })
const bytes = await readFile(zip); const sha256 = createHash('sha256').update(bytes).digest('hex')
await writeFile(join(output, 'SHA256SUMS.txt'), `${sha256}  ${zipName}\n`)
let commit = 'uncommitted'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() } catch { /* A source ZIP may have no Git metadata. */ }
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version: pkg.version, commit, electron: pkg.devDependencies.electron, platform: 'win32-x64', archive: zipName, bytes: bytes.length, sha256, unsigned: true, engine: 'beta', allowlistedFiles: true, runtimePackages: modules.length }, null, 2))
console.log(`Portable package created: ${zip}\nSHA256 ${sha256}`)
function topLevel() { return ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'] }
