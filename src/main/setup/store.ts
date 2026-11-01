import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { record } from '../../shared/events'
import { validateTheme, type SetupData, type SetupBenchmark } from '../../shared/setup'

export class SetupStore {
  data: SetupData = { step: 0, completed: false, goal: 'twitch', visualSignature: '', audioSignature: '', inspectorId: '', theme: null, benchmark: null }
  private writes = Promise.resolve()
  constructor(private readonly directory: string) {}
  async load(): Promise<void> {
    let source: string
    try { source = await readFile(join(this.directory, 'setup.json'), 'utf8') } catch (error: unknown) { if (record(error).code === 'ENOENT') return; throw new Error('Setup progress could not be read. Check the app data folder permissions.') }
    try {
      if (source.length > 300000) throw new Error('Too large')
      const v = record(JSON.parse(source))
      if (!Number.isInteger(v.step) || Number(v.step) < 0 || Number(v.step) > 5 || typeof v.completed !== 'boolean' || !['twitch', 'local'].includes(String(v.goal))) throw new Error('Invalid progress')
      this.data = { step: Number(v.step), completed: v.completed, goal: v.goal as SetupData['goal'], visualSignature: typeof v.visualSignature === 'string' ? v.visualSignature.slice(0, 20000) : '', audioSignature: typeof v.audioSignature === 'string' ? v.audioSignature.slice(0, 5000) : '', inspectorId: typeof v.inspectorId === 'string' ? v.inspectorId.slice(0, 80) : '', theme: v.theme ? validateTheme(v.theme) : null, benchmark: null }
      const b = record(v.benchmark); const profile = record(b.profile)
      if (['twitch', 'local'].includes(String(b.kind)) && typeof b.id === 'string' && b.id.length <= 80 && typeof b.channelId === 'string' && b.channelId.length <= 80 && typeof b.programSignature === 'string' && b.programSignature.length <= 180000 && typeof b.stable === 'boolean' &&
        ['at', 'duration', 'fps', 'missedPercent', 'encodedFrames', 'encoderDrops', 'outputIssues', 'queuePeak'].every(key => typeof b[key] === 'number' && Number.isFinite(b[key]) && Number(b[key]) >= 0) && typeof b.encoder === 'string' && ['1080p', '720p'].includes(String(profile.resolution)) && [30, 60].includes(Number(profile.fps)) && typeof profile.bitrate === 'number' && profile.bitrate >= 500 && profile.bitrate <= 10000 && ['auto', 'nvenc', 'x264'].includes(String(profile.encoder))) this.data.benchmark = b as unknown as SetupBenchmark
    } catch { throw new Error('Saved setup progress is invalid. Rename setup.json in app data and restart the guide.') }
  }
  save(): Promise<void> {
    const value = JSON.stringify(this.data, null, 2)
    const work = this.writes.then(async () => { await mkdir(this.directory, { recursive: true }); const path = join(this.directory, 'setup.json'); await writeFile(`${path}.tmp`, value); await rename(`${path}.tmp`, path) })
      .catch(() => { throw new Error('Setup progress could not be saved. Check disk space and app data permissions.') })
    this.writes = work.catch(() => undefined); return work
  }
  async flush(): Promise<void> { await this.writes }
}
