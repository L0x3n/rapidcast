const { app } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const root = join(__dirname, '../..')
const target = process.env.RAPIDCAST_DEMO_CAPTURE
if (!target || !process.env.RAPIDCAST_SMOKE_PROFILE || !process.argv.includes('--rapidcast-smoke-test')) throw new Error('Demo capture requires an isolated smoke profile.')
mkdirSync(target, { recursive: true })
app.setAppPath(root)
const frames = []
const started = Date.now()
let busy = false
app.on('browser-window-created', (_event, window) => {
  if (window.getTitle() !== 'RapidCast') return
  const timer = setInterval(async () => {
    if (busy || window.isDestroyed() || !window.webContents.getURL().includes('/renderer/index.html')) return
    busy = true
    try {
      const at = (Date.now() - started) / 1000
      const shot = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      if (!shot.isEmpty()) {
        const file = `frame-${String(frames.length).padStart(5, '0')}.jpg`
        writeFileSync(join(target, file), shot.toJPEG(91))
        frames.push({ file, at })
      }
    } catch {} finally { busy = false }
  }, 200)
  window.on('closed', () => clearInterval(timer))
})
app.on('will-quit', () => writeFileSync(join(target, 'frames.json'), JSON.stringify({ started, frames }, null, 2)))
require(join(root, 'out/main/index.js'))
