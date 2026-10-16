import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'scroll-layout-identity',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { name: 'build-revision', content: revision }, injectTo: 'head' },
      ],
    },
  ],
  build: { outDir: 'scroll-layout-dist', manifest: true, rollupOptions: { input: 'scroll-layout.html' } },
})
