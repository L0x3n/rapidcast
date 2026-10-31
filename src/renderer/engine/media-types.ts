import type { CompositorApi } from '../../shared/engine-api'

declare global {
  interface Window {
    compositor: CompositorApi
    MediaStreamTrackProcessor?: new (options: { track: MediaStreamTrack; maxBufferSize?: number }) => { readable: ReadableStream<VideoFrame> }
  }
}
export {}
