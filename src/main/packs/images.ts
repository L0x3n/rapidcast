import { nativeImage } from 'electron'
import { pngData } from '../../shared/pack-validation'

export function checkPng(data: string, preview = false): Buffer {
  pngData(data, preview)
  const bytes = Buffer.from(data.slice(22), 'base64')
  if (bytes.length > (preview ? 512 * 1024 : 2 * 1024 * 1024) || bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('An embedded PNG has an invalid header or exceeds the image size limit.')
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20)
  if (width < 1 || height < 1 || width > (preview ? 1024 : 2048) || height > (preview ? 1024 : 2048) || width * height > (preview ? 1024 * 1024 : 4 * 1024 * 1024)) throw new Error('An embedded image has excessive dimensions. Resize it before exporting.')
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty() || image.getSize().width !== width || image.getSize().height !== height) throw new Error('An embedded PNG could not be decoded. Export it again.')
  const normalized = image.toPNG()
  if (normalized.length > (preview ? 512 * 1024 : 2 * 1024 * 1024)) throw new Error('An image is too large after decoding. Export a smaller PNG.')
  return normalized
}
export function portableImage(data: string): string {
  const image = nativeImage.createFromDataURL(data)
  if (image.isEmpty()) throw new Error('An image could not be included. Use a readable PNG or JPEG image and export again.')
  const { width, height } = image.getSize(); const scale = Math.min(1, 1920 / width, 1080 / height)
  const png = image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' }).toPNG()
  const result = `data:image/png;base64,${png.toString('base64')}`; checkPng(result); return result
}
