import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'

const profile = await mkdtemp(join(tmpdir(), 'rapidcast-smoke-'))
const environment = { ...process.env, RAPIDCAST_SMOKE_PROFILE: profile }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_RENDERER_URL

try {
  const engineTest = process.argv.includes('--engine')
  const widgetTest = process.argv.includes('--widgets')
  const aiTest = process.argv.includes('--ai')
  const setupTest = process.argv.includes('--setup')
  const child = spawn(electron, ['.', '--rapidcast-smoke-test', ...(engineTest ? ['--rapidcast-engine-test'] : []), ...(widgetTest ? ['--rapidcast-widget-test'] : []), ...(aiTest ? ['--rapidcast-ai-test'] : []), ...(setupTest ? ['--rapidcast-setup-test'] : [])], {
    cwd: new URL('..', import.meta.url),
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let passed = false
  const timeout = setTimeout(() => {
    console.error('The Electron smoke check timed out. Close any stuck RapidCast test window and retry.')
    child.kill()
  }, setupTest ? 120000 : engineTest || widgetTest || aiTest ? 90000 : 25000)
  child.stdout.on('data', (chunk) => {
    const output = chunk.toString()
    if (output.includes(setupTest ? 'RapidCast setup smoke passed:' : aiTest ? 'RapidCast AI smoke passed:' : widgetTest ? 'RapidCast widget smoke passed:' : engineTest ? 'RapidCast engine smoke passed:' : 'RapidCast smoke passed:')) passed = true
    process.stdout.write(output)
  })
  child.stderr.pipe(process.stderr)
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  }).finally(() => clearTimeout(timeout))
  process.exitCode = code === 0 && passed ? 0 : 1
} finally {
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 })
}
