import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { validateWidgetCode } from '../../shared/widget-validation'
import { validParams, validCredit, type WidgetDefinition, type WidgetInstance, type Transition } from '../../shared/widgets'
import { record } from '../../shared/events'
import { builtinWidgets } from './builtins'

export class WidgetStore {
  definitions = builtinWidgets()
  instances: WidgetInstance[] = []
  transition: Transition = 'fade'
  hotkeysEnabled = true
  port = 17638
  private writes = Promise.resolve()
  constructor(private readonly directory: string) {}
  async load(): Promise<boolean> {
    let source: string
    try { source = await readFile(join(this.directory, 'widgets.json'), 'utf8') } catch (error: unknown) {
      if (record(error).code === 'ENOENT') return false
      throw new Error('The widget library could not be read. Check app data permissions and restart.')
    }
    try {
      const data = record(JSON.parse(source))
      if (Array.isArray(data.definitions)) for (const raw of data.definitions.slice(0, 64)) {
        const value = record(raw)
        if (typeof value.code === 'string' && typeof value.id === 'string' && /^custom-[a-f0-9-]{36}$/.test(value.id)) this.definitions.push({ ...this.definition(value.id, value.code), ...(validCredit(value.credit) ? { credit: value.credit } : {}) })
      }
      if (Array.isArray(data.instances)) for (const raw of data.instances.slice(0, 32)) {
        const value = record(raw)
        if (typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.id) && typeof value.createdAt === 'number' &&
            Number.isFinite(value.createdAt) && typeof value.disabled === 'boolean') this.instances.push({ id: value.id, params: record(value.params) as WidgetInstance['params'], createdAt: value.createdAt, disabled: value.disabled, reason: typeof value.reason === 'string' ? value.reason.slice(0, 220) : '' })
      }
      if (['cut', 'fade', 'swipe'].includes(String(data.transition))) this.transition = data.transition as Transition
      this.hotkeysEnabled = data.hotkeysEnabled !== false
      if (Number.isInteger(data.port) && Number(data.port) >= 1024 && Number(data.port) <= 65535) this.port = Number(data.port)
      return true
    } catch { throw new Error('The saved widget library is invalid. Rename widgets.json in app data, then restart.') }
  }
  definition(id: string, code: string): WidgetDefinition {
    return { id, code, meta: validateWidgetCode(code).meta, builtin: false, version: createHash('sha256').update(code).digest('hex').slice(0, 16) }
  }
  install(code: string, credit = ''): WidgetDefinition {
    if (this.definitions.length >= 64) throw new Error('The library has reached its 64-widget limit. Use an existing widget.')
    const definition = this.definition(`custom-${randomUUID()}`, code)
    if (validCredit(credit)) definition.credit = credit
    this.definitions.push(definition)
    return definition
  }
  create(id: string, definition: WidgetDefinition, params: unknown = {}): WidgetInstance {
    if (this.instances.length >= 32) throw new Error('Use at most 32 widget instances across the studio.')
    const instance = { id, params: validParams(definition.meta.params, params), createdAt: Date.now(), disabled: false, reason: '' }
    this.instances.push(instance)
    return instance
  }
  save(): Promise<void> {
    const value = JSON.stringify({ definitions: this.definitions.filter(definition => !definition.builtin), instances: this.instances,
      transition: this.transition, hotkeysEnabled: this.hotkeysEnabled, port: this.port }, null, 2)
    const operation = this.writes.then(async () => {
      await mkdir(this.directory, { recursive: true })
      const path = join(this.directory, 'widgets.json')
      await writeFile(`${path}.tmp`, value); await rename(`${path}.tmp`, path)
    }).catch(() => { throw new Error('The widget library could not be saved. Check disk space and app data permissions.') })
    this.writes = operation.catch(() => undefined)
    return operation
  }
}
