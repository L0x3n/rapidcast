import { defineConfig } from 'vite'
export default defineConfig({ root: 'src/overlay', base: '/', build: { outDir: '../../out/overlay', emptyOutDir: true, target: 'es2022' } })
