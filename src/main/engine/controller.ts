import { BrowserWindow, powerSaveBlocker, shell } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { ENGINE_IPC, defaultEngineSettings, validateEngineSettings, type EngineState, type EngineCommand, type EngineTelemetry, type DeviceChoice } from '../../shared/engine'
import type { SceneId } from '../../shared/scenes'
import { Encoder, probeNvenc } from './encoder'
import { configureCapturePermissions, captureSources } from './capture'
import { Assets } from './assets'
import type { Storage } from '../storage'

export class Engine {
  private state: EngineState = { revision: 0, phase: 'idle', previewActive: false, mode: null,
    message: 'Start the compositor to preview or record your program.', settings: defaultEngineSettings(),
    telemetry: null, encoder: '', encoderFps: 0, encodedFrames: 0, bitrateKbps: null, outputDropped: 0,
    outputDuplicated: 0, queueBytes: 0, elapsedSeconds: 0, recordingPath: null, diagnosticsPath: null,
    preview: null, sources: [], cameras: [], microphones: [], nvenc: null }
  window: BrowserWindow | null = null
  url = ''
  private ready: (() => void) | null = null
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private encoder: Encoder | null = null
  private runId = ''
  private target: string | null = null
  private wantOutput = false
  private stopping: Promise<void> | null = null
  private restarting = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private restartCount = 0
  private blocker: number | null = null
  private heartbeat = 0
  private lastChunk = 0
  private outputEpoch = 0
  private watch: ReturnType<typeof setInterval> | null = null
  private logQueue: Promise<void> = Promise.resolve()
  private selectCapture: ((id: string) => Promise<void>) | null = null
  private forceCpu = false
  private recovering: Promise<void> | null = null
  private disposing: Promise<void> | null = null
  private scene: SceneId = 'starting'
  readonly assets: Assets
  testPattern = false

  constructor(private readonly storage: Storage, private readonly directory: string, private readonly recordings: string,
    private readonly targetFor: (test: boolean) => Promise<string>, private readonly publish: (state: EngineState) => void) {
    this.assets = new Assets(join(directory, 'assets'))
  }
  snapshot(): EngineState { return this.state }
  private update(value: Partial<EngineState> = {}): void { this.state = { ...this.state, ...value, revision: this.state.revision + 1 }; this.publish(this.state) }
  async initialize(): Promise<void> {
    try { this.update({ settings: await this.storage.engineSettings() }) }
    catch (error: unknown) { this.update({ phase: 'error', message: error instanceof Error ? error.message : 'Output settings could not be loaded.' }) }
    void probeNvenc().then(nvenc => this.update({ nvenc })).catch(() => this.update({ nvenc: false }))
  }
  rendererReady(): void { this.ready?.(); this.ready = null }
  reply(id: string, error: string | null): void {
    const pending = this.pending.get(id)
    if (!pending) return
    clearTimeout(pending.timer); this.pending.delete(id)
    if (error) pending.reject(new Error(error.slice(0, 400)))
    else pending.resolve()
  }
  private async command(type: EngineCommand['type']): Promise<void> {
    const window = this.window
    if (!window || window.isDestroyed()) throw new Error('The compositor is not running. Start preview and try again.')
    const id = randomUUID()
    const command: EngineCommand = { id, type, settings: this.state.settings, scene: this.scene, runId: this.runId, testPattern: this.testPattern }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The compositor did not respond. Stop output and restart preview.')) }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      window.webContents.send(ENGINE_IPC.command, command)
    })
  }
  private async ensureWindow(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) return
    const file = join(__dirname, '../renderer/engine.html')
    this.url = process.env.ELECTRON_RENDERER_URL ? new URL('engine.html', process.env.ELECTRON_RENDERER_URL).href : pathToFileURL(file).href
    const window = new BrowserWindow({ show: false, width: 1920, height: 1080, title: 'RapidCast compositor',
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--rapidcast-compositor'],
        nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', partition: 'rapidcast-engine' } })
    this.window = window
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    this.selectCapture = configureCapturePermissions(window, this.url, () => this.state.settings)
    window.webContents.on('render-process-gone', () => { this.fault('The compositor stopped. Restart preview before starting output again.') })
    window.on('closed', () => { this.window = null })
    let timeout: ReturnType<typeof setTimeout> | null = null
    const ready = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('The compositor could not start. Rebuild and restart RapidCast.')), 15000)
      this.ready = () => { if (timeout) clearTimeout(timeout); resolve() }
    })
    try { await Promise.all([window.loadURL(this.url), ready]) } catch {
      if (timeout) clearTimeout(timeout)
      window.destroy(); this.window = null
      throw new Error('The compositor page could not load. Run npm run build, then restart RapidCast.')
    }
  }
  async configure(input: unknown): Promise<void> {
    const settings = validateEngineSettings(input)
    if (this.wantOutput && (settings.fps !== this.state.settings.fps || settings.bitrate !== this.state.settings.bitrate || settings.encoder !== this.state.settings.encoder || settings.recordWhileLive !== this.state.settings.recordWhileLive)) throw new Error('Stop output before changing FPS, bitrate, encoder or recording settings.')
    await this.storage.saveEngineSettings(settings)
    this.update({ settings })
    if (this.state.previewActive) await this.command('configure')
  }
  async setScene(scene: SceneId): Promise<void> {
    if (this.scene === scene) return
    this.scene = scene
    if (this.state.previewActive) await this.command('configure')
  }
  async listSources(): Promise<void> { this.update({ sources: await captureSources() }) }
  async prepareCapture(id: string): Promise<void> { await this.selectCapture?.(id) }
  devices(cameras: DeviceChoice[], microphones: DeviceChoice[]): void { this.update({ cameras, microphones }) }
  async preview(): Promise<void> {
    if (this.recovering) await this.recovering
    if (this.state.previewActive) return
    await this.ensureWindow()
    const log = join(this.directory, 'diagnostics', `frames-${Date.now()}.jsonl`)
    await mkdir(join(this.directory, 'diagnostics'), { recursive: true })
    this.update({ diagnosticsPath: log })
    try { await this.command('preview') } catch (error: unknown) {
      await this.command('pause').catch(() => undefined)
      this.update({ phase: 'error', message: error instanceof Error ? error.message : 'Preview could not start.' })
      throw error
    }
    this.heartbeat = Date.now()
    this.blocker = powerSaveBlocker.start('prevent-app-suspension')
    this.watch = setInterval(() => {
      if (Date.now() - this.heartbeat > 8000) this.fault('The compositor stopped sending frames. Stop output and restart preview.')
      else if (this.wantOutput && this.encoder && Date.now() - this.lastChunk > 8000 && !this.restartTimer && !this.restarting) this.scheduleRestart()
    }, 2000)
    this.update({ previewActive: true, phase: 'preview', message: 'Program preview is running in a separate unthrottled compositor.' })
  }
  telemetry(value: EngineTelemetry): void {
    this.heartbeat = Date.now()
    this.update({ telemetry: value, queueBytes: this.encoder?.queuedBytes ?? 0 })
    const path = this.state.diagnosticsPath
    if (path) this.logQueue = this.logQueue.then(() => appendFile(path, JSON.stringify({ at: new Date().toISOString(), ...value,
      mode: this.state.mode, encoder: this.state.encoder, encodedFrames: this.state.encodedFrames, outputDropped: this.state.outputDropped }) + '\n')).catch(() => {
        this.update({ diagnosticsPath: null, message: 'Frame timing could not be saved. Check disk space before the stream acceptance test.' })
      })
  }
  thumbnail(data: ArrayBuffer): void {
    if (data.byteLength < 200000) this.update({ preview: `data:image/jpeg;base64,${Buffer.from(data).toString('base64')}` })
  }
  async startOutput(mode: 'record' | 'test' | 'live', privateTarget?: string): Promise<void> {
    if (this.wantOutput || this.stopping) throw new Error('Output is already starting or running. Stop it first.')
    const epoch = ++this.outputEpoch
    this.wantOutput = true
    this.update({ mode, phase: 'starting', message: mode === 'record' ? 'Starting local recording.' : mode === 'test' ? 'Starting a private Twitch bandwidth test.' : 'Starting your Twitch stream.' })
    try {
      const target = mode === 'record' ? null : privateTarget ?? await this.targetFor(mode === 'test')
      if (epoch !== this.outputEpoch || !this.wantOutput) throw new Error('Output was cancelled before it started.')
      this.target = target
      await this.preview()
      if (epoch !== this.outputEpoch || !this.wantOutput) throw new Error('Output was cancelled before it started.')
      this.forceCpu = false; this.restartCount = 0; this.wantOutput = true
      this.update({ mode, phase: 'starting', elapsedSeconds: 0 })
      await this.launch()
    } catch (error: unknown) {
      if (epoch === this.outputEpoch) {
        this.wantOutput = false
        await this.encoder?.stop(); this.encoder = null; this.target = null
        this.update({ mode: null, phase: 'error', message: error instanceof Error ? error.message : 'Output could not start.' })
      }
      throw error
    }
  }
  private async launch(): Promise<void> {
    const epoch = this.outputEpoch
    const settings = this.state.settings
    const nvenc = this.state.nvenc ?? await probeNvenc()
    const encoder = !this.forceCpu && settings.encoder !== 'x264' && (settings.encoder === 'nvenc' || nvenc) ? 'h264_nvenc' : 'libx264'
    const recording = this.state.mode === 'record' || settings.recordWhileLive ? join(this.recordings, `RapidCast-${Date.now()}-${this.restartCount}.mp4`) : null
    if (recording) await mkdir(this.recordings, { recursive: true })
    if (!this.wantOutput || epoch !== this.outputEpoch) throw new Error('Output was cancelled before it started.')
    this.runId = randomUUID()
    const runId = this.runId
    const process = new Encoder({
      progress: value => {
        if (runId !== this.runId) return
        this.update({ encoderFps: value.fps, encodedFrames: value.frames, bitrateKbps: value.bitrate,
          elapsedSeconds: value.seconds, outputDropped: value.dropped, outputDuplicated: value.duplicated,
          ...(this.state.phase === 'starting' && value.frames > 0 ? { phase: this.state.mode === 'record' ? 'recording' as const : 'streaming' as const,
            message: this.state.mode === 'record' ? 'Recording locally.' : this.state.mode === 'test' ? 'Sending a private bandwidth test. This does not go public.' : 'Sending your program to Twitch.' } : {}) })
      },
      problem: (message, reconnect, gpu) => {
        if (runId !== this.runId || !this.wantOutput) return
        if (gpu && settings.encoder !== 'x264') this.forceCpu = true
        this.update({ message, ...(reconnect ? { phase: 'reconnecting' as const } : message === 'Twitch output reconnected.' ? { phase: 'streaming' as const } : {}) })
      },
      closed: expected => {
        if (!expected && this.wantOutput && runId === this.runId) {
          if (this.target || this.forceCpu) this.scheduleRestart()
          else this.fault('The encoder stopped unexpectedly. Check output settings and available disk space, then restart recording.')
        }
      }
    })
    this.encoder = process
    this.lastChunk = Date.now()
    this.update({ encoder, nvenc, recordingPath: recording, encodedFrames: 0, encoderFps: 0, bitrateKbps: null })
    process.start(settings, encoder, this.target, recording)
    await this.command('record')
  }
  private scheduleRestart(): void {
    if (this.restartTimer || this.restarting || !this.wantOutput) return
    if (++this.restartCount > 5) { this.fault('Output could not recover after five attempts. Stop output, check Twitch and your encoder, then try again.'); return }
    this.update({ phase: 'reconnecting', message: this.forceCpu ? 'NVENC stopped. Restarting output with the CPU encoder.' : 'Output stopped. Rebuilding the video stream and reconnecting automatically.' })
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.restart()
    }, Math.min(15000, 1000 * 2 ** (this.restartCount - 1)))
  }
  private async restart(): Promise<void> {
    this.restarting = true
    try {
      await this.command('end-record')
      await this.encoder?.stop()
      if (this.wantOutput) await this.launch()
    } catch { if (this.wantOutput) this.fault('Output could not restart. Stop output, check the connection and try again.') }
    finally { this.restarting = false }
  }
  async chunk(runId: string, sequence: number, data: ArrayBuffer): Promise<void> {
    if (runId !== this.runId || !this.encoder) throw new Error('This video input belongs to an older output session.')
    this.lastChunk = Date.now()
    try { await this.encoder.write(sequence, data) } catch (error: unknown) {
      if (this.wantOutput && !this.stopping && runId === this.runId) this.scheduleRestart()
      throw error
    }
  }
  async stopOutput(): Promise<void> {
    if (this.stopping) return this.stopping
    if (!this.wantOutput && !this.encoder) return
    this.wantOutput = false
    this.outputEpoch++
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.update({ phase: 'stopping', message: 'Finishing the current video and audio.' })
    this.stopping = (async () => {
      try { await this.command('end-record') } catch { /* FFmpeg still needs its input closed if the renderer has stopped. */ }
      const clean = await this.encoder?.stop()
      this.encoder = null; this.target = null; this.runId = ''
      this.update({ mode: null, phase: this.state.previewActive ? 'preview' : 'idle', queueBytes: 0,
        message: clean === false ? 'Output stopped. The last recording may be incomplete; inspect it before sharing.' : this.state.recordingPath ? 'Output stopped. Your recording is saved in the recordings folder.' : 'Output stopped. No local recording was enabled.' })
    })().finally(() => { this.stopping = null })
    return this.stopping
  }
  async pause(): Promise<void> {
    await this.stopOutput()
    if (this.state.previewActive) await this.command('pause')
    this.releaseBlocker()
    await this.logQueue
    this.update({ previewActive: false, phase: 'idle', telemetry: null, preview: null, message: 'Compositor stopped. Devices have been released.' })
  }
  fault(message: string): void {
    if (this.recovering || this.disposing) return
    this.wantOutput = false; this.outputEpoch++; this.encoder?.kill(); this.encoder = null; this.target = null; this.runId = ''
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.releaseBlocker()
    this.update({ phase: 'error', message: message.slice(0, 400), mode: null, previewActive: false })
    this.recovering = this.command('pause').catch(() => { this.window?.destroy(); this.window = null }).finally(() => { this.recovering = null })
  }
  notice(message: string): void { this.update({ message: message.slice(0, 400) }) }
  private releaseBlocker(): void {
    if (this.watch) clearInterval(this.watch)
    this.watch = null
    if (this.blocker !== null && powerSaveBlocker.isStarted(this.blocker)) powerSaveBlocker.stop(this.blocker)
    this.blocker = null
  }
  async revealRecording(): Promise<void> { if (this.state.recordingPath) shell.showItemInFolder(this.state.recordingPath) }
  async dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.disposing = (async () => {
      try { await this.pause() } catch { this.encoder?.kill() }
      finally {
        this.releaseBlocker(); this.encoder?.kill(); this.window?.destroy(); this.window = null
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('The compositor was closed.')) }
        this.pending.clear()
      }
    })()
    return this.disposing
  }
}
