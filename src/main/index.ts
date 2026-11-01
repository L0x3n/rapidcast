import { app, BrowserWindow, ipcMain, safeStorage, globalShortcut, dialog } from 'electron'
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
import { Setup } from './setup/service'
import { registerSetupIpc } from './setup/ipc'
import { SETUP_IPC } from '../shared/setup'
import { setupSmoke } from './setup/smoke'
import { Stats } from './stats/service'
import { registerStatsIpc } from './stats/ipc'
import { STATS_IPC } from '../shared/stats'
import { statsSmoke } from './stats/smoke'
import { Packs } from './packs/service'
import { registerPackIpc } from './packs/ipc'
import { PACK_IPC } from '../shared/packs'
import { recoverPackTransaction } from './packs/files'
import { packsSmoke } from './packs/smoke'

const smokeTest = process.argv.includes('--rapidcast-smoke-test')
const smokeProfile = process.env.RAPIDCAST_SMOKE_PROFILE
const packExportTest = smokeTest && process.argv.includes('--rapidcast-pack-export')
const packImportTest = smokeTest && process.argv.includes('--rapidcast-pack-import')
if (smokeTest && smokeProfile) app.setPath('userData', smokeProfile)
app.setName('RapidCast')
app.commandLine.appendSwitch('site-per-process')
let studio: Studio | null = null
let engine: Engine | null = null
let widgets: Widgets | null = null
let ai: AiService | null = null
let setup: Setup | null = null
let stats: Stats | null = null
let packs: Packs | null = null
let quitting = false
let shutdown: Promise<void> | null = null
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
    stats?.observeStream(state)
    widgets?.streamChanged(state)
    ai?.streamChanged(state)
    setup?.observed()
  })
  if (!engine) { engine = new Engine(new Storage(app.getPath('userData')), app.getPath('userData'),
    smokeTest ? join(app.getPath('userData'), 'recordings') : join(app.getPath('videos'), 'RapidCast'),
    test => studio!.outputTarget(test), state => {
      for (const open of BrowserWindow.getAllWindows()) if (!open.isDestroyed() && open !== engine?.window) open.webContents.send(ENGINE_IPC.update, state)
      widgets?.engineChanged(state.settings)
      stats?.observeEngine(state)
      setup?.observed()
    }); await engine.initialize() }
  if (!widgets) {
    widgets = new Widgets(app.getPath('userData'), engine, studio, process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : 'file:', state => {
      for (const open of BrowserWindow.getAllWindows()) if (!open.isDestroyed() && open !== engine?.window) open.webContents.send(WIDGET_IPC.update, state)
      setup?.observed()
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
  if (!setup) { setup = new Setup(app.getPath('userData'), engine, studio, widgets, ai, state => { if (!window.isDestroyed()) window.webContents.send(SETUP_IPC.update, state) }); await setup.initialize() }
  studio.sceneGuard = () => { if (engine?.packOperationActive) throw new Error('Finish or cancel the pack task before switching scenes.'); if (engine?.setupTestActive) throw new Error('Finish or cancel the setup test before switching scenes.') }
  registerSetupIpc(setup, window, rendererUrl)
  if (!stats) {
    stats = new Stats(app.getPath('userData'), engine, studio, ai, state => { if (!window.isDestroyed()) window.webContents.send(STATS_IPC.update, state) })
    await stats.initialize()
    widgets.trigger = value => stats?.trigger(value)
    widgets.triggerOverflow = () => stats?.limit('trigger-overflow')
  }
  registerStatsIpc(stats, window, rendererUrl)
  if (!packs) packs = new Packs(app.getPath('userData'), engine, widgets, setup, ai, app.getVersion(), {
    open: async () => { if (packImportTest) return join(__dirname, '../packs-smoke/selected.rcpack'); const result = await dialog.showOpenDialog(window, { title: 'Review a RapidCast overlay pack', properties: ['openFile'], filters: [{ name: 'RapidCast overlay pack', extensions: ['rcpack'] }] }); return result.canceled ? null : result.filePaths[0] ?? null },
    save: async name => { if (packExportTest) return join(__dirname, '../packs-smoke/portable.rcpack'); const result = await dialog.showSaveDialog(window, { title: 'Export scenes, widget code, text and embedded images', defaultPath: `${name}.rcpack`, filters: [{ name: 'RapidCast overlay pack', extensions: ['rcpack'] }] }); return result.canceled ? null : result.filePath ?? null }
  }, state => { if (!window.isDestroyed()) window.webContents.send(PACK_IPC.update, state) })
  registerPackIpc(packs, window, rendererUrl)
  window.on('closed', () => app.quit())

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
    if (process.argv.includes('--rapidcast-setup-test') && setup && engine && ai && stats) await setupSmoke(window, setup, engine, ai, stats)
    if (process.argv.includes('--rapidcast-stats-test') && stats && engine && studio && widgets) await statsSmoke(window, stats, engine, studio, widgets, process.argv.includes('--rapidcast-stats-long'))
    if ((packExportTest || packImportTest) && packs && engine && studio && widgets && setup) await packsSmoke(window, packs, engine, widgets, setup, studio, packExportTest)
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
  await recoverPackTransaction(app.getPath('userData'))
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
app.on('before-quit', event => {
  if (quitting) return
  event.preventDefault()
  if (!shutdown) shutdown = (async () => {
    setup?.close(); ai?.close()
    await packs?.close()
    await engine?.dispose().catch(() => console.error('Output cleanup failed during shutdown. Recover the readable session journal on restart.'))
    await stats?.close().catch(() => console.error('Some session data could not be flushed during shutdown.'))
    studio?.dispose()
    await widgets?.close()
  })().catch(() => console.error('Shutdown could not flush all local session data. The next start will recover its readable journal.'))
    .finally(() => { quitting = true; app.quit() })
})
app.on('will-quit', () => globalShortcut.unregisterAll())
