import { record } from './events'
import { SCENES, type SceneId } from './scenes'
import type { EngineSettings } from './engine'
import type { ActionResult } from './contracts'

export const SETUP_STEPS = ['Welcome', 'Twitch', 'Devices', 'Performance', 'Style', 'Ready'] as const
export type SetupGoal = 'local' | 'twitch'
export type ThemeFont = 'Segoe UI' | 'Consolas' | 'Georgia'
export interface StreamTheme { name: string; background: string; accent: string; font: ThemeFont; layout: 'chat-right' | 'chat-left'; titles: Record<SceneId, string> }
export const defaultTheme = (): StreamTheme => ({ name: 'Rapid neon', background: '#101c13', accent: '#cbfa54', font: 'Segoe UI', layout: 'chat-right', titles: Object.fromEntries(SCENES.map(scene => [scene.id, scene.title])) as Record<SceneId, string> })
export const THEME_PRESETS: StreamTheme[] = [defaultTheme(), { ...defaultTheme(), name: 'Electric ocean', background: '#0b1b29', accent: '#39e5ff', font: 'Consolas', layout: 'chat-left' }, { ...defaultTheme(), name: 'Late night', background: '#21132a', accent: '#ffb17a', font: 'Georgia' }]
export interface OutputProfile { resolution: EngineSettings['resolution']; fps: 30 | 60; bitrate: number; encoder: EngineSettings['encoder'] }
export interface SetupBenchmark {
  id: string; kind: SetupGoal; channelId: string; at: number; duration: number; profile: OutputProfile; programSignature: string
  fps: number; missedPercent: number; encodedFrames: number; encoderDrops: number; outputIssues: number; queuePeak: number; encoder: string; stable: boolean
}
export interface SetupCheck { id: string; title: string; detail: string; state: 'pass' | 'fail' | 'info'; required: boolean }
export interface SetupData { step: number; completed: boolean; goal: SetupGoal; visualSignature: string; audioSignature: string; inspectorId: string; theme: StreamTheme | null; benchmark: SetupBenchmark | null }
export interface SetupState extends SetupData {
  revision: number; secureStorage: boolean; checks: SetupCheck[]; recommendation: (OutputProfile & { reason: string }) | null
  task: { phase: 'idle' | 'discovering' | 'starting' | 'testing' | 'stopping' | 'styling' | 'repairing' | 'done' | 'error' | 'cancelled'; seconds: number; message: string }
  themeDraft: StreamTheme | null; diagnostics: SetupCheck[]
}
export interface DeviceSelection { displayId: string; cameraId: string; micId: string; desktop: boolean }
export interface SetupApi {
  getSetup(): Promise<SetupState>
  onSetup(listener: (state: SetupState) => void): () => void
  setupStep(step: number, goal: SetupGoal): Promise<ActionResult>
  discoverSetupDevices(): Promise<ActionResult>
  applySetupDevices(value: DeviceSelection): Promise<ActionResult>
  confirmSetup(kind: 'visual' | 'audio' | 'inspector', checked: boolean): Promise<ActionResult>
  testSetup(kind: SetupGoal): Promise<ActionResult>
  cancelSetup(): Promise<ActionResult>
  applySetupRecommendation(): Promise<ActionResult>
  generateSetupTheme(prompt: string): Promise<ActionResult>
  previewSetupTheme(theme: StreamTheme): Promise<ActionResult>
  applySetupTheme(): Promise<ActionResult>
  repairSetup(): Promise<ActionResult>
  finishSetup(start: boolean): Promise<ActionResult>
  openTwitchInspector(): Promise<ActionResult>
}
export const SETUP_IPC = { state: 'setup:state', update: 'setup:update', step: 'setup:step', discover: 'setup:discover', devices: 'setup:devices', confirm: 'setup:confirm', test: 'setup:test', cancel: 'setup:cancel', recommend: 'setup:recommend', generateTheme: 'setup:generate-theme', previewTheme: 'setup:preview-theme', applyTheme: 'setup:apply-theme', repair: 'setup:repair', finish: 'setup:finish', inspector: 'setup:inspector' } as const
export function validateTheme(input: unknown): StreamTheme {
  const v = record(input); const titles = record(v.titles)
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 60 || /[\x00-\x1f]/.test(v.name) || !['background', 'accent'].every(key => typeof v[key] === 'string' && /^#[a-f0-9]{6}$/i.test(String(v[key]))) ||
    !['Segoe UI', 'Consolas', 'Georgia'].includes(String(v.font)) || !['chat-right', 'chat-left'].includes(String(v.layout)) ||
    !SCENES.every(scene => typeof titles[scene.id] === 'string' && String(titles[scene.id]).trim().length > 0 && String(titles[scene.id]).length <= 60 && !/[\x00-\x1f]/.test(String(titles[scene.id])))) throw new Error('Theme needs a short name, #RRGGBB colors, a supported font/layout and four short scene titles.')
  const luminance = (hex: string): number => { const rgb = [1, 3, 5].map(i => { const s = Number.parseInt(hex.slice(i, i + 2), 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 }); return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]! }
  const a = luminance(String(v.accent)); const b = luminance(String(v.background))
  if ((Math.max(a, b) + .05) / (Math.min(a, b) + .05) < 4.5) throw new Error('Use a brighter accent or darker background so stream text stays readable.')
  return { name: v.name.trim(), background: String(v.background), accent: String(v.accent), font: v.font as ThemeFont, layout: v.layout as StreamTheme['layout'], titles: Object.fromEntries(SCENES.map(scene => [scene.id, String(titles[scene.id]).trim()])) as Record<SceneId, string> }
}
export function outputProfile(settings: EngineSettings): OutputProfile { return { resolution: settings.resolution, fps: settings.fps, bitrate: settings.bitrate, encoder: settings.encoder } }
export function visualSignature(settings: EngineSettings): string { return JSON.stringify(settings.scenes.live.filter(layer => ['display', 'camera'].includes(layer.kind))) }
export function audioSignature(settings: EngineSettings): string { return JSON.stringify(settings.audio) }
export function programSignature(settings: EngineSettings, widgets = ''): string { return JSON.stringify([settings.scenes, settings.audio, widgets]) }
export function recommendOutput(result: SetupBenchmark): OutputProfile & { reason: string } {
  const gpu = result.encoder === 'h264_nvenc'
  if (result.profile.bitrate < 3000) return { resolution: '720p', fps: 30, bitrate: 3000, encoder: gpu ? 'nvenc' : 'x264', reason: 'The tested bitrate was below this starting profile. Try 720p30 at 3000 kbps and repeat the test; the higher bitrate is not yet verified.' }
  if (!result.stable) return { resolution: '720p', fps: 30, bitrate: 3000, encoder: gpu ? 'nvenc' : 'x264', reason: 'The short test was unstable. Try this lighter output, reduce source/widget load and repeat the test. This does not prove upload speed.' }
  const resolution = result.profile.resolution === '1080p' && result.profile.bitrate >= 4500 ? '1080p' : '720p'
  const fps = gpu && result.profile.fps === 60 && result.profile.bitrate >= 4500 ? 60 : 30
  const target = resolution === '1080p' ? fps === 60 ? 6000 : 4500 : fps === 60 ? 4500 : 3000
  return { resolution, fps, bitrate: Math.min(target, result.profile.bitrate), encoder: gpu ? 'nvenc' : 'x264', reason: result.kind === 'twitch' ? 'The sender stayed stable at the tested load. This profile stays within it; verify delivery in Twitch Inspector. It is not a maximum-upload measurement.' : 'The local encoder stayed stable at the tested load. This profile is conservative; internet delivery still needs a private Twitch test.' }
}
export function benchmarkCovers(result: SetupBenchmark | null, settings: EngineSettings, kind: SetupGoal, channelId: string, now = Date.now(), widgets = ''): boolean {
  if (!result || !result.stable || result.kind !== kind || now - result.at > 30 * 60000 || now < result.at || result.programSignature !== programSignature(settings, widgets) || kind === 'twitch' && result.channelId !== channelId) return false
  return settings.fps <= result.profile.fps && settings.bitrate <= result.profile.bitrate && (settings.resolution === '720p' || result.profile.resolution === '1080p') &&
    (settings.encoder === 'auto' || settings.encoder === 'nvenc' && result.encoder === 'h264_nvenc' || settings.encoder === 'x264' && result.encoder === 'libx264')
}
