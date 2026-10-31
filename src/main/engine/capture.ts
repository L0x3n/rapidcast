import { desktopCapturer, type BrowserWindow } from 'electron'
import type { CaptureSource, EngineSettings } from '../../shared/engine'
import { isTrustedRendererUrl } from '../../shared/trusted-url'

export async function captureSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false })
  return sources.filter(source => !source.name.startsWith('RapidCast compositor')).map(source => ({
    id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window'
  }))
}
export function configureCapturePermissions(window: BrowserWindow, url: string, settings: () => EngineSettings): (id: string) => Promise<void> {
  let selected = ''
  const trusted = (frameUrl: string): boolean => isTrustedRendererUrl(frameUrl, url)
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback) => {
    callback(contents === window.webContents && trusted(contents.getURL()) && (permission === 'media' || permission === 'display-capture'))
  })
  window.webContents.session.setPermissionCheckHandler((contents, permission) =>
    contents === window.webContents && trusted(contents.getURL()) && (permission === 'media' || permission === 'display-capture'))
  window.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    if (request.frame !== window.webContents.mainFrame || !trusted(request.frame.url) || !selected) { callback({}); return }
    const sourceId = selected; selected = ''
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } }).then(sources => {
      const source = sources.find(item => item.id === sourceId)
      if (!source || window.isDestroyed()) { callback({}); return }
      callback({ video: source, ...(request.audioRequested && settings().audio.desktop ? { audio: 'loopback' as const } : {}) })
    }).catch(() => callback({}))
  })
  return async id => {
    const sources = await captureSources()
    const sourceId = id === 'desktop-audio' && settings().audio.desktop ? sources.find(source => source.kind === 'screen')?.id : id
    if (!sourceId || !sources.some(source => source.id === sourceId)) throw new Error('This display or window is no longer available. Refresh the source list and select it again.')
    selected = sourceId
  }
}
