import type { SceneId } from './scenes'
import type { Layer } from './engine'
import type { StreamEvent } from './events'
import type { ActionResult } from './contracts'

export type ParamValue = string | number | boolean
export interface ParamSchema { type: 'number' | 'string' | 'color' | 'boolean'; default: ParamValue; min?: number; max?: number }
export interface WidgetMeta { name: string; description: string; defaultSize: { w: number; h: number }; params: Record<string, ParamSchema> }
export interface WidgetDefinition { id: string; code: string; meta: WidgetMeta; builtin: boolean; version: string }
export interface WidgetInstance { id: string; params: Record<string, ParamValue>; createdAt: number; disabled: boolean; reason: string }
export interface WidgetStatus { id: string; state: 'loading' | 'ready' | 'disabled'; reason: string; frames: number; triggers: number; renderMs: number }
export type Transition = 'cut' | 'fade' | 'swipe'
export interface WidgetState {
  revision: number; definitions: WidgetDefinition[]; instances: WidgetInstance[]; statuses: WidgetStatus[]
  baseUrl: string; transition: Transition; hotkeys: { scene: SceneId; accelerator: string; registered: boolean }[]
}
export interface OverlaySnapshot {
  revision: number; activeScene: SceneId; scenes: Record<SceneId, Layer[]>; definitions: WidgetDefinition[]
  instances: WidgetInstance[]; events: StreamEvent[]; transition: Transition
}
export interface WidgetApi {
  getWidgets(): Promise<WidgetState>
  onWidgets(listener: (state: WidgetState) => void): () => void
  addWidget(definitionId: string, scene: SceneId): Promise<ActionResult>
  installWidget(code: string): Promise<ActionResult>
  configureWidget(id: string, params: Record<string, ParamValue>): Promise<ActionResult>
  restartWidget(id: string): Promise<ActionResult>
  removeWidget(id: string): Promise<ActionResult>
  setTransition(value: Transition): Promise<ActionResult>
  copyOverlay(scene: SceneId | 'program' | string): Promise<ActionResult>
}
export const WIDGET_IPC = {
  state: 'widgets:state', update: 'widgets:update', add: 'widgets:add', install: 'widgets:install',
  params: 'widgets:params', restart: 'widgets:restart', remove: 'widgets:remove', transition: 'widgets:transition', copy: 'widgets:copy'
} as const
export function validParams(schema: Record<string, ParamSchema>, input: unknown): Record<string, ParamValue> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Widget parameters must be a plain object.')
  const result: Record<string, ParamValue> = {}
  for (const [key, definition] of Object.entries(schema)) {
    const value: unknown = (input as Record<string, unknown>)[key] ?? definition.default
    if (definition.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < (definition.min ?? -1000000) || value > (definition.max ?? 1000000)) ||
        definition.type === 'boolean' && typeof value !== 'boolean' ||
        definition.type === 'string' && (typeof value !== 'string' || value.length > 500) ||
        definition.type === 'color' && (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value))) throw new Error(`Check the ${key} parameter and try again.`)
    result[key] = value as ParamValue
  }
  return result
}
export function transitionProgress(start: number, now: number, duration = 450): number { return Math.min(1, Math.max(0, (now - start) / duration)) }
export function widgetGeneration(definition: WidgetDefinition, instance: WidgetInstance, layer: Layer): string {
  const value = JSON.stringify([definition.version, instance.createdAt, instance.params, layer.width, layer.height])
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}
