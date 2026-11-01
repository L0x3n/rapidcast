import { safeStorage, shell } from 'electron'
import { makeLayer } from '../../shared/engine'
import { audioSignature, benchmarkCovers, recommendOutput, validateTheme, visualSignature, type DeviceSelection, type SetupCheck, type SetupGoal, type SetupState } from '../../shared/setup'
import { validParams } from '../../shared/widgets'
import type { Engine } from '../engine/controller'
import type { Studio } from '../studio'
import type { Widgets } from '../widgets/service'
import type { AiService } from '../ai/service'
import { SetupStore } from './store'
import { runSetupBenchmark } from './benchmark'
import { themedScenes } from './theme'

export class Setup {
  readonly store: SetupStore
  private revision = 0
  private secure = false
  private controller: AbortController | null = null
  private task: SetupState['task'] = { phase: 'idle', seconds: 0, message: 'Six steps to your first stream. You can also set up local recording.' }
  private themeDraft: SetupState['themeDraft'] = null
  private diagnostics: SetupCheck[] = []
  private closed = false
  constructor(directory: string, private readonly engine: Engine, private readonly studio: Studio, private readonly widgets: Widgets, private readonly ai: AiService,
    private readonly publish: (state: SetupState) => void) { this.store = new SetupStore(directory) }
  async initialize(): Promise<void> {
    try { await this.store.load(); this.secure = await safeStorage.isAsyncEncryptionAvailable() }
    catch (error: unknown) { this.task = { phase: 'error', seconds: 0, message: error instanceof Error ? error.message : 'Setup could not load. Restart the app.' } }
    this.changed()
  }
  private widgetSignature = (): string => JSON.stringify(this.widgets.store.instances.map(item => [item.id, item.params, item.disabled]))
  private checks(): SetupCheck[] {
    const engine = this.engine.snapshot(); const twitch = this.studio.snapshot().twitch; const data = this.store.data
    const expectedEncoder = engine.settings.encoder === 'x264' ? 'libx264' : engine.settings.encoder === 'nvenc' || engine.nvenc === true ? 'h264_nvenc' : engine.nvenc === false ? 'libx264' : ''
    const covered = benchmarkCovers(data.benchmark, engine.settings, data.goal, twitch.account?.id || '', Date.now(), this.widgetSignature()) && data.benchmark?.encoder === expectedEncoder
    const active = engine.settings.scenes[this.studio.snapshot().activeScene].filter(item => item.visible && item.kind === 'widget')
    const widgets = this.widgets.snapshot()
    const widgetReady = active.every(item => widgets.statuses.some(status => status.id === item.id && status.state === 'ready' && status.frames > 0) && !widgets.instances.find(instance => instance.id === item.id)?.disabled)
    const captures = engine.settings.scenes.live.filter(layer => layer.visible && ['display', 'camera'].includes(layer.kind))
    const captureReady = captures.every(layer => layer.source && engine.telemetry?.capabilities.includes(`capture:${layer.kind}:${layer.source}`))
    const audio = engine.settings.audio
    const audioReady = (audio.micId === 'none' || engine.telemetry?.capabilities.includes(`microphone:${audio.micId}`)) && (!audio.desktop || engine.telemetry?.capabilities.includes('desktop-audio-live'))
    return [
      { id: 'storage', title: 'Secure desktop storage', detail: this.secure ? 'Windows encryption is available.' : 'Windows encryption is unavailable. Restart Windows before connecting an account.', state: this.secure ? 'pass' : 'fail', required: data.goal === 'twitch' },
      { id: 'twitch', title: 'Twitch connection', detail: data.goal === 'local' ? 'Local recording selected. Twitch has not been required or tested.' : twitch.phase === 'connected' ? `Connected as @${twitch.account?.login}.` : 'Connect Twitch and wait for chat/events to connect.', state: data.goal === 'local' ? 'info' : twitch.phase === 'connected' && twitch.account ? 'pass' : 'fail', required: data.goal === 'twitch' },
      { id: 'preview', title: 'Program is running', detail: engine.previewActive ? 'The compositor is drawing your selected program.' : 'Start preview and check your selected sources.', state: engine.previewActive && (engine.telemetry?.frames ?? 0) > 0 ? 'pass' : 'fail', required: true },
      { id: 'capture', title: 'Live scene capture tracks', detail: captures.length === 0 ? 'No display/camera selected: widgets-only program.' : captureReady ? 'Selected Live capture tracks are producing frames. Check their actual picture yourself.' : 'A selected Live capture track has not produced frames or has stopped. Select Live, check permissions and refresh devices.', state: captureReady ? 'pass' : 'fail', required: true },
      { id: 'audioTracks', title: 'Selected audio tracks', detail: audioReady ? 'Selected audio tracks are open, or all input devices are explicitly off. Confirm sound/mute/playback yourself.' : 'A selected microphone or desktop-audio track is not open. Review the mixer and Windows permissions.', state: audioReady ? 'pass' : 'fail', required: true },
      { id: 'visual', title: 'Picture checked by you', detail: 'Confirm that the selected game/window/camera is the picture you intend to show.', state: data.visualSignature === visualSignature(engine.settings) && Boolean(data.visualSignature) ? 'pass' : 'fail', required: true },
      { id: 'audio', title: 'Audio checked by you', detail: 'Confirm meters and a playback recording, or explicitly choose no audio.', state: data.audioSignature === audioSignature(engine.settings) ? 'pass' : 'fail', required: true },
      { id: 'widgets', title: 'Active widgets', detail: widgetReady ? `${active.length} visible widgets have rendered. AI is optional.` : 'Wait for widget frames, or restart/remove paused widgets in Studio.', state: widgetReady ? 'pass' : 'fail', required: true },
      { id: 'performance', title: data.goal === 'twitch' ? 'Private sender test' : 'Local encoder test', detail: covered ? data.goal === 'twitch' ? '15-second sender check passed for this program/load. Inspect delivery in Twitch Inspector.' : '15-second local check passed. Internet upload has not been measured.' : 'Run a stable 15-second test for this program and output. Results expire after 30 minutes.', state: covered ? 'pass' : 'fail', required: true },
      { id: 'inspector', title: 'Twitch Inspector reviewed by you', detail: data.goal === 'local' ? 'Not required for local recording.' : 'Confirm that Twitch Inspector received the private test without an ingestion problem.', state: data.goal === 'local' ? 'info' : covered && data.inspectorId === data.benchmark?.id ? 'pass' : 'fail', required: data.goal === 'twitch' },
      { id: 'beta', title: 'Engine beta', detail: 'Short setup checks do not replace the ten-minute minimized/fullscreen-game and real audio-sync acceptance. OBS URLs remain available in Studio.', state: 'info', required: false }
    ]
  }
  snapshot(): SetupState { return { ...this.store.data, revision: this.revision, secureStorage: this.secure, checks: this.checks(), recommendation: this.store.data.benchmark ? recommendOutput(this.store.data.benchmark) : null, task: this.task, themeDraft: this.themeDraft, diagnostics: this.diagnostics } }
  private changed(): void { if (!this.closed) { this.revision++; this.publish(this.snapshot()) } }
  observed(): void { this.changed() }
  private idle(): void { if (this.controller) throw new Error('Finish or cancel the current setup task first.'); if (this.engine.snapshot().mode) throw new Error('Stop current output before changing setup.') }
  private async saved(): Promise<void> { await this.store.save(); this.changed() }
  async step(step: number, goal: SetupGoal): Promise<void> { this.store.data.step = step; this.store.data.goal = goal; await this.saved() }
  async discover(): Promise<void> {
    this.idle(); this.task = { phase: 'discovering', seconds: 0, message: 'Finding display/window, camera and microphone choices. Capture starts only after Apply.' }; this.changed()
    try { await this.engine.listSources(); await this.engine.refreshDevices(); this.task = { phase: 'done', seconds: 0, message: 'Device choices refreshed. Pick what to capture, then Apply.' } }
    catch (error: unknown) { this.task = { phase: 'error', seconds: 0, message: error instanceof Error ? error.message : 'Device discovery failed. Check Windows permissions.' }; throw error }
    finally { this.changed() }
  }
  async devices(selection: DeviceSelection): Promise<void> {
    this.idle()
    const state = this.engine.snapshot()
    if (selection.displayId !== 'none' && !state.sources.some(item => item.id === selection.displayId)) throw new Error('Refresh devices and choose an available display/window.')
    if (selection.cameraId !== 'none' && selection.cameraId !== 'default' && !state.cameras.some(item => item.id === selection.cameraId)) throw new Error('Refresh devices and choose an available camera.')
    if (selection.micId !== 'none' && selection.micId !== 'default' && !state.microphones.some(item => item.id === selection.micId)) throw new Error('Refresh devices and choose an available microphone.')
    const settings = structuredClone(state.settings)
    const old = settings.scenes.live
    settings.scenes.live = old.filter(layer => !['display', 'camera'].includes(layer.kind))
    if (selection.displayId !== 'none') settings.scenes.live.push({ ...old.find(layer => layer.kind === 'display') ?? { ...makeLayer('setup-display', 'display'), z: 1 }, name: 'Main capture', source: selection.displayId, visible: true })
    if (selection.cameraId !== 'none') settings.scenes.live.push({ ...old.find(layer => layer.kind === 'camera') ?? makeLayer('setup-camera', 'camera'), name: 'Camera', source: selection.cameraId, visible: true })
    settings.audio = { ...settings.audio, micId: selection.micId, desktop: selection.desktop }
    await this.engine.configure(settings); await this.studio.selectScene('live'); await this.engine.preview(); await this.engine.refreshDevices()
    this.store.data.completed = false; await this.saved()
  }
  async confirm(kind: 'visual' | 'audio' | 'inspector', checked: boolean): Promise<void> {
    if (kind === 'visual') this.store.data.visualSignature = checked ? visualSignature(this.engine.snapshot().settings) : ''
    if (kind === 'audio') this.store.data.audioSignature = checked ? audioSignature(this.engine.snapshot().settings) : ''
    if (kind === 'inspector') {
      if (checked && this.store.data.benchmark?.kind !== 'twitch') throw new Error('Run a private Twitch test before confirming Inspector.')
      this.store.data.inspectorId = checked ? this.store.data.benchmark!.id : ''
    }
    await this.saved()
  }
  test(kind: SetupGoal): void {
    this.idle()
    if (this.studio.snapshot().activeScene !== 'live') throw new Error('Select the Live scene before testing so the check includes your chosen capture and widgets.')
    const twitch = this.studio.snapshot().twitch
    if (kind === 'twitch' && (!twitch.account || twitch.phase !== 'connected')) throw new Error('Connect Twitch before its private test. A local test cannot verify internet delivery.')
    const controller = new AbortController(); this.controller = controller
    this.store.data.benchmark = null; this.store.data.inspectorId = ''; this.store.data.completed = false
    this.task = { phase: 'starting', seconds: 0, message: 'Starting a 15-second test. Current program and selected audio will be encoded.' }; this.changed()
    void runSetupBenchmark(this.engine, kind, kind === 'twitch' ? twitch.account!.id : '', this.widgetSignature, controller.signal, (seconds, message) => {
      if (!controller.signal.aborted) { this.task = { phase: message.startsWith('Finishing') ? 'stopping' : 'testing', seconds, message }; this.changed() }
    }).then(async result => {
      if (controller.signal.aborted) return
      this.store.data.benchmark = result
      this.task = { phase: 'done', seconds: 15, message: result.stable ? kind === 'twitch' ? 'Private sender test finished. Review Twitch Inspector and your recommendation.' : 'Local encoder test finished. Internet delivery has not been tested.' : 'The test was unstable. Apply the lighter recommendation, reduce source load and retest.' }
      await this.saved()
    }).catch((error: unknown) => {
      this.task = { phase: controller.signal.aborted ? 'cancelled' : 'error', seconds: 0, message: controller.signal.aborted ? 'Setup test cancelled. No test was approved.' : error instanceof Error ? error.message : 'Setup test failed. Check sources/output and retry.' }; this.changed()
    }).finally(() => { if (this.controller === controller) this.controller = null; this.changed() })
  }
  async recommendation(): Promise<void> {
    this.idle(); const result = this.store.data.benchmark
    if (!result) throw new Error('Run a test before applying its recommendation.')
    const recommended = recommendOutput(result)
    await this.engine.configure({ ...this.engine.snapshot().settings, resolution: recommended.resolution, fps: recommended.fps, bitrate: recommended.bitrate, encoder: recommended.encoder }); this.changed()
  }
  generateTheme(prompt: string): void {
    this.idle(); const controller = new AbortController(); this.controller = controller
    this.task = { phase: 'styling', seconds: 0, message: 'Asking your model for a palette, supported font and layout. Nothing is applied yet.' }; this.changed()
    void this.ai.proposeTheme(prompt, controller.signal).then(theme => { if (!controller.signal.aborted) { this.themeDraft = theme; this.task = { phase: 'done', seconds: 0, message: 'Style preview ready. Review all four layouts, then Apply.' }; this.changed() } })
      .catch((error: unknown) => { if (!controller.signal.aborted) { this.task = { phase: 'error', seconds: 0, message: error instanceof Error ? error.message : 'Style generation failed. Choose a preset instead.' }; this.changed() } })
      .finally(() => { if (this.controller === controller) this.controller = null; this.changed() })
  }
  previewTheme(theme: unknown): void { this.idle(); this.themeDraft = validateTheme(theme); this.changed() }
  async applyTheme(): Promise<void> {
    this.idle(); const theme = this.themeDraft
    if (!theme) throw new Error('Preview a theme before applying it.')
    const settings = themedScenes(this.engine.snapshot().settings, theme)
    await this.engine.configure(settings)
    for (const instance of this.widgets.store.instances) {
      const layer = Object.values(settings.scenes).flat().find(item => item.id === instance.id)
      const definition = this.widgets.store.definitions.find(item => item.id === layer?.source)
      if (!definition?.builtin) continue
      instance.params = validParams(definition.meta.params, { ...instance.params, ...(definition.meta.params.accent ? { accent: theme.accent } : {}), ...(definition.meta.params.font ? { font: theme.font } : {}) })
    }
    await this.widgets.store.save(); this.widgets.engineChanged({ ...settings, scenes: structuredClone(settings.scenes) }); this.widgets.refresh()
    this.store.data.theme = theme; this.store.data.completed = false; this.task = { phase: 'done', seconds: 0, message: 'Style applied. Check the updated picture and repeat Performance for this final program.' }; await this.saved()
  }
  repair(): void {
    this.idle(); const controller = new AbortController(); this.controller = controller
    this.engine.setupRepairActive = true
    this.store.data.benchmark = null; this.store.data.inspectorId = ''; this.store.data.completed = false; this.diagnostics = []
    this.task = { phase: 'repairing', seconds: 0, message: 'Checking storage, encoders, devices, overlay, saved Twitch connection and configured AI.' }; this.changed()
    const check = async (id: string, title: string, action: () => Promise<string>): Promise<void> => {
      if (controller.signal.aborted) return
      try { const detail = await action(); this.diagnostics.push({ id, title, detail, state: 'pass', required: false }) }
      catch (error: unknown) { this.diagnostics.push({ id, title, detail: error instanceof Error ? error.message : 'This check failed. Review its settings.', state: 'fail', required: false }) }
      this.changed()
    }
    void (async () => {
      await check('storage', 'Secure storage', async () => { this.secure = await safeStorage.isAsyncEncryptionAvailable(); if (!this.secure) throw new Error('Windows encryption unavailable. Restart Windows.'); return 'Windows encryption available.' })
      await check('encoder', 'Encoder', async () => { await this.engine.refreshEncoder(); return this.engine.snapshot().nvenc ? 'NVENC probe passed.' : 'Use CPU encoding; NVENC probe did not pass.' })
      await check('devices', 'Device discovery', async () => { await this.engine.listSources(); await this.engine.refreshDevices(); return 'Choices refreshed. Devices are not captured by this check.' })
      await check('overlay', 'Local overlay', async () => { const response = await fetch(`${this.widgets.server.baseUrl}/api/snapshot`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) }); const ok = response.ok; await response.body?.cancel(); if (!ok) throw new Error('Restart RapidCast to restore its overlay server.'); return 'Loopback overlay server responds.' })
      if (this.studio.snapshot().twitch.clientId) await check('twitch', 'Saved Twitch connection', async () => { await this.studio.retry(); return 'Saved login validated; live event connection is reconnecting.' })
      if (this.ai.snapshot().settings.model) await check('ai', 'AI completion', async () => { await this.ai.test(); return 'Configured model returned text.' })
      this.task = { phase: controller.signal.aborted ? 'cancelled' : 'done', seconds: 0, message: 'Checks finished. Review results, recheck the picture/audio, then rerun the 15-second test. Existing layers and credentials were kept.' }; await this.saved()
    })().catch(() => { this.task = { phase: 'error', seconds: 0, message: 'Repair could not finish. Review Settings and retry.' }; this.changed() })
      .finally(() => { this.engine.setupRepairActive = false; if (this.controller === controller) this.controller = null; this.changed() })
  }
  async finish(start: boolean): Promise<void> {
    this.idle()
    if (this.checks().some(item => item.required && item.state !== 'pass')) throw new Error('Finish the required readiness checks before starting or saving setup.')
    if (start) await this.engine.startOutput(this.store.data.goal === 'twitch' ? 'live' : 'record')
    this.store.data.completed = true; this.store.data.step = 5; await this.saved()
  }
  inspector(): Promise<void> { return shell.openExternal('https://inspector.twitch.tv') }
  cancel(): void { this.controller?.abort(); if (this.engine.setupTestActive) void this.engine.stopOutput().catch(() => undefined); this.task = { phase: 'cancelled', seconds: 0, message: 'Setup task cancelled. Existing layers and credentials are kept.' }; this.changed() }
  close(): void { this.closed = true; this.controller?.abort() }
}
