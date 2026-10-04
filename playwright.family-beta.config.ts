import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'familyBetaArtifacts.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx vite preview --outDir family-beta-dist/kindergarten --host 127.0.0.1 --port 5197',
      url: 'http://127.0.0.1:5197',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite preview --outDir family-beta-dist/grade5 --host 127.0.0.1 --port 5198',
      url: 'http://127.0.0.1:5198',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite preview --outDir family-beta-dist/grade2 --host 127.0.0.1 --port 5199',
      url: 'http://127.0.0.1:5199',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
