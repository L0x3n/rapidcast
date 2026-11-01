import { app, BrowserWindow, ipcMain, safeStorage, globalShortcut } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC, type AppInfo } from '../shared/contracts'
import { validateSender, registerStudioIpc } from './ipc'
import { Storage } from './storage'
import { Studio } from './studio'
import { runSmoke } from './smoke'
import { Engine } from './engine/controller'
import { ENGINE_IPC } from '../shared/engine'
import { registerEngineIpc } from './engine/ipc'
import { engineSmoke } from './engine/smoke'
import { Widgets } from './widgets/service'
import { registerWidgetIpc } from './widgets/ipc'
import { WIDGET_IPC } from '../shared/widgets'
import { widgetSmoke } from './widgets/smoke'
import { AiService } from './ai/service'
import { registerAiIpc } from './ai/ipc'
import { AI_IPC } from '../shared/ai'
import { aiSmoke } from './ai/smoke'

const smokeTest = process.argv.includes('--rapidcast-smoke-test')
const smokeProfile = process.env.RAPIDCAST_SMOKE_PROFILE
if (smokeTest && smokeProfile) app.setPath('userData', smokeProfile)
app.setName('RapidCast')
app.commandLine.appendSwitch('site-per-process')
let studio: Studio | null = null
let engine: Engine | null = null
let widgets: Widgets | null = null
let ai: AiService | null = null
let lastScene = 'starting'

async function createWindow(): Promise<void> {
  const rendererFile = join(__dirname, '../renderer/index.html')
  const rendererUrl = process.env.ELECTRON_RENDERER_URL || pathToFileURL(rendererFile).href
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 760,
    backgroundColor: '#0b0d10',
    title: 'RapidCast',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)

  if (!studio) studio = new Studio(new Storage(app.getPath('userData')), state => {
    for (const open of BrowserWindow.getAllWindows()) {
      if (!open.isDestroyed() && open !== engine?.window) open.webContents.send(IPC.update, state)
    }
    if (state.activeScene !== lastScene) { lastScene = state.activeScene; void engine?.setScene(state.activeScene).catch(() => engine?.notice('A source in the next scene could not load. Output is continuing. Check the selected scene’s capture layers.')) }
    const mode = engine?.snapshot().mode
    if (!state.twitch.account && (mode === 'live' || mode === 'test')) void engine?.stopOutput().catch(() => engine?.fault('Twitch disconnected. Restart the engine before sending output again.'))
    widgets?.streamChanged(state)
    ai?.streamChanged(state)
  })
  if (!engine) { engine = new Engine(new Storage(app.getPath('userData')), app.getPath('userData'),
    smokeTest ? join(app.getPath('userData'), 'recordings') : join(app.getPath('videos'), 'RapidCast'),
    test => studio!.outputTarget(test), state => {
      for (const open of BrowserWindow.getAllWindows()) if (!open.isDestroyed() && open !== engine?.window) open.webContents.send(ENGINE_IPC.update, state)
      widgets?.engineChanged(state.settings)
    }); await engine.initialize() }
  if (!widgets) {
    widgets = new Widgets(app.getPath('userData'), engine, studio, process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : 'file:', state => {
      for (const open of BrowserWindow.getAllWindows()) if (!open.isDestroyed() && open !== engine?.window) open.webContents.send(WIDGET_IPC.update, state)
    }, smokeTest)
    await widgets.initialize()
  }
  registerStudioIpc(studio, window, rendererUrl)
  registerEngineIpc(engine, window, rendererUrl)
  registerWidgetIpc(widgets, window, rendererUrl)
  if (!ai) {
    ai = new AiService(app.getPath('userData'), widgets, engine, studio, state => { if (!window.isDestroyed()) window.webContents.send(AI_IPC.update, state) })
    await ai.initialize()
  }
  registerAiIpc(ai, window, rendererUrl)
  window.on('closed', () => { ai?.close(); void engine?.dispose().then(() => widgets?.close()).finally(() => app.quit()).catch(() => app.exit(0)) })

  ipcMain.removeHandler(IPC.appInfo)
  ipcMain.handle(IPC.appInfo, async (event): Promise<AppInfo> => {
    validateSender(event, window, rendererUrl)
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      secureStorageAvailable: await safeStorage.isAsyncEncryptionAvailable(),
      twitchClientConfigured: Boolean(studio?.snapshot().twitch.clientId)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(rendererUrl)
  else await window.loadFile(rendererFile)

  if (smokeTest) {
    await runSmoke(window)
    if (process.argv.includes('--rapidcast-engine-test') && engine) await engineSmoke(window, engine)
    if (process.argv.includes('--rapidcast-widget-test') && engine && studio && widgets) await widgetSmoke(window, engine, studio, widgets)
    if (process.argv.includes('--rapidcast-ai-test') && ai && engine && studio && widgets) await aiSmoke(window, ai, engine, widgets, studio)
    try {
      await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 800)))')
      const screenshot = await window.webContents.capturePage(undefined, { stayAwake: true })
      await writeFile(join(__dirname, '../smoke.png'), screenshot.toPNG())
      console.log('Screenshot saved: out/smoke.png')
    } catch {
      console.warn('The startup checks passed, but Electron could not capture the window. Inspect the studio visually with npm start.')
    }
    app.quit()
  }
}

app.whenReady().then(async () => {
  await createWindow()
  if (!smokeTest) await studio?.initialize()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(() => {
        console.error('RapidCast could not reopen the studio. Close the app and run npm run build before trying again.')
        app.exit(1)
      })
    }
  })
}).catch((error: unknown) => {
  if (smokeTest) console.error(error)
  console.error('RapidCast could not start or finish its startup check. Run npm run build, then try again.')
  app.exit(1)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => { ai?.close(); studio?.dispose() })
app.on('will-quit', () => globalShortcut.unregisterAll())
