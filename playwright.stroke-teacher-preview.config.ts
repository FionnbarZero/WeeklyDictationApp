import { defineConfig } from '@playwright/test'

const hostedUrl = process.env.STROKE_TEACHER_TEST_URL

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'strokeTeacherPrototype.spec.ts',
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: hostedUrl || 'http://127.0.0.1:5186',
    trace: 'retain-on-failure',
  },
  webServer: hostedUrl
    ? undefined
    : {
        command: 'npm run preview -- --outDir stroke-teacher-preview-dist --host 127.0.0.1 --port 5186 --strictPort',
        url: 'http://127.0.0.1:5186/stroke-teacher-preview.html',
        reuseExistingServer: false,
        timeout: 120_000,
      },
})
