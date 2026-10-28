import { execFileSync } from 'node:child_process'
import { academyReleaseEnvironment } from './academyReleaseBuild.ts'

// Reuse the canonical packager, including its clean-source, exact-cache-path,
// offline-shell and manifest guards. This command never publishes anything.
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/package-family-sync.ts'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
  env: { ...process.env, ...academyReleaseEnvironment },
})
