import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { outputProfile, programSignature, type SetupBenchmark, type SetupGoal } from '../../shared/setup'
import type { Engine } from '../engine/controller'

export async function runSetupBenchmark(engine: Engine, kind: SetupGoal, channelId: string, widgets: () => string, signal: AbortSignal,
  progress: (seconds: number, message: string) => void): Promise<SetupBenchmark> {
  if (engine.setupTestActive || engine.snapshot().mode || ['starting', 'stopping'].includes(engine.snapshot().phase)) throw new Error('Stop existing output before starting the setup test.')
  const settings = structuredClone(engine.snapshot().settings)
  const signature = programSignature(settings, widgets())
  engine.setupTestActive = true
  let ownsOutput = false
  try {
    if (signal.aborted) throw new Error('The setup test was cancelled.')
    ownsOutput = true
    await engine.startOutput(kind === 'twitch' ? 'test' : 'record', undefined, true)
    const deadline = Date.now() + 18000
    while (engine.snapshot().encodedFrames < 1 || !engine.snapshot().telemetry) {
      if (signal.aborted) throw new Error('The setup test was cancelled.')
      if (engine.snapshot().phase === 'error' || !engine.snapshot().mode || Date.now() > deadline) throw new Error('The encoder did not start in time. Check sources and repeat the test.')
      await delay(100)
    }
    const baseline = structuredClone(engine.snapshot()); const start = Date.now()
    let peak = 0; let issues = baseline.outputIssues
    while (Date.now() - start < 15000) {
      if (signal.aborted) throw new Error('The setup test was cancelled.')
      const state = engine.snapshot()
      if (state.mode !== (kind === 'twitch' ? 'test' : 'record') || state.phase === 'error') throw new Error('The test output stopped. Check output and repeat the test.')
      peak = Math.max(peak, state.queueBytes); issues = Math.max(issues, state.outputIssues)
      progress(Math.min(15, Math.floor((Date.now() - start) / 1000)), kind === 'twitch' ? 'Sending a private Twitch test. This does not go public.' : 'Measuring local encoding only. Internet delivery is not tested.')
      await delay(200)
    }
    const end = structuredClone(engine.snapshot()); const duration = (Date.now() - start) / 1000
    const frames = Math.max(0, (end.telemetry?.frames ?? 0) - (baseline.telemetry?.frames ?? 0))
    const expected = Math.max(1, (end.telemetry?.expected ?? 0) - (baseline.telemetry?.expected ?? 0))
    const missedPercent = 100 * Math.max(0, expected - frames) / expected
    const encodedFrames = Math.max(0, end.encodedFrames - baseline.encodedFrames)
    const encoderDrops = Math.max(0, end.outputDropped - baseline.outputDropped)
    const fps = Math.min(settings.fps, settings.fps * frames / expected)
    if (signature !== programSignature(engine.snapshot().settings, widgets())) throw new Error('The program changed during the test. Repeat it with the final scene and audio.')
    return { id: randomUUID(), kind, channelId, at: Date.now(), duration, profile: outputProfile(settings), programSignature: signature,
      fps, missedPercent, encodedFrames, encoderDrops, outputIssues: issues, queuePeak: peak, encoder: end.encoder,
      stable: expected >= settings.fps * duration * .85 && frames >= settings.fps * duration * .85 && encodedFrames >= settings.fps * duration * .8 && missedPercent < 1 && encoderDrops === 0 && issues === 0 && peak < 8 * 1024 * 1024 }
  } finally {
    try { if (ownsOutput) { progress(15, 'Finishing test output.'); await engine.stopOutput() } }
    finally { engine.setupTestActive = false }
  }
}
