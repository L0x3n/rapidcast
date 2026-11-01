import { describe, expect, it } from 'vitest'
import { defaultEngineSettings, makeLayer, validateEngineSettings } from './engine'
import { benchmarkCovers, defaultTheme, programSignature, recommendOutput, validateTheme, THEME_PRESETS, type SetupBenchmark } from './setup'
import { themedScenes } from '../main/setup/theme'
import { ffmpegArgs, ffmpegProblem } from './ffmpeg.mjs'

const sample = (): SetupBenchmark => ({ id: 'test', kind: 'local', channelId: '', at: 1000000, duration: 15, profile: { resolution: '1080p', fps: 30, bitrate: 6000, encoder: 'auto' }, programSignature: programSignature(defaultEngineSettings()), fps: 30, missedPercent: 0, encodedFrames: 450, encoderDrops: 0, outputIssues: 0, queuePeak: 1000, encoder: 'h264_nvenc', stable: true })
describe('setup profiles and evidence', () => {
  it('migrates old 1080p settings and emits actual 720p scaling without changing the canvas', () => {
    const settings = defaultEngineSettings()
    const old: Record<string, unknown> = { ...settings }; delete old.resolution
    expect(validateEngineSettings(old).resolution).toBe('1080p')
    const args = ffmpegArgs({ ...settings, resolution: '720p' }, 'libx264', null, 'test.mp4')
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=1280:720:flags=lanczos')
    expect(ffmpegArgs(settings, 'h264_nvenc', null, 'test.mp4')).not.toContain('-vf')
    expect(ffmpegProblem('FIFO queue full')?.reconnect).toBe(true)
  })
  it('never treats a local sample as internet verification, or an unstable sample as readiness', () => {
    const settings = defaultEngineSettings(); const result = sample()
    expect(benchmarkCovers(result, settings, 'local', '', result.at)).toBe(true)
    expect(benchmarkCovers(result, settings, 'twitch', 'channel', result.at)).toBe(false)
    expect(benchmarkCovers({ ...result, stable: false }, settings, 'local', '', result.at)).toBe(false)
    expect(benchmarkCovers({ ...result, kind: 'twitch', channelId: 'first' }, settings, 'twitch', 'other', result.at)).toBe(false)
  })
  it('allows lighter tested output but invalidates stale, changed-program and heavier output', () => {
    const settings = defaultEngineSettings(); const result = sample()
    expect(benchmarkCovers(result, { ...settings, resolution: '720p', bitrate: 3000, encoder: 'nvenc' }, 'local', '', result.at)).toBe(true)
    for (const changed of [{ ...settings, fps: 60 as const }, { ...settings, bitrate: 7000 }, { ...settings, audio: { ...settings.audio, desktop: true } }]) expect(benchmarkCovers(result, changed, 'local', '', result.at)).toBe(false)
    expect(benchmarkCovers(result, settings, 'local', '', result.at + 1800001)).toBe(false)
    expect(benchmarkCovers(result, settings, 'local', '', result.at, 'changed widget parameters')).toBe(false)
    expect(benchmarkCovers({ ...result, profile: { ...result.profile, resolution: '720p' } }, settings, 'local', '', result.at)).toBe(false)
  })
  it('uses conservative recommendations without guessing an upload speed or untested 60 fps', () => {
    expect(recommendOutput(sample())).toMatchObject({ resolution: '1080p', fps: 30, bitrate: 4500, encoder: 'nvenc' })
    expect(recommendOutput({ ...sample(), stable: false })).toMatchObject({ resolution: '720p', fps: 30, bitrate: 3000 })
    expect(recommendOutput({ ...sample(), encoder: 'libx264', profile: { ...sample().profile, fps: 60 } }).fps).toBe(30)
    expect(recommendOutput({ ...sample(), profile: { ...sample().profile, bitrate: 1000 } }).reason).toContain('not yet verified')
  })
})
describe('data-only stream styles', () => {
  it('validates presets, filters unknown keys and rejects code/URLs/unsafe fonts and low contrast', () => {
    for (const theme of THEME_PRESETS) expect(validateTheme(theme)).toEqual(theme)
    expect(validateTheme({ ...defaultTheme(), execute: 'do not run' })).not.toHaveProperty('execute')
    for (const changes of [{ accent: 'url(https://example.com)' }, { font: 'ExternalFont' }, { accent: '#101c13' }, { titles: { starting: 'only one' } }]) expect(() => validateTheme({ ...defaultTheme(), ...changes })).toThrow()
  })
  it('previews/applies four scene styles while preserving sources, custom widget code and geometry edits outside managed elements', () => {
    const settings = defaultEngineSettings()
    settings.scenes.live.push({ ...makeLayer('camera', 'camera'), source: 'device' }, { ...makeLayer('display', 'display'), source: 'window:1' }, { ...makeLayer('chat', 'widget'), source: 'builtin-chat' }, { ...makeLayer('custom', 'widget'), source: 'custom-code', x: 700 })
    const result = themedScenes(settings, THEME_PRESETS[1]!)
    expect(result.scenes.live.find(item => item.id === 'camera')).toMatchObject({ source: 'device', x: 1400, y: 770 })
    expect(result.scenes.live.find(item => item.id === 'chat')?.x).toBe(40)
    expect(result.scenes.live.find(item => item.id === 'custom')).toEqual(settings.scenes.live.find(item => item.id === 'custom'))
    expect(settings.scenes.live.find(item => item.id === 'chat')?.x).toBe(0)
    expect(validateEngineSettings(result)).toEqual(result)
  })
})
