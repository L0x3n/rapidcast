import type { ActionResult } from './contracts'
import type { Layer } from './engine'
import type { SceneId } from './scenes'
import type { StreamTheme } from './setup'
import type { ParamValue, Transition } from './widgets'

export const PACK_LIMIT = 16 * 1024 * 1024
export interface PackMetadata { name: string; author: string; description: string; createdAt: string; appVersion: string }
export interface PackLayer extends Layer { params?: Record<string, ParamValue> }
export interface OverlayPack {
  format: 'rapidcast-pack'; version: 1; metadata: PackMetadata; preview: string; theme: StreamTheme | null; transition: Transition
  definitions: { id: string; code: string; credit: string }[]
  assets: { id: string; data: string }[]
  scenes: Record<SceneId, PackLayer[]>
}
export interface PackReview {
  id: string; metadata: PackMetadata; preview: string; theme: StreamTheme | null; transition: Transition
  scenes: OverlayPack['scenes']; definitions: { id: string; name: string; description: string; code: string; credit: string }[]
  images: number; placeholders: number; testCases: number
}
export interface PackState {
  revision: number; phase: 'idle' | 'reading' | 'exporting' | 'review' | 'testing' | 'ready' | 'installing' | 'done' | 'error' | 'cancelled'
  review: PackReview | null; completed: number; total: number; message: string
}
export interface PackApi {
  getPacks(): Promise<PackState>
  onPacks(listener: (state: PackState) => void): () => void
  exportPack(input: { name: string; author: string; description: string; preview: string }): Promise<ActionResult>
  openPack(): Promise<ActionResult>
  testPack(id: string): Promise<ActionResult>
  installPack(id: string): Promise<ActionResult>
  cancelPack(): Promise<ActionResult>
}
export const PACK_IPC = { state: 'packs:state', update: 'packs:update', export: 'packs:export', open: 'packs:open', test: 'packs:test', install: 'packs:install', cancel: 'packs:cancel' } as const
