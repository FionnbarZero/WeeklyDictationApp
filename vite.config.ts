import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

function page(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

const archivedPrototypeInputs = {
  tier2ReadingLab: page('./tier2-reading-lab.html'),
  grade2TestReviewPrototype: page('./grade2-test-review-prototype.html'),
  learningGamesHarness: page('./learning-games-harness.html'),
  skywritingHarness: page('./skywriting-harness.html'),
  skywritingAcquisitionHarness: page('./skywriting-acquisition-harness.html'),
  skywritingFontComparison: page('./skywriting-font-comparison.html'),
  grade5SourceHarness: page('./grade5-source-harness.html'),
  kindergartenSourceHarness: page('./kindergarten-source-harness.html'),
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
        ...(mode === 'prototype-baseline' ? archivedPrototypeInputs : {}),
      },
    },
  },
}))
