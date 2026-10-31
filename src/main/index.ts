import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC, type AppInfo } from '../shared/contracts'
import { validateSender, registerStudioIpc } from './ipc'
import { Storage } from './storage'
import { Studio } from './studio'
import { runSmoke } from './smoke'

const smokeTest = process.argv.includes('--rapidcast-smoke-test')
const smokeProfile = process.env.RAPIDCAST_SMOKE_PROFILE
if (smokeTest && smokeProfile) app.setPath('userData', smokeProfile)
app.setName('RapidCast')
let studio: Studio | null = null

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
      webSecurity: true
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)

  if (!studio) studio = new Studio(new Storage(app.getPath('userData')), state => {
    for (const open of BrowserWindow.getAllWindows()) {
      if (!open.isDestroyed()) open.webContents.send(IPC.update, state)
    }
  })
  registerStudioIpc(studio, window, rendererUrl)

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
app.on('before-quit', () => studio?.dispose())
