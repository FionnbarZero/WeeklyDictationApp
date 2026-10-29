import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'import.meta.env.VITE_GIT_REVISION': JSON.stringify(revision),
    'import.meta.env.VITE_REGRESSION_REPAIR_PREVIEW': '"true"',
    'import.meta.env.VITE_COMPACT_PARENT_PREVIEW': '"true"',
    'import.meta.env.VITE_W2_RECOVERY_PREVIEW': '"true"',
  },
  build: { outDir: 'warmup-design-preview-dist', rollupOptions: { input: 'warmup-design-preview.html' } },
})
