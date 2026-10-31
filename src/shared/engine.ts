import { record } from './events'
import { SCENES, type SceneId } from './scenes'

export type LayerKind = 'display' | 'camera' | 'image' | 'text' | 'color' | 'widget'
export interface Layer {
  id: string; name: string; kind: LayerKind; source: string; text: string; color: string
  x: number; y: number; width: number; height: number; z: number; opacity: number; visible: boolean
  crop: { left: number; right: number; top: number; bottom: number }
}
export interface AudioSettings { micId: string; desktop: boolean; micGain: number; desktopGain: number; micMuted: boolean; desktopMuted: boolean }
export interface EngineSettings {
  fps: 30 | 60; bitrate: number; encoder: 'auto' | 'nvenc' | 'x264'; recordWhileLive: boolean
  audio: AudioSettings; scenes: Record<SceneId, Layer[]>
}
export interface CaptureSource { id: string; name: string; kind: 'screen' | 'window' }
export interface DeviceChoice { id: string; name: string }
export interface FrameStats { fps: number; frames: number; expected: number; dropped: number; dropPercent: number; maxGapMs: number; visibility: string }
export interface EngineTelemetry extends FrameStats { micLevel: number; desktopLevel: number; mimeType: string; capabilities: string[] }
export interface EngineState {
  revision: number; phase: 'idle' | 'preview' | 'starting' | 'recording' | 'streaming' | 'reconnecting' | 'stopping' | 'error'
  previewActive: boolean; mode: 'record' | 'test' | 'live' | null; message: string; settings: EngineSettings
  telemetry: EngineTelemetry | null; encoder: string; encoderFps: number; encodedFrames: number
  bitrateKbps: number | null; outputDropped: number; outputDuplicated: number; queueBytes: number
  elapsedSeconds: number; recordingPath: string | null; diagnosticsPath: string | null; preview: string | null
  sources: CaptureSource[]; cameras: DeviceChoice[]; microphones: DeviceChoice[]; nvenc: boolean | null
}
export interface EngineCommand {
  id: string; type: 'configure' | 'preview' | 'pause' | 'record' | 'end-record' | 'devices'
  settings: EngineSettings; scene: SceneId; runId: string; testPattern: boolean
}
export const ENGINE_IPC = {
  state: 'engine:state', update: 'engine:update', configure: 'engine:configure', sources: 'engine:sources',
  preview: 'engine:preview-start', pause: 'engine:preview-stop', output: 'engine:output-start', stop: 'engine:output-stop',
  image: 'engine:import-image', reveal: 'engine:reveal-recording', ready: 'engine:ready', command: 'engine:command',
  reply: 'engine:reply', telemetry: 'engine:telemetry', thumbnail: 'engine:thumbnail', chunk: 'engine:chunk',
  devices: 'engine:devices', capture: 'engine:capture-source', asset: 'engine:asset', fault: 'engine:fault', warning: 'engine:warning'
} as const

export function makeLayer(id: string, kind: LayerKind): Layer {
  return { id, name: kind === 'text' ? 'Stream title' : `${kind[0]?.toUpperCase()}${kind.slice(1)} layer`, kind,
    source: '', text: 'YOUR NEXT GREAT STREAM', color: kind === 'color' ? '#101c13' : '#cbfa54',
    x: kind === 'camera' ? 1400 : 0, y: kind === 'camera' ? 720 : 0,
    width: kind === 'camera' ? 480 : 1920, height: kind === 'camera' ? 270 : kind === 'text' ? 200 : 1080,
    z: kind === 'camera' ? 10 : kind === 'text' ? 5 : 0, opacity: 1, visible: true,
    crop: { left: 0, right: 0, top: 0, bottom: 0 } }
}
export function defaultEngineSettings(): EngineSettings {
  const scenes = {} as Record<SceneId, Layer[]>
  for (const scene of SCENES) scenes[scene.id] = [makeLayer(`${scene.id}-bg`, 'color'),
    { ...makeLayer(`${scene.id}-title`, 'text'), text: scene.title, x: 110, y: 440, width: 1700, height: 180, z: 5 }]
  return { fps: 30, bitrate: 6000, encoder: 'auto', recordWhileLive: true,
    audio: { micId: 'none', desktop: false, micGain: 1, desktopGain: 1, micMuted: false, desktopMuted: false }, scenes }
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
export function validateEngineSettings(input: unknown): EngineSettings {
  const value = record(input); const audio = record(value.audio); const scenes = record(value.scenes)
  if ((value.fps !== 30 && value.fps !== 60) || !number(value.bitrate, 500, 10000) ||
      !['auto', 'nvenc', 'x264'].includes(String(value.encoder)) || typeof value.recordWhileLive !== 'boolean' ||
      typeof audio.micId !== 'string' || audio.micId.length > 256 || typeof audio.desktop !== 'boolean' ||
      !number(audio.micGain, 0, 3) || !number(audio.desktopGain, 0, 3) ||
      typeof audio.micMuted !== 'boolean' || typeof audio.desktopMuted !== 'boolean') throw new Error('Choose 30 or 60 fps, a bitrate from 500 to 10000 kbps and valid audio settings.')
  const ids = new Set<string>()
  for (const scene of SCENES) {
    const layers = scenes[scene.id]
    if (!Array.isArray(layers) || layers.length > 24) throw new Error('Each scene can contain up to 24 layers.')
    for (const raw of layers) {
      const layer = record(raw); const crop = record(layer.crop)
      if (typeof layer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(layer.id) || ids.has(layer.id) ||
          typeof layer.name !== 'string' || layer.name.length > 100 || !['display', 'camera', 'image', 'text', 'color', 'widget'].includes(String(layer.kind)) ||
          typeof layer.source !== 'string' || layer.source.length > 256 || typeof layer.text !== 'string' || layer.text.length > 1000 ||
          typeof layer.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(layer.color) || !number(layer.x, -1920, 3840) || !number(layer.y, -1080, 2160) ||
          !number(layer.width, 1, 7680) || !number(layer.height, 1, 4320) || !number(layer.z, -100, 100) || !number(layer.opacity, 0, 1) ||
          typeof layer.visible !== 'boolean' || !number(crop.left, 0, .95) || !number(crop.right, 0, .95) ||
          !number(crop.top, 0, .95) || !number(crop.bottom, 0, .95) || crop.left + crop.right >= 1 || crop.top + crop.bottom >= 1) {
        throw new Error('A layer has invalid position, size, crop, color or identity. Keep at least part of the source visible.')
      }
      ids.add(layer.id)
    }
  }
  return structuredClone(input) as EngineSettings
}

export class FrameClock {
  private start = -1; private last = -1; private frames = 0; private expected = 0; private maxGap = 0
  constructor(readonly fps: number) {}
  draw(now: number): { delay: number; stats: FrameStats } {
    if (this.start < 0) this.start = now
    if (this.last >= 0) this.maxGap = Math.max(this.maxGap, now - this.last)
    this.last = now; this.frames++
    this.expected = Math.max(this.expected + 1, Math.floor((now - this.start) / (1000 / this.fps)) + 1)
    const dropped = Math.max(0, this.expected - this.frames)
    return { delay: Math.max(0, this.start + this.expected * 1000 / this.fps - now), stats: {
      fps: this.frames > 1 ? (this.frames - 1) * 1000 / Math.max(1, now - this.start) : 0,
      frames: this.frames, expected: this.expected, dropped, dropPercent: 100 * dropped / this.expected,
      maxGapMs: this.maxGap, visibility: 'unknown'
    } }
  }
}
