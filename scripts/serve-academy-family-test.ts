import { academyReleaseEnvironment } from './academyReleaseBuild.ts'

Object.assign(process.env, academyReleaseEnvironment)
await import('./serve-family-sync-test.ts')
