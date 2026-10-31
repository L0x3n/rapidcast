import { describe, expect, it } from 'vitest'
import { defaultEngineSettings, FrameClock, makeLayer, validateEngineSettings } from './engine'
import { ffmpegArgs, ffmpegProblem, parseProgress, teeEscape } from './ffmpeg.mjs'

describe('compositor model', () => {
  it('creates independent 1080p scene layers and validates defaults', () => {
    const settings = defaultEngineSettings()
    expect(validateEngineSettings(settings)).toEqual(settings)
    settings.scenes.starting[0]!.opacity = .2
    expect(settings.scenes.live[0]?.opacity).toBe(1)
  })
  it.each([NaN, -1, 2])('rejects an invalid opacity: %s', opacity => {
    const settings = defaultEngineSettings(); settings.scenes.live[0]!.opacity = opacity
    expect(() => validateEngineSettings(settings)).toThrow('layer')
  })
  it('rejects a crop that removes the entire source', () => {
    const settings = defaultEngineSettings(); settings.scenes.live[0]!.crop = { left: .6, right: .5, top: 0, bottom: 0 }
    expect(() => validateEngineSettings(settings)).toThrow('crop')
  })
  it('rejects duplicate layer IDs and too many layers', () => {
    const settings = defaultEngineSettings(); settings.scenes.live.push({ ...settings.scenes.starting[0]! })
    expect(() => validateEngineSettings(settings)).toThrow('identity')
    settings.scenes.live = Array.from({ length: 25 }, (_, i) => makeLayer(`test-${i}`, 'text'))
    expect(() => validateEngineSettings(settings)).toThrow('24')
  })
  it('rejects unsupported frame rate and unsafe CSS colors', () => {
    const settings = defaultEngineSettings()
    expect(() => validateEngineSettings({ ...settings, fps: 144 })).toThrow('30 or 60')
    settings.scenes.live[0]!.color = 'url(https://example.com)'
    expect(() => validateEngineSettings(settings)).toThrow('color')
  })
  it('measures missed frame slots without fabricating successful frames', () => {
    const clock = new FrameClock(30)
    clock.draw(0); clock.draw(1000 / 30)
    const delayed = clock.draw(200)
    expect(delayed.stats.frames).toBe(3)
    expect(delayed.stats.expected).toBe(7)
    expect(delayed.stats.dropped).toBe(4)
    expect(delayed.delay).toBeCloseTo(1000 / 30)
    expect(delayed.stats.maxGapMs).toBeCloseTo(200 - 1000 / 30)
  })
  it('keeps an on-time 60 fps clock at zero missed slots', () => {
    const clock = new FrameClock(60)
    let result = clock.draw(0)
    for (let frame = 1; frame <= 120; frame++) result = clock.draw(frame * 1000 / 60)
    expect(result.stats.dropped).toBe(0)
    expect(result.stats.fps).toBeCloseTo(60)
  })
})
describe('FFmpeg output contracts', () => {
  it('configures H.264 CBR, a two-second GOP and 48 kHz AAC', () => {
    const args = ffmpegArgs(defaultEngineSettings(), 'h264_nvenc', null, 'recording.mp4')
    expect(args[args.indexOf('-g') + 1]).toBe('60')
    expect(args[args.indexOf('-b:v') + 1]).toBe('6000k')
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac')
    expect(args[args.indexOf('-ar') + 1]).toBe('48000')
    expect(args).toContain('pipe:0')
  })
  it('uses recoverable bounded FIFO output for Twitch and tee for an optional recording', () => {
    const settings = defaultEngineSettings()
    const live = ffmpegArgs(settings, 'libx264', 'rtmp://localhost/live/fake', null)
    expect(live).toContain('fifo')
    expect(live[live.indexOf('-queue_size') + 1]).toBe('120')
    expect(live).toContain('-attempt_recovery')
    const tee = ffmpegArgs(settings, 'h264_nvenc', 'rtmp://localhost/live/fake', 'C:/recordings/test.mp4')
    expect(tee).toContain('tee')
    expect(tee.at(-1)).toContain('onfail=ignore')
  })
  it('escapes tee path separators and never exposes credential-bearing errors', () => {
    expect(teeEscape('a|b')).toBe('a\\|b')
    const result = ffmpegProblem('Connection refused rtmp://example.com/live/fake-private-key')
    expect(result?.reconnect).toBe(true)
    expect(result?.message).not.toContain('fake-private-key')
    expect(ffmpegProblem('Cannot load nvcuda.dll')?.gpu).toBe(true)
  })
  it('preserves unknown output bitrate as unknown rather than using the target as a measurement', () => {
    expect(parseProgress({ frame: '300', fps: '30', out_time_us: '10000000', bitrate: 'N/A', drop_frames: '2' })).toEqual({ frames: 300, fps: 30, seconds: 10, bitrate: null, dropped: 2, duplicated: 0 })
  })
})
