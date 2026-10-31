import binary from 'ffmpeg-static'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { isAbsolute } from 'node:path'
import type { Writable } from 'node:stream'
import type { EngineSettings } from '../../shared/engine'
import { ffmpegArgs, ffmpegProblem, parseProgress } from '../../shared/ffmpeg.mjs'

export function ffmpegPath(): string {
  if (!binary || !isAbsolute(binary)) throw new Error('FFmpeg is missing. Run npm ci in the RapidCast project, then restart.')
  return binary
}
export async function probeNvenc(): Promise<boolean> {
  return new Promise(resolve => execFile(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=c=black:s=1280x720:r=30', '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
    { windowsHide: true, timeout: 8000, maxBuffer: 64000 }, error => resolve(!error)))
}
interface Hooks {
  progress(value: ReturnType<typeof parseProgress>): void
  problem(message: string, reconnect: boolean, gpu: boolean): void
  closed(expected: boolean, success: boolean): void
}
export class Encoder {
  private process: ChildProcess | null = null
  private input: Writable | null = null
  private stopping = false
  private sequence = 0
  private bytes = 0
  private stderr = ''
  private progressBuffer = ''
  private progress: Record<string, string> = {}
  private finished: Promise<boolean> = Promise.resolve(true)
  constructor(private readonly hooks: Hooks) {}
  get queuedBytes(): number { return this.bytes }

  start(settings: EngineSettings, encoder: 'h264_nvenc' | 'libx264', target: string | null, recording: string | null): void {
    if (this.process) throw new Error('Output is already running. Stop it before starting again.')
    this.stopping = false; this.sequence = 0; this.bytes = 0
    const child = spawn(ffmpegPath(), ffmpegArgs(settings, encoder, target, recording), {
      windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe', 'pipe']
    })
    this.process = child; this.input = child.stdin
    child.stdin?.on('error', () => undefined)
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-12000)
      const lines = this.stderr.split(/[\r\n]+/); this.stderr = lines.pop() || ''
      for (const line of lines) {
        const issue = ffmpegProblem(line)
        if (issue && !this.stopping) this.hooks.problem(issue.message, issue.reconnect, issue.gpu)
        if (/Slave muxer #0 failed/i.test(line) && !this.stopping) {
          this.hooks.problem('The Twitch muxer stopped. Rebuilding output and reconnecting.', true, false)
          child.kill()
        }
        if (/Slave muxer #1 failed/i.test(line) && !this.stopping) this.hooks.problem('Local recording stopped. Twitch output is continuing. Check disk space and folder permissions.', false, false)
        if (/Recovery successful/i.test(line) && !this.stopping) this.hooks.problem('Twitch output reconnected.', false, false)
      }
    })
    const progress = child.stdio[3]
    if (progress && 'on' in progress) progress.on('data', (chunk: Buffer) => {
      this.progressBuffer += chunk.toString()
      const lines = this.progressBuffer.split('\n'); this.progressBuffer = lines.pop() || ''
      for (const line of lines) {
        const separator = line.indexOf('=')
        if (separator < 0) continue
        this.progress[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
        if (line.startsWith('progress=')) this.hooks.progress(parseProgress(this.progress))
      }
    })
    this.finished = new Promise(resolve => {
      child.once('error', () => {
        this.hooks.problem('FFmpeg could not start. Run npm ci and check that antivirus has not blocked its bundled binary.', false, false)
      })
      child.once('close', code => {
        this.process = null; this.input = null
        const success = code === 0
        this.hooks.closed(this.stopping, success)
        resolve(success)
      })
    })
  }
  async write(runSequence: number, data: ArrayBuffer): Promise<void> {
    if (!Number.isInteger(runSequence) || runSequence !== this.sequence || data.byteLength < 1 || data.byteLength > 8 * 1024 * 1024) throw new Error('The video input was interrupted. Restart output to create a fresh video stream.')
    const input = this.input
    if (!input || input.destroyed || this.stopping) throw new Error('The encoder is restarting. A fresh video stream will be created.')
    if (this.bytes + data.byteLength > 16 * 1024 * 1024) throw new Error('The encoder cannot keep up. Stop output, reduce FPS or bitrate, and try again.')
    this.sequence++; this.bytes += data.byteLength
    try {
      await new Promise<void>((resolve, reject) => input.write(Buffer.from(data), error => error ? reject(new Error('The encoder stopped accepting video.')) : resolve()))
    } finally { this.bytes -= data.byteLength }
  }
  async stop(): Promise<boolean> {
    if (!this.process) return true
    this.stopping = true
    const child = this.process
    child.stdin?.end()
    const timeout = setTimeout(() => child.kill(), 10000)
    try { return await this.finished } finally { clearTimeout(timeout) }
  }
  kill(): void { this.stopping = true; this.process?.kill() }
}
