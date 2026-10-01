import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

function page(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

export default defineConfig(({ mode }) => ({
  base: mode === 'public-preview' ? '/WeeklyDictationApp/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: page('./index.html'),
        grade5LearningHub: page('./grade5-learning-hub.html'),
        kindergartenLearningLab: page('./kindergarten-learning-lab.html'),
        testing: page('./testing.html'),
      },
    },
  },
}))
