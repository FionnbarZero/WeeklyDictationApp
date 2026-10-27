import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const root = resolve(import.meta.dirname, '..')
const output = resolve(process.argv[2] || 'family-beta-artifacts/device-sync-2026-10-27/package')
if (existsSync(output)) throw new Error('Use a new immutable device-test package directory.')
// Reuse the clean-source, authenticated family packager and its offline shell.
// The browser configuration is the existing public family configuration; no
// auth provider, database policy, hosting or real-family migration is changed.
const result = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/package-family-sync.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    DEVICE_ACCEPTANCE_PREVIEW: 'true',
    GRADE5_READING_REVIEW_PREVIEW: 'true',
    VITE_REGRESSION_REPAIR_PREVIEW: 'true',
    VITE_GRADE5_REPAIR_PREVIEW: 'true',
    VITE_COMPACT_PARENT_PREVIEW: 'true',
    VITE_RETIRE_STANDALONE_GAMES: 'true',
    VITE_WRITING_CORRECTION_PREVIEW: 'true',
    VITE_W1_CURRICULUM_PREVIEW: 'true',
    VITE_W2_RECOVERY_PREVIEW: 'true',
    VITE_GAME_CONTENT_PREVIEW: 'true',
    VITE_AUTOMATIC_CURRICULUM_PREVIEW: 'true',
    VITE_KORE_VOICE_PREVIEW: 'true',
    VITE_INTEGRATED_WARMUP_PREVIEW: 'true',
    VITE_GRADE2_WETLAND_REVIEW_PREVIEW: 'true',
    VITE_OCT26_REPORTS_PREVIEW: 'true',
    VITE_GIT_REVISION: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  },
})
console.log(result)
const artifact = JSON.parse(result.slice(result.lastIndexOf('\n{') + 1)) as { directory: string; revision: string }
cpSync(artifact.directory, output, { recursive: true })
const family = JSON.parse(readFileSync(resolve(output, 'family-beta-manifest.json'), 'utf8'))
if (family.sourceRevision !== artifact.revision || family.firebaseProject !== 'weeklydictationapp')
  throw new Error('The device-test family package identity differs.')
const files = artifactFileRecords(output)
writeFileSync(
  resolve(output, 'device-acceptance-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype: 'Combined Dojo / Device and syncing 1',
      sourceRevision: artifact.revision,
      firebaseProject: family.firebaseProject,
      entry: 'family-beta-preview.html',
      grades: ['Kindergarten', 'Grade 2', 'Grade 5'],
      testAccountsOnly: true,
      recordings: 'Temporary only; never synchronized.',
      limitations:
        'Isolated test-account prototype. Physical iPad/iMac acceptance pending. No real-family migration or canonical update.',
      fileTreeSha256: fileTreeSha256(files),
      files,
    },
    null,
    2,
  ),
)
console.log(JSON.stringify({ output, revision: artifact.revision, fileTreeSha256: fileTreeSha256(files) }, null, 2))
