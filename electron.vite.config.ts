import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('src/main/index.ts') } } },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), {
      name: 'rapidcast-development-csp',
      apply: 'serve',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => {
          const nonce = randomBytes(18).toString('base64')
          return html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
            .replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`)
            .replace('<head>', `<head>\n<meta property="csp-nonce" nonce="${nonce}">`)
            .replace(/<(script|style)\b/g, `<$1 nonce="${nonce}"`)
        }
      }
    }],
    server: { host: '127.0.0.1' },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
