import { spawn } from 'node:child_process'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
const root = fileURLToPath(new URL('../../', import.meta.url))
const kind = process.argv[2] || 'ai'
if (!['ai', 'widgets', 'setup'].includes(kind)) throw new Error('Unsupported demo capture')
const profile = await mkdtemp(join(root, 'out/demo/profile-'))
const target = join(root, 'out/demo/capture-' + kind)
await mkdir(target, { recursive: true })
const env = { ...process.env, RAPIDCAST_SMOKE_PROFILE: profile, RAPIDCAST_DEMO_CAPTURE: target }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const child = spawn(electron, [join(root, 'scripts/demo/capture-app.cjs'), '--rapidcast-smoke-test', `--rapidcast-${kind === 'widgets' ? 'widget' : kind}-test`], { cwd: root, env, windowsHide: true, stdio: 'inherit' })
const timeout = setTimeout(() => child.kill(), 120000)
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
clearTimeout(timeout)
if (code !== 0) throw new Error(`Demo capture ${kind} failed: ${code}`)
console.log(`Isolated native UI footage saved: ${target}`)
