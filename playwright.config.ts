import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  // Mode-specific and frozen-reference suites run in their dedicated required
  // CI steps; the ordinary development server is not those preview versions.
  testIgnore: [
    'familyBetaArtifacts.spec.ts',
    'prototypeVisuals.spec.ts',
    'writingRefinement.spec.ts',
    'writingIpad.spec.ts',
    'crossGradeWriting.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5185',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5185',
    url: 'http://127.0.0.1:5185',
    env: { VITE_GIT_REVISION: '0000000000000000000000000000000000000000' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
