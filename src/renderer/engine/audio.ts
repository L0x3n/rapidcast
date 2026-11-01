import type { AudioSettings } from '../../shared/engine'

export class AudioMixer {
  readonly context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
  readonly destination = this.context.createMediaStreamDestination()
  private readonly micGain = this.context.createGain()
  private readonly desktopGain = this.context.createGain()
  private readonly micMeter = this.context.createAnalyser()
  private readonly desktopMeter = this.context.createAnalyser()
  private mic: MediaStream | null = null
  private micNode: MediaStreamAudioSourceNode | null = null
  private desktopNode: MediaStreamAudioSourceNode | null = null
  private desktopTrack = ''
  private micId = 'none'
  private testOscillator: OscillatorNode | null = null
  private testGain: GainNode | null = null
  private testTimer: ReturnType<typeof setInterval> | null = null
  capabilities(): string[] {
    return [...(this.mic?.getAudioTracks().some(track => track.readyState === 'live') ? [`microphone:${this.micId}`] : []),
      ...(this.desktopNode?.mediaStream.getAudioTracks().some(track => track.readyState === 'live') ? ['desktop-audio-live'] : [])]
  }
  constructor() {
    this.micMeter.fftSize = 512; this.desktopMeter.fftSize = 512
    this.micGain.connect(this.micMeter).connect(this.destination)
    this.desktopGain.connect(this.desktopMeter).connect(this.destination)
    const silence = this.context.createConstantSource(); const gain = this.context.createGain()
    gain.gain.value = 0; silence.connect(gain).connect(this.destination); silence.start()
  }
  async configure(settings: AudioSettings, desktop: MediaStream | null): Promise<void> {
    await this.context.resume()
    if (settings.micId !== this.micId) {
      this.micNode?.disconnect(); this.mic?.getTracks().forEach(track => track.stop()); this.mic = null
      if (settings.micId !== 'none') {
        this.mic = await navigator.mediaDevices.getUserMedia({ video: false, audio: { deviceId: { exact: settings.micId },
          sampleRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        this.micNode = this.context.createMediaStreamSource(this.mic); this.micNode.connect(this.micGain)
      }
      this.micId = settings.micId
    }
    const track = desktop?.getAudioTracks()[0]
    if ((track?.id || '') !== this.desktopTrack) {
      this.desktopNode?.disconnect(); this.desktopNode = null
      if (desktop && track) { this.desktopNode = this.context.createMediaStreamSource(new MediaStream([track])); this.desktopNode.connect(this.desktopGain) }
      this.desktopTrack = track?.id || ''
    }
    this.micGain.gain.setTargetAtTime(settings.micMuted ? 0 : settings.micGain, this.context.currentTime, .02)
    this.desktopGain.gain.setTargetAtTime(!settings.desktop || settings.desktopMuted ? 0 : settings.desktopGain, this.context.currentTime, .02)
  }
  levels(): { micLevel: number; desktopLevel: number } {
    const level = (meter: AnalyserNode): number => {
      const values = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(values)
      return Math.min(1, Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) * 3)
    }
    return { micLevel: level(this.micMeter), desktopLevel: level(this.desktopMeter) }
  }
  testTone(): void {
    if (this.testOscillator) return
    this.testOscillator = this.context.createOscillator(); this.testGain = this.context.createGain()
    this.testOscillator.frequency.value = 440; this.testGain.gain.value = 0
    this.testOscillator.connect(this.testGain).connect(this.destination); this.testOscillator.start()
    let next = Math.ceil(this.context.currentTime) + 1
    const schedule = (): void => {
      while (next < this.context.currentTime + 3) {
        this.testGain?.gain.setValueAtTime(.1, next)
        this.testGain?.gain.setValueAtTime(0, next + .08)
        next++
      }
    }
    schedule(); this.testTimer = setInterval(schedule, 500)
  }
  async close(): Promise<void> {
    this.mic?.getTracks().forEach(track => track.stop()); this.testOscillator?.stop()
    if (this.testTimer) clearInterval(this.testTimer)
    await this.context.close()
  }
}
