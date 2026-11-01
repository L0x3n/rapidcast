import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'

for (const mode of ['export', 'import']) {
  const profile = await mkdtemp(join(tmpdir(), `rapidcast-pack-${mode}-`))
  const environment = { ...process.env, RAPIDCAST_SMOKE_PROFILE: profile }; delete environment.ELECTRON_RUN_AS_NODE; delete environment.ELECTRON_RENDERER_URL
  try {
    const child = spawn(electron, ['.', '--rapidcast-smoke-test', `--rapidcast-pack-${mode}`], { cwd: new URL('..', import.meta.url), env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let passed = false
    const timeout = setTimeout(() => { console.error(`Pack ${mode} smoke timed out.`); child.kill() }, mode === 'import' ? 180000 : 60000)
    child.stdout.on('data', chunk => { const value = chunk.toString(); if (value.includes(`RapidCast pack ${mode} smoke passed:`)) passed = true; process.stdout.write(value) }); child.stderr.pipe(process.stderr)
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) }).finally(() => clearTimeout(timeout))
    if (code !== 0 || !passed) { process.exitCode = 1; break }
  } finally { await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }) }
}
