import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC, type AppInfo } from '../shared/contracts'
import { resolveTwitchClientId } from '../shared/config'
import { isTrustedRendererUrl } from '../shared/trusted-url'

const smokeTest = process.argv.includes('--rapidcast-smoke-test')
const smokeProfile = process.env.RAPIDCAST_SMOKE_PROFILE
if (smokeTest && smokeProfile) app.setPath('userData', smokeProfile)
app.setName('RapidCast')

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

  ipcMain.removeHandler(IPC.appInfo)
  ipcMain.handle(IPC.appInfo, async (event): Promise<AppInfo> => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
        !isTrustedRendererUrl(event.senderFrame.url, rendererUrl)) {
      throw new Error('This request did not come from the studio window. Restart RapidCast and try again.')
    }
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      secureStorageAvailable: await safeStorage.isAsyncEncryptionAvailable(),
      twitchClientConfigured: resolveTwitchClientId() !== null
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(rendererUrl)
  else await window.loadFile(rendererFile)

  if (smokeTest) {
    const result: unknown = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const check = () => {
          if (document.querySelector('[data-app-ready="true"]')) {
            window.rapidcast.getAppInfo().then(info => resolve({
              name: info.name,
              nodeHidden: typeof require === 'undefined' && typeof process === 'undefined',
              heading: document.querySelector('h1')?.textContent
            }), reject);
          } else if (Date.now() > deadline) reject(new Error('Studio did not become ready.'));
          else setTimeout(check, 50);
        };
        check();
      })
    `)
    const rendererProcess = app.getAppMetrics().find((metric) => metric.pid === window.webContents.getOSProcessId())
    if (!result || typeof result !== 'object' || !('name' in result) || result.name !== 'RapidCast' ||
        !('nodeHidden' in result) || result.nodeHidden !== true ||
        !('heading' in result) || result.heading !== 'Your stream.Built live.' ||
        !rendererProcess?.sandboxed) {
      throw new Error('The studio smoke check failed. Inspect the main/preload/renderer boundaries.')
    }
    console.log('RapidCast smoke passed: React, IPC, renderer isolation, sandbox.')
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
