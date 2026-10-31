import { dialog, type BrowserWindow } from 'electron'
import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

export class Assets {
  constructor(private readonly directory: string) {}
  async import(window: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(window, { title: 'Add an image layer', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    const extension = extname(file).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('Choose a PNG, JPG or WebP image.')
    const data = await readFile(file)
    if (data.byteLength > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.')
    await mkdir(this.directory, { recursive: true })
    const id = `${randomUUID()}${extension}`
    await copyFile(file, join(this.directory, id))
    return id
  }
  async data(id: string): Promise<string> {
    if (!/^[a-f0-9-]{36}\.(png|jpe?g|webp)$/.test(id)) throw new Error('This image is unavailable. Import it again.')
    const data = await readFile(join(this.directory, id))
    if (data.byteLength > 10 * 1024 * 1024) throw new Error('This image is too large. Import a smaller image.')
    const mime = id.endsWith('.png') ? 'image/png' : id.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${data.toString('base64')}`
  }
}
