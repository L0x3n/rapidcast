import type { Layer } from '../../shared/engine'

interface VideoSource { stream: MediaStream; reader: ReadableStreamDefaultReader<VideoFrame>; frame: VideoFrame | null; active: boolean }
export class Sources {
  readonly videos = new Map<string, VideoSource>()
  readonly images = new Map<string, ImageBitmap>()
  private audioOnly: MediaStream | null = null
  private desktopEnabled = false
  private currentFps = 30

  async configure(layers: Layer[], desktop: boolean, fps: number): Promise<MediaStream | null> {
    if (desktop !== this.desktopEnabled || fps !== this.currentFps) this.close()
    this.desktopEnabled = desktop; this.currentFps = fps
    const wanted = new Set(layers.filter(layer => layer.visible && ['display', 'camera'].includes(layer.kind) && layer.source).map(layer => `${layer.kind}:${layer.source}`))
    for (const [id, source] of this.videos) if (!wanted.has(id)) { await this.remove(source); this.videos.delete(id) }
    let desktopStream: MediaStream | null = null
    for (const layer of layers.filter(layer => layer.visible)) {
      if ((layer.kind === 'display' || layer.kind === 'camera') && layer.source) {
        const id = `${layer.kind}:${layer.source}`
        const existing = this.videos.get(id)
        if (existing && !existing.active) { await this.remove(existing); this.videos.delete(id) }
        if (!this.videos.has(id)) {
          const stream = layer.kind === 'camera' ? await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(layer.source === 'default' ? {} : { deviceId: { exact: layer.source } }), frameRate: { ideal: fps }, width: { ideal: 1920 }, height: { ideal: 1080 } } }) :
            await this.display(layer.source, desktop)
          const Processor = window.MediaStreamTrackProcessor
          const track = stream.getVideoTracks()[0]
          if (!Processor || !track) { stream.getTracks().forEach(item => item.stop()); throw new Error('This Chromium build cannot read video frames. Update Electron before using capture.') }
          const source: VideoSource = { stream, reader: new Processor({ track, maxBufferSize: 1 }).readable.getReader(), frame: null, active: true }
          this.videos.set(id, source)
          void this.read(source)
        }
        const source = this.videos.get(id)
        if (layer.kind === 'display' && source?.stream.getAudioTracks().length) desktopStream ??= source.stream
      } else if (layer.kind === 'image' && layer.source && !this.images.has(layer.source)) {
        const uri = await window.compositor.asset(layer.source)
        const response = await fetch(uri)
        this.images.set(layer.source, await createImageBitmap(await response.blob()))
      }
    }
    const imageIds = new Set(layers.filter(layer => layer.kind === 'image' && layer.visible).map(layer => layer.source))
    for (const [id, image] of this.images) if (!imageIds.has(id)) { image.close(); this.images.delete(id) }
    if (desktop && !desktopStream) {
      this.audioOnly ??= await this.display('desktop-audio', true)
      desktopStream = this.audioOnly
    } else if (this.audioOnly) { this.audioOnly.getTracks().forEach(track => track.stop()); this.audioOnly = null }
    if (desktop && !desktopStream?.getAudioTracks().length) throw new Error('Windows desktop audio was not available. Disable Desktop audio or check the selected display and Windows audio device.')
    return desktopStream
  }
  private async display(id: string, audio: boolean): Promise<MediaStream> {
    await window.compositor.prepareCapture(id)
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: this.currentFps, max: this.currentFps }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false })
  }
  private async read(source: VideoSource): Promise<void> {
    try {
      while (source.active) {
        const { value, done } = await source.reader.read()
        if (done) {
          if (source.active) { source.active = false; window.compositor.warning('A capture source ended. Output keeps its last frame. Re-select the display or camera to resume capture.') }
          break
        }
        if (!source.active) { value.close(); break }
        source.frame?.close(); source.frame = value
      }
    } catch { if (source.active) { source.active = false; window.compositor.warning('A capture source stopped. Output keeps its last frame. Re-select the display or camera to resume capture.') } }
  }
  private async remove(source: VideoSource): Promise<void> {
    source.active = false; source.frame?.close(); source.frame = null
    source.stream.getTracks().forEach(track => track.stop())
    await source.reader.cancel().catch(() => undefined)
  }
  close(): void {
    for (const source of this.videos.values()) void this.remove(source)
    this.videos.clear()
    for (const image of this.images.values()) image.close()
    this.images.clear()
    this.audioOnly?.getTracks().forEach(track => track.stop()); this.audioOnly = null
  }
}
