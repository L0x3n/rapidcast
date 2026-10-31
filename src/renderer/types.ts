import type { ActionResult, AppInfo, StudioState } from '../shared/contracts'
import type { EngineState } from '../shared/engine'
export type Tab = 'live' | 'studio' | 'setup' | 'stats' | 'settings'
export type Action = (label: string, run: () => Promise<ActionResult>) => Promise<boolean>
export interface PageProps { state: StudioState; info: AppInfo; engine: EngineState; action: Action; busy: boolean; go: (tab: Tab) => void }
