import type { EngineSettings } from './engine'

export function ffmpegArgs(settings: EngineSettings, encoder: 'h264_nvenc' | 'libx264', target: string | null, recording: string | null): string[] {
  if (!target && !recording) throw new Error('Choose Twitch output or local recording.')
  const args = ['-hide_banner', '-loglevel', 'info', '-nostats', '-stats_period', '1', '-progress', 'pipe:3',
    '-fflags', '+genpts', '-thread_queue_size', '512', '-probesize', '1000000', '-analyzeduration', '1000000',
    '-f', 'matroska', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0', '-c:v', encoder]
  args.push(...(encoder === 'h264_nvenc' ? ['-preset', 'p4', '-tune', 'll', '-rc', 'cbr', '-zerolatency', '1', '-bf', '0'] : ['-preset', 'veryfast', '-tune', 'zerolatency', '-x264-params', 'nal-hrd=cbr:force-cfr=1']))
  if (settings.resolution === '720p') args.push('-vf', 'scale=1280:720:flags=lanczos')
  args.push('-pix_fmt', 'yuv420p', '-r', String(settings.fps), '-g', String(settings.fps * 2), '-keyint_min', String(settings.fps * 2),
    '-sc_threshold', '0', '-b:v', `${settings.bitrate}k`, '-minrate', `${settings.bitrate}k`, '-maxrate', `${settings.bitrate}k`, '-bufsize', `${settings.bitrate * 2}k`,
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-af', 'aresample=async=1:first_pts=0', '-flags', '+global_header')
  if (!target) return [...args, '-f', 'mp4', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-y', recording!]
  const fifo = 'queue_size=120:drop_pkts_on_overflow=1:attempt_recovery=1:recover_any_error=1:recovery_wait_time=2:restart_with_keyframe=1'
  if (recording) {
    // Global FIFO options avoid the tee slave parser's additional escaping level.
    return [...args, '-f', 'tee', '-use_fifo', '1', '-fifo_options', fifo, '-y', `[f=flv]${teeEscape(target)}|[f=mp4:use_fifo=0:movflags=+frag_keyframe+empty_moov+default_base_moof:onfail=ignore]${teeEscape(recording.replaceAll('\\', '/'))}`]
  }
  return [...args, '-f', 'fifo', '-fifo_format', 'flv', ...fifo.split(':').flatMap(option => { const [key, value] = option.split('='); return [`-${key}`, value!] }), target]
}
export function teeEscape(value: string): string { return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('|', '\\|') }
export function ffmpegProblem(line: string): { message: string; reconnect: boolean; gpu: boolean } | null {
  if (/FIFO queue full|FIFO queue.*overflow/i.test(line)) return { message: 'The output queue filled. Reduce bitrate and repeat the private test.', reconnect: true, gpu: false }
  if (/No capable devices|Cannot load.*cuda|OpenEncodeSessionEx failed|minimum required.*driver|unsupported device|No NVENC capable/i.test(line)) return { message: 'NVENC is unavailable. Retrying with the CPU encoder.', reconnect: false, gpu: true }
  if (/Connection refused|Connection reset|Broken pipe|Network is unreachable|Recovery failed|Error opening.*rtmp|Error writing.*(rtmp|flv)|I\/O error/i.test(line)) return { message: 'Twitch output lost its connection. FFmpeg is retrying automatically.', reconnect: true, gpu: false }
  if (/No space left|Permission denied/i.test(line)) return { message: 'The recording could not be written. Check disk space and folder permissions.', reconnect: false, gpu: false }
  if (/Unknown encoder|Error while opening encoder|Invalid argument|Invalid data found|Conversion failed/i.test(line)) return { message: 'The encoder could not continue. Stop output, check your sources and try again.', reconnect: false, gpu: false }
  return null
}
export function parseProgress(value: Record<string, string>): { fps: number; frames: number; seconds: number; bitrate: number | null; dropped: number; duplicated: number } {
  const num = (key: string): number => { const number = Number.parseFloat(value[key] || ''); return Number.isFinite(number) ? Math.max(0, number) : 0 }
  const bitrate = Number.parseFloat(value.bitrate || '')
  return { fps: num('fps'), frames: num('frame'), seconds: num('out_time_us') / 1000000,
    bitrate: Number.isFinite(bitrate) ? Math.max(0, bitrate) : null, dropped: num('drop_frames'), duplicated: num('dup_frames') }
}
