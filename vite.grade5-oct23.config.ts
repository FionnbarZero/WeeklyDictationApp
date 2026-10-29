import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readRepositoryGitRevision } from './scripts/buildMetadata.ts'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'isolated-stroke-license',
      generateBundle() {
        for (const name of ['NOTICE.txt', 'ARPHICPL.TXT'])
          this.emitFile({
            type: 'asset',
            fileName: `licenses/stroke-guides/${name}`,
            source: readFileSync(resolve('public/licenses/stroke-guides', name)),
          })
      },
    },
  ],
  publicDir: false,
  define: {
    'import.meta.env.VITE_GIT_REVISION': JSON.stringify(
      process.env.VITE_GIT_REVISION || readRepositoryGitRevision(process.cwd()),
    ),
    'import.meta.env.VITE_FIREBASE_API_KEY': '""',
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': '""',
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': '""',
    'import.meta.env.VITE_FIREBASE_APP_ID': '""',
  },
  build: { outDir: 'grade5-oct23-preview-dist', rollupOptions: { input: resolve('grade5-oct23-preview.html') } },
})
