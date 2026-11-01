import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ root: 'src/overlay', base: '/', build: { outDir: '../../out/overlay', emptyOutDir: true, target: 'es2022', rollupOptions: { input: { index: resolve('src/overlay/index.html'), test: resolve('src/overlay/test.html') } } } })
