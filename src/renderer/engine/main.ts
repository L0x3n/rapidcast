import './media-types'
import { FrameClock, type EngineCommand } from '../../shared/engine'
import { Sources } from './sources'
import { AudioMixer } from './audio'
import { Recorder } from './recorder'
import { drawProgram } from './draw'
import { WidgetBridge } from '../runtime/widget-bridge'
import { SceneTransition } from '../runtime/transitions'

const canvas = document.querySelector('canvas')
if (!canvas) throw new Error('The program canvas is missing.')
const context = canvas.getContext('2d', { alpha: false, desynchronized: true })
if (!context) throw new Error('The program canvas could not start.')
let current: EngineCommand | null = null
let sources = new Sources()
let audio: AudioMixer | null = null
const recorder = new Recorder()
let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let clock = new FrameClock(30)
let lastTelemetry = 0
let lastThumbnail = 0
let thumbnailPending = false
const widgets = new WidgetBridge()
const transition = new SceneTransition()

async function devices(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  window.compositor.devices(devices.filter(device => device.kind === 'videoinput').map((device, index) => ({ id: device.deviceId, name: device.label || `Camera ${index + 1}` })),
    devices.filter(device => device.kind === 'audioinput').map((device, index) => ({ id: device.deviceId, name: device.label || `Microphone ${index + 1}` })))
}
function draw(): void {
  if (!canvas || !context || !current || !audio || !stream) return
  const now = performance.now()
  widgets.check(now)
  drawProgram(context, current.settings.scenes[current.scene], sources, current.testPattern, current.testPattern ? audio.context.currentTime * 1000 : now, widgets)
  transition.draw(context, now)
  const capture = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  capture?.requestFrame()
  const timing = clock.draw(now)
  if (now - lastTelemetry >= 1000) {
    lastTelemetry = now
    window.compositor.telemetry({ ...timing.stats, visibility: document.visibilityState, ...audio.levels(), mimeType: recorder.mimeType,
      capabilities: [window.MediaStreamTrackProcessor ? 'track-processor' : 'no-track-processor', 'canvas-capture', 'web-audio',
        ...([...sources.videos.values()].some(source => source.frame) ? ['capture-frame'] : []), ...widgets.capabilities()] })
  }
  if (now - lastThumbnail >= 500 && !thumbnailPending) {
    lastThumbnail = now; thumbnailPending = true
    const preview = document.querySelector('#thumbnail') as HTMLCanvasElement
    preview.getContext('2d')?.drawImage(canvas, 0, 0, 640, 360)
    preview.toBlob(blob => {
      if (blob) void blob.arrayBuffer().then(data => window.compositor.thumbnail(data)).finally(() => { thumbnailPending = false })
      else thumbnailPending = false
    }, 'image/jpeg', .65)
  }
  timer = setTimeout(draw, timing.delay)
}
async function configure(command: EngineCommand): Promise<void> {
  const previousFps = current?.settings.fps
  const sceneChanged = current !== null && current.scene !== command.scene
  if (sceneChanged && canvas) transition.capture(canvas, command.transition)
  current = command
  widgets.configure(command)
  let desktop: MediaStream | null
  try { desktop = await sources.configure(command.settings.scenes[command.scene], command.settings.audio.desktop, command.settings.fps) }
  finally { if (sceneChanged) transition.begin(performance.now()) }
  audio ??= new AudioMixer()
  await audio.configure(command.settings.audio, desktop)
  if (command.testPattern) audio.testTone()
  if (previousFps !== command.settings.fps) clock = new FrameClock(command.settings.fps)
  if (!stream) {
    const video = canvas!.captureStream(0).getVideoTracks()[0]
    if (!video) throw new Error('Canvas capture could not produce a video track.')
    stream = new MediaStream([video, ...audio.destination.stream.getAudioTracks()])
  }
  await devices()
}
let commands = Promise.resolve()
window.compositor.onCommand(command => {
  commands = commands.then(async () => {
    try {
      if (command.type === 'preview' || command.type === 'configure') {
        await configure(command)
        if (timer === null) draw()
      } else if (command.type === 'record') {
        if (!stream) throw new Error('Start program preview before output.')
        recorder.start(stream, command.settings.fps, command.settings.bitrate, command.runId)
      } else if (command.type === 'end-record') await recorder.stop()
      else if (command.type === 'devices') await devices()
      else if (command.type === 'pause') {
        await recorder.stop()
        if (timer !== null) clearTimeout(timer)
        timer = null; sources.close(); sources = new Sources(); widgets.close(); transition.close()
        stream?.getTracks().forEach(track => track.stop()); stream = null
        await audio?.close(); audio = null; current = null; clock = new FrameClock(command.settings.fps)
      }
      window.compositor.reply(command.id, null)
    } catch (error: unknown) {
      const message = error instanceof DOMException ? `Capture failed (${error.name}). Check Windows permissions, refresh sources or disable Desktop audio, then retry.` : error instanceof Error ? error.message : 'The compositor action failed. Restart preview and try again.'
      window.compositor.reply(command.id, message)
    }
  })
})
window.compositor.ready()
