import type { ActionResult } from './contracts'
import type { DeviceChoice, EngineCommand, EngineSettings, EngineState, EngineTelemetry } from './engine'

export interface EngineUiApi {
  getEngine(): Promise<EngineState>
  onEngine(listener: (state: EngineState) => void): () => void
  configureEngine(settings: EngineSettings): Promise<ActionResult>
  startPreview(): Promise<ActionResult>
  stopPreview(): Promise<ActionResult>
  startOutput(mode: 'record' | 'test' | 'live'): Promise<ActionResult>
  stopOutput(): Promise<ActionResult>
  refreshSources(): Promise<ActionResult>
  importImage(): Promise<{ id: string | null; error?: string }>
  revealRecording(): Promise<ActionResult>
}
export interface CompositorApi {
  ready(): void
  onCommand(handler: (command: EngineCommand) => void): void
  reply(id: string, error: string | null): void
  telemetry(value: EngineTelemetry): void
  thumbnail(data: ArrayBuffer): void
  chunk(runId: string, sequence: number, data: ArrayBuffer): Promise<ActionResult>
  devices(cameras: DeviceChoice[], microphones: DeviceChoice[]): void
  prepareCapture(id: string): Promise<void>
  asset(id: string): Promise<string>
  fault(message: string): void
  warning(message: string): void
}
