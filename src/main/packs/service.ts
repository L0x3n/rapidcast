import { randomUUID } from 'node:crypto'
import { writeFile, rename, unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import { record } from '../../shared/events'
import { PACK_LIMIT, type OverlayPack, type PackReview, type PackState } from '../../shared/packs'
import { packCases, packMetadata, parsePack, validatePack } from '../../shared/pack-validation'
import { validateWidgetCode } from '../../shared/widget-validation'
import type { Engine } from '../engine/controller'
import type { Widgets } from '../widgets/service'
import type { Setup } from '../setup/service'
import type { AiService } from '../ai/service'
import type { SetupData } from '../../shared/setup'
import { SandboxTest } from '../ai/sandbox'
import { boundedRead, commitPackFiles } from './files'
import { checkPng } from './images'
import { exportLayout, installLayout } from './layout'

export interface PackChooser { open(): Promise<string | null>; save(name: string): Promise<string | null> }
export class Packs {
  private state: PackState = { revision: 0, phase: 'idle', review: null, completed: 0, total: 0, message: 'Share four scenes, widget code, parameters, theme and embedded images in one .rcpack file.' }
  private draft: { id: string; pack: OverlayPack; tested: boolean } | null = null
  private controller: AbortController | null = null
  private working = false
  private closed = false
  private pending: Promise<void> = Promise.resolve()
  private readonly sandbox: SandboxTest
  constructor(private readonly directory: string, private readonly engine: Engine, private readonly widgets: Widgets, private readonly setup: Setup,
    private readonly ai: AiService, private readonly version: string, private readonly chooser: PackChooser, private readonly publish: (state: PackState) => void,
    sandbox?: SandboxTest) { this.sandbox = sandbox ?? new SandboxTest(widgets) }
  snapshot(): PackState { return this.state }
  private changed(): void { this.state = { ...this.state, revision: this.state.revision + 1 }; if (!this.closed) this.publish(this.state) }
  private idle(): void { if (this.closed || this.working) throw new Error('Finish or cancel the current pack action first.') }
  private offline(): void {
    if (this.engine.snapshot().mode || ['starting', 'stopping'].includes(this.engine.snapshot().phase)) throw new Error('Stop output before testing or installing a pack.')
    if (this.engine.setupTestActive || this.engine.setupRepairActive || ['discovering', 'starting', 'testing', 'stopping', 'styling', 'repairing'].includes(this.setup.snapshot().task.phase)) throw new Error('Finish or cancel the setup task first.')
    if (['writing', 'testing', 'fixing', 'publishing'].includes(this.ai.snapshot().job.phase)) throw new Error('Finish or cancel the current AI widget build first.')
  }
  private job(work: () => Promise<void>): Promise<void> {
    this.working = true
    this.pending = work().catch((error: unknown) => { this.state.phase = this.state.phase === 'cancelled' || this.closed || this.controller?.signal.aborted ? 'cancelled' : 'error'; this.state.message = this.state.phase === 'cancelled' ? 'Pack testing cancelled. The current layout was kept.' : error instanceof Error ? error.message : 'The pack action failed. Review the file and retry.'; this.changed(); throw error })
      .finally(() => { this.working = false })
    return this.pending
  }
  export(input: unknown): Promise<void> {
    this.idle()
    return this.job(async () => {
      const v = record(input); const metadata = packMetadata({ name: v.name, author: v.author, description: v.description, createdAt: new Date().toISOString(), appVersion: this.version })
      if (typeof v.preview !== 'string') throw new Error('Create a layout thumbnail before exporting.')
      const preview = `data:image/png;base64,${checkPng(v.preview, true).toString('base64')}`
      const settings = structuredClone(this.engine.snapshot().settings); const widgets = structuredClone(this.widgets.snapshot()); const theme = structuredClone(this.setup.store.data.theme)
      this.state.phase = 'exporting'; this.state.message = 'Preparing portable scene data and embedded images. Capture identities and host settings are omitted.'; this.changed()
      const pack = await exportLayout(settings, widgets, theme, metadata, preview, id => this.engine.assets.data(id))
      this.checkImages(pack)
      const source = JSON.stringify(pack, null, 2); if (Buffer.byteLength(source) > PACK_LIMIT) throw new Error('The exported pack exceeds 16 MB. Reduce images or widget code before exporting.')
      const path = await this.chooser.save(metadata.name.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || 'RapidCast overlay')
      if (!path) { this.state.phase = this.draft ? this.draft.tested ? 'ready' : 'review' : 'idle'; this.state.message = 'Export cancelled.'; this.changed(); return }
      if (this.closed) throw new Error('Export cancelled.')
      const temp = `${path}.${randomUUID()}.tmp`
      try { await writeFile(temp, source, { mode: 0o600 }); await rename(temp, path) } catch { await unlink(temp).catch(() => undefined); throw new Error('The pack could not be saved. Choose a writable folder with enough disk space.') }
      this.state.phase = this.draft ? this.draft.tested ? 'ready' : 'review' : 'done'; this.state.message = `Exported ${basename(path)}. Review its text, code and images before sharing.`; this.changed()
    })
  }
  open(): Promise<void> {
    this.idle()
    return this.job(async () => {
      const path = await this.chooser.open(); if (!path || this.closed) return
      this.draft = null; this.state = { ...this.state, phase: 'reading', review: null, completed: 0, total: 0, message: 'Validating the selected pack. No widget code is running.' }; this.changed()
      let source: string
      try { source = await boundedRead(path) } catch { throw new Error('This pack could not be read. Choose a regular .rcpack file smaller than 16 MB.') }
      const pack = parsePack(source); this.checkImages(pack)
      if (this.closed) return
      const id = randomUUID(); this.draft = { id, pack, tested: false }
      const review: PackReview = { id, metadata: pack.metadata, preview: pack.preview, theme: pack.theme, transition: pack.transition, scenes: structuredClone(pack.scenes),
        definitions: pack.definitions.map(d => { const meta = validateWidgetCode(d.code).meta; return { id: d.id, code: d.code, credit: d.credit, name: meta.name, description: meta.description } }), images: pack.assets.length, placeholders: Object.values(pack.scenes).flat().filter(l => l.kind === 'display' || l.kind === 'camera').length, testCases: packCases(pack).length }
      this.state = { ...this.state, phase: 'review', review, total: review.testCases, message: 'Review the contents and source code, then run the isolated three-second tests. Installation replaces all four scenes.' }; this.changed()
    })
  }
  private checkImages(pack: OverlayPack): void {
    pack.preview = `data:image/png;base64,${checkPng(pack.preview, true).toString('base64')}`; let bytes = 0
    for (const asset of pack.assets) { const png = checkPng(asset.data); bytes += png.length; asset.data = `data:image/png;base64,${png.toString('base64')}` }
    if (bytes > 8 * 1024 * 1024) throw new Error('Embedded images exceed the 8 MB combined limit. Ask the author to export smaller images.')
  }
  test(id: string): void {
    this.idle(); this.offline(); const draft = this.current(id); draft.tested = false
    const controller = new AbortController(); this.controller = controller; this.engine.packOperationActive = true
    this.state.phase = 'testing'; this.state.completed = 0; this.state.total = packCases(draft.pack).length; this.changed()
    void this.job(async () => {
      try {
        await this.flush()
        for (const item of packCases(draft.pack)) {
          if (controller.signal.aborted) throw new Error('Pack testing cancelled. The current layout was kept.')
          this.state.message = `Testing ${validateWidgetCode(item.definition.code).meta.name} with its imported parameters and size (${this.state.completed + 1}/${this.state.total}).`; this.changed()
          const sample = new AbortController()
          try { const result = await this.sandbox.run(item.definition.code, AbortSignal.any([controller.signal, sample.signal]), { params: item.params, width: item.width, height: item.height }); this.widgets.discardCandidate(result.id) }
          finally { sample.abort() }
          this.state.completed++; this.changed()
        }
        if (controller.signal.aborted || this.closed) throw new Error('Pack testing cancelled. The current layout was kept.')
        draft.tested = true; this.state.phase = 'ready'; this.state.message = 'All imported configurations passed their three-second sandbox tests. Review once more, then explicitly replace the four scene layouts.'; this.changed()
      } finally { this.engine.packOperationActive = false; if (this.controller === controller) this.controller = null; await this.widgets.finishPackOperation() }
    }).catch(() => undefined)
  }
  install(id: string): Promise<void> {
    this.idle(); this.offline(); const draft = this.current(id); if (!draft.tested) throw new Error('Run and pass the sandbox tests before installing this pack.')
    this.engine.packOperationActive = true; this.state.phase = 'installing'; this.state.message = 'Saving the reviewed layout. Preview is stopped; capture sources will need your selection.'; this.changed()
    return this.job(async () => {
      try {
        await this.engine.pause(); await this.flush()
        const pack = validatePack(draft.pack); const assets = new Map<string, string>()
        for (const asset of pack.assets) assets.set(asset.id, await this.engine.assets.installPng(checkPng(asset.data)))
        const next = installLayout(pack, this.engine.snapshot().settings, this.widgets.store, assets)
        const before = { settings: structuredClone(this.engine.snapshot().settings), definitions: structuredClone(this.widgets.store.definitions), instances: structuredClone(this.widgets.store.instances), transition: this.widgets.store.transition, setup: structuredClone(this.setup.store.data) }
        const setup: SetupData = { ...before.setup, theme: pack.theme, completed: false, visualSignature: '', audioSignature: '', inspectorId: '', benchmark: null }
        const apply = (state: typeof next, theme: typeof setup, transition: typeof pack.transition): void => { this.widgets.adoptPack(state.definitions, state.instances, transition); this.engine.adoptPack(state.settings); this.widgets.refresh(); this.setup.store.data = theme; this.setup.observed() }
        await commitPackFiles(this.directory, { 'engine.json': JSON.stringify(next.settings), 'widgets.json': this.widgets.store.serialized(next.definitions, next.instances, pack.transition), 'setup.json': JSON.stringify(setup) },
          () => apply(next, setup, pack.transition), () => apply(before, before.setup, before.transition))
        this.draft = null; this.state.phase = 'done'; this.state.review = null; this.state.message = `Installed ${pack.metadata.name}. Bind capture placeholders, start preview and check all four scenes. Setup performance and human checks must be repeated.`; this.changed()
      } finally { this.engine.packOperationActive = false; await this.widgets.finishPackOperation() }
    })
  }
  private current(id: string): NonNullable<Packs['draft']> { if (!this.draft || this.draft.id !== id) throw new Error('Open the current pack preview first.'); return this.draft }
  private async flush(): Promise<void> { await this.engine.flushSettings(); await this.widgets.store.flush(); await this.setup.store.flush() }
  cancel(): void { if (this.state.phase === 'installing' || this.state.phase === 'exporting') throw new Error('Wait for file saving to finish.'); this.controller?.abort(); if (this.draft) this.draft.tested = false; this.state.phase = 'cancelled'; this.state.message = 'Pack testing cancelled. The current layout was kept.'; this.changed() }
  async close(): Promise<void> { this.closed = true; this.controller?.abort(); await this.pending.catch(() => undefined) }
}
