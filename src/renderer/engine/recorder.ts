export class Recorder {
  private recorder: MediaRecorder | null = null
  private delivering: Promise<void> = Promise.resolve()
  private pendingBytes = 0
  private sequence = 0
  mimeType = ''
  private failed = false
  start(stream: MediaStream, fps: number, bitrate: number, runId: string): void {
    if (this.recorder) throw new Error('The previous recorder has not finished yet.')
    this.mimeType = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus'].find(type => MediaRecorder.isTypeSupported(type)) || ''
    if (!this.mimeType) throw new Error('Chromium could not find a video recording codec. Update Electron and restart.')
    const options: MediaRecorderOptions & { videoKeyFrameIntervalCount: number } = { mimeType: this.mimeType, videoBitsPerSecond: Math.max(8000000, bitrate * 1250), audioBitsPerSecond: 160000, videoKeyFrameIntervalCount: fps * 2 }
    const recorder = new MediaRecorder(stream, options)
    this.sequence = 0; this.pendingBytes = 0; this.failed = false; this.delivering = Promise.resolve()
    recorder.ondataavailable = event => {
      if (!event.data.size || this.failed) return
      this.pendingBytes += event.data.size
      if (this.pendingBytes > 16 * 1024 * 1024) {
        this.failed = true
        window.compositor.fault('The encoder buffer filled up. Stop output and lower FPS or bitrate before trying again.')
        if (recorder.state !== 'inactive') recorder.stop()
        return
      }
      this.delivering = this.delivering.then(async () => {
        if (this.failed) return
        const data = await event.data.arrayBuffer()
        const result = await window.compositor.chunk(runId, this.sequence++, data)
        if (!result.ok) { this.failed = true; if (recorder.state !== 'inactive') recorder.stop() }
      }).catch(() => { this.failed = true; if (recorder.state !== 'inactive') recorder.stop() }).finally(() => { this.pendingBytes -= event.data.size })
    }
    recorder.onerror = () => window.compositor.fault('MediaRecorder stopped unexpectedly. Stop output and try a lower frame rate.')
    this.recorder = recorder; recorder.start(250)
  }
  async stop(): Promise<void> {
    const recorder = this.recorder
    if (!recorder) return
    if (recorder.state !== 'inactive') await new Promise<void>(resolve => { recorder.addEventListener('stop', () => resolve(), { once: true }); recorder.stop() })
    await this.delivering
    this.recorder = null
  }
}
