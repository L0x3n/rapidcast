import { execFile } from 'node:child_process'
import { readFile, stat, writeFile, copyFile, mkdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import type { Engine } from './controller'
import { ffmpegPath } from './encoder'
import { makeLayer } from '../../shared/engine'

async function until(check: () => boolean, seconds = 15): Promise<void> {
  const end = Date.now() + seconds * 1000
  while (!check()) { if (Date.now() > end) throw new Error('Engine smoke timed out waiting for frames or encoded output.'); await delay(100) }
}
function inspect(file: string, filter: 'audio' | 'video' | 'decode'): Promise<string> {
  const args = ['-hide_banner', '-i', file, ...(filter === 'audio' ? ['-af', 'silencedetect=noise=-30dB:d=0.02', '-vn'] :
    filter === 'video' ? ['-vf', 'crop=100:100:1800:0,blackdetect=d=0.02:pix_th=0.5', '-an'] : []), '-f', 'null', '-']
  return new Promise((resolve, reject) => execFile(ffmpegPath(), args, { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 },
    (error, _stdout, stderr) => error ? reject(new Error('The engine recording could not be decoded by the bundled FFmpeg.')) : resolve(stderr)))
}
export async function engineSmoke(window: BrowserWindow, engine: Engine): Promise<void> {
  const artifacts = join(__dirname, '../engine-smoke')
  await mkdir(artifacts, { recursive: true })
  engine.testPattern = true
  await engine.preview()
  await until(() => (engine.snapshot().telemetry?.frames ?? 0) > 30)
  const boundary: unknown = await engine.window!.webContents.executeJavaScript(`({isolated:typeof window.rapidcast==='undefined'&&typeof require==='undefined',processor:typeof window.MediaStreamTrackProcessor==='function',visibility:document.visibilityState})`)
  console.log('Engine compositor capabilities:', JSON.stringify(boundary))
  if (!boundary || typeof boundary !== 'object' || !('isolated' in boundary) || !boundary.isolated || !('processor' in boundary) || !boundary.processor) throw new Error('The compositor isolation or track processor capability check failed.')
  await engine.startOutput('record')
  await until(() => engine.snapshot().encodedFrames > 0 || engine.snapshot().phase === 'error')
  if (engine.snapshot().phase === 'error') throw new Error(engine.snapshot().message)
  window.minimize()
  console.log('Engine smoke: recording synthetic 1080p30 with the app minimized for 10 seconds.')
  await delay(10000)
  const measured = engine.snapshot()
  await engine.stopOutput()
  const file = engine.snapshot().recordingPath
  if (!file || (await stat(file)).size < 10000 || measured.encodedFrames < 200) throw new Error('The engine did not create a usable recording with enough video frames.')
  const decoded = await inspect(file, 'decode')
  if (!/Video: h264/.test(decoded) || !/1920x1080/.test(decoded) || !/Audio: aac.*48000 Hz/.test(decoded)) throw new Error('The recording did not contain the expected H.264 1080p and 48 kHz AAC tracks.')
  const audio = await inspect(file, 'audio'); const video = await inspect(file, 'video')
  const audioOnsets = [...audio.matchAll(/silence_end: ([\d.]+)/g)].map(match => Number(match[1]))
  const videoOnsets = [...video.matchAll(/black_end:([\d.]+)/g)].map(match => Number(match[1]))
  const lastVideo = videoOnsets.at(-1) ?? 0
  const offsets = audioOnsets.filter(value => value > 1 && value < lastVideo + .15).map(value => Math.min(...videoOnsets.map(frame => Math.abs(frame - value))))
  const maxSyncOffset = offsets.length >= 3 ? Math.max(...offsets) : null
  const report = { encoder: measured.encoder, telemetry: measured.telemetry, encodedFrames: measured.encodedFrames,
    encoderDrops: measured.outputDropped, encoderDuplicates: measured.outputDuplicated, fileBytes: (await stat(file)).size,
    audioOnsets, videoOnsets, maxSyncOffsetSeconds: maxSyncOffset, minimizedSeconds: 10 }
  await writeFile(join(app.getPath('userData'), 'engine-smoke.json'), JSON.stringify(report, null, 2))
  console.log('Engine benchmark:', JSON.stringify(report))
  await writeFile(join(artifacts, 'benchmark.json'), JSON.stringify(report, null, 2))
  await copyFile(file, join(artifacts, 'auto-1080p30.mp4'))
  if (maxSyncOffset === null || maxSyncOffset > .2) throw new Error('Synthetic audio/video synchronization exceeded 200 ms or lacked enough pulse measurements.')
  await engine.configure({ ...engine.snapshot().settings, encoder: 'x264' })
  await engine.startOutput('record')
  await until(() => engine.snapshot().encodedFrames > 0 || engine.snapshot().phase === 'error')
  if (engine.snapshot().phase === 'error') throw new Error(engine.snapshot().message)
  await delay(3000)
  await engine.stopOutput()
  const cpuFile = engine.snapshot().recordingPath
  if (!cpuFile || !/Video: h264/.test(await inspect(cpuFile, 'decode'))) throw new Error('CPU fallback recording could not be decoded.')
  await copyFile(cpuFile, join(artifacts, 'cpu-1080p30.mp4'))
  await engine.configure({ ...engine.snapshot().settings, encoder: 'auto', fps: 60 })
  await engine.startOutput('record')
  await until(() => engine.snapshot().encodedFrames > 0 || engine.snapshot().phase === 'error')
  if (engine.snapshot().phase === 'error') throw new Error(engine.snapshot().message)
  await delay(4000)
  console.log('Engine 60 fps benchmark:', JSON.stringify({ encoder: engine.snapshot().encoder, telemetry: engine.snapshot().telemetry, encodedFrames: engine.snapshot().encodedFrames }))
  await engine.stopOutput()
  const sixtyFile = engine.snapshot().recordingPath
  if (!sixtyFile || !/60 fps/.test(await inspect(sixtyFile, 'decode'))) throw new Error('The 60 fps recording did not decode with its expected frame rate.')
  await copyFile(sixtyFile, join(artifacts, 'auto-1080p60.mp4'))
  window.restore()
  const display = { ...makeLayer('self-capture-test', 'display'), source: window.getMediaSourceId(), z: 10 }
  const settings = engine.snapshot().settings
  await engine.setScene('live')
  await engine.configure({ ...settings, scenes: { ...settings.scenes, live: [...settings.scenes.live, display] } })
  await until(() => engine.snapshot().telemetry?.capabilities.includes('capture-frame') === true)
  console.log('Engine capture passed: frames from the RapidCast app window were read with MediaStreamTrackProcessor.')
  await engine.pause()
  console.log('RapidCast engine smoke passed: minimized 1080p pipeline, H.264/AAC MP4, sync pulses, NVENC selection and CPU recording.')
  const log = measured.diagnosticsPath
  if (log) {
    await copyFile(log, join(artifacts, 'frame-timing.jsonl'))
    console.log('Engine timing samples:', (await readFile(log, 'utf8')).trim().split('\n').length)
  }
}
