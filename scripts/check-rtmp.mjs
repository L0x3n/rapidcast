import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import binary from 'ffmpeg-static'
import { ffmpegArgs } from '../src/shared/ffmpeg.mts'

if (!binary || !isAbsolute(binary)) throw new Error('Install ffmpeg-static with npm ci. Its binary must have an absolute path.')
const directory = await mkdtemp(join(tmpdir(), 'RapidCast output check '))
const processes = []
function run(args, extraPipe = false) {
  const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe', ...(extraPipe ? ['pipe'] : [])] })
  processes.push(child)
  let stderr = ''
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000) })
  child.stdin.on('error', () => undefined)
  if (extraPipe) child.stdio[3].resume()
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve({ code, stderr }))
  })
  return { child, done }
}
try {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = address.port
  await new Promise(resolve => server.close(resolve))
  const target = `rtmp://127.0.0.1:${port}/live/synthetic`
  const received = join(directory, 'received.flv')
  const reconnected = join(directory, 'reconnected.flv')
  const recordDirectory = join(directory, "recording's folder")
  await mkdir(recordDirectory)
  const recording = join(recordDirectory, 'local recording.mp4')
  const receiver = run(['-hide_banner', '-loglevel', 'warning', '-listen', '1', '-i', target, '-c', 'copy', '-f', 'flv', '-y', received])
  await delay(700)
  const output = run(ffmpegArgs({ fps: 30, bitrate: 6000 }, 'libx264', target, recording), true)
  const producer = run(['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '13', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'libopus', '-f', 'matroska', 'pipe:1'])
  producer.child.stdout.pipe(output.child.stdin)
  output.child.stdout.resume(); receiver.child.stdout.resume()
  const reconnect = (async () => {
    await delay(5000)
    receiver.child.kill()
    await receiver.done
    await delay(300)
    const replacement = run(['-hide_banner', '-loglevel', 'warning', '-listen', '1', '-i', target, '-c', 'copy', '-f', 'flv', '-y', reconnected])
    replacement.child.stdout.resume()
    return replacement.done
  })()
  const timeout = setTimeout(() => processes.forEach(child => child.kill()), 30000)
  const results = await Promise.all([producer.done, output.done, reconnect]).finally(() => clearTimeout(timeout))
  if (results.some(result => result.code !== 0)) {
    for (const result of results) if (result.code !== 0) console.error(result.stderr)
    throw new Error('The loopback RTMP/tee integration check failed.')
  }
  for (const file of [received, reconnected, recording]) {
    const bytes = (await stat(file)).size
    console.log(file === received ? 'Initial RTMP bytes:' : file === reconnected ? 'Recovered RTMP bytes:' : 'MP4 recorded bytes:', bytes)
    if (bytes < 10000) { console.error(results[1].stderr); throw new Error(file === received ? 'RTMP receiver did not receive enough packets.' : 'The simultaneous MP4 was empty.') }
    const decoder = run(['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'])
    decoder.child.stdout.resume()
    if ((await decoder.done).code !== 0) throw new Error('An RTMP or MP4 output could not be decoded.')
  }
  console.log('RTMP integration passed: H.264/AAC loopback RTMP, recovery after receiver disconnect, simultaneous MP4, and spaces/apostrophe in the recording path.')
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill()
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 })
}
