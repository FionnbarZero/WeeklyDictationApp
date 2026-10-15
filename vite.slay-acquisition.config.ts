import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'slay-acquisition-identity',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { name: 'build-revision', content: revision }, injectTo: 'head' },
      ],
    },
  ],
  build: { outDir: 'slay-acquisition-dist', manifest: true, rollupOptions: { input: 'slay-acquisition.html' } },
})
