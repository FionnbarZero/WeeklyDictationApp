import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'cross-grade-prototype-identity',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { name: 'build-revision', content: revision }, injectTo: 'head' },
      ],
      generateBundle() {
        for (const name of ['NOTICE.txt', 'ARPHICPL.TXT'])
          this.emitFile({
            type: 'asset',
            fileName: `licenses/stroke-guides/${name}`,
            source: readFileSync(`public/licenses/stroke-guides/${name}`),
          })
      },
    },
  ],
  build: {
    outDir: 'cross-grade-writing-preview-dist',
    manifest: true,
    rollupOptions: { input: 'cross-grade-writing-preview.html' },
  },
})
