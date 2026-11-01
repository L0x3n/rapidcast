import { describe, expect, it } from 'vitest'
import { releasePathAllowed } from '../../scripts/release-files.mjs'

const modules = ['node_modules/acorn', 'node_modules/ffmpeg-static', 'node_modules/@kurkle/color']
describe('portable release file boundaries', () => {
  it.each(['', '/out', '/out/main/index.js', '/out/renderer/assets/index.js', '/out/overlay/index.html', '/config/public.json', '/docs/DEVPOST.md', '/LICENSE', '/node_modules/acorn/dist/acorn.js', '/node_modules/@kurkle', '/node_modules/@kurkle/color/LICENSE'])('includes runtime and public material: %s', path => expect(releasePathAllowed(path, modules)).toBe(true))
  it.each(['/.git/config', '/.env', '/.env.local', '/data/twitch.bin', '/out/stats-smoke/session.jsonl', '/out/release/RapidCast.exe', '/out/security/git.json', '/config/private.json', '/src/main/index.ts', '/node_modules/electron/dist/electron.exe', '/node_modules/.bin/vite', '/node_modules/ffmpeg-static/.env', '/../secret', 'C:\\private\\file'])('excludes development, private and test material: %s', path => expect(releasePathAllowed(path, modules)).toBe(false))
})
