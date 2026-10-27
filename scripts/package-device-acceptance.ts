import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'
import { packageOfflineShell } from './familyOfflineShell.ts'

const root = resolve(import.meta.dirname, '..')
const output = resolve(process.argv[2] || 'family-beta-artifacts/device-sync-2026-10-27/package')
if (existsSync(output)) throw new Error('Use a new immutable device-test package directory.')
// Separate Firebase preview: no canonical publication or immutable-cache rules.
// Preserve the canonical packager's provider limits instead of weakening them.
if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
  throw new Error('Commit tested source before packaging.')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
execFileSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--mode', 'family-sync', '--base=./', '--outDir', output],
  {
    cwd: root,
    stdio: 'inherit',
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
  },
)
for (const [entry, grade] of [
  ['index.html', ''],
  ['kindergarten-learning-lab.html', 'kindergarten'],
  ['grade5-learning-hub.html', 'grade5'],
] as const) {
  const path = resolve(output, entry)
  const redirect = grade
    ? `<script>if(window.parent===window){const q=new URLSearchParams(location.search);q.delete('family-preview');if(!q.has('grade'))q.set('grade','${grade}');location.replace('./family-beta-preview.html?'+q);}</script>`
    : `<script>if(window.parent===window)location.replace('./family-beta-preview.html'+location.search);</script>`
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace('<head>', () => `<head>${redirect}`),
  )
}
packageOfflineShell(output, revision)
const familyFiles = artifactFileRecords(output)
const family = {
  schema: 1,
  sourceRevision: revision,
  entry: 'family-beta-preview.html',
  firebaseProject: 'weeklydictationapp',
  persistence: 'Authenticated test accounts only; reviewed checkpoints and scores sync; recordings remain temporary.',
  fileTreeSha256: fileTreeSha256(familyFiles),
  files: familyFiles,
}
writeFileSync(resolve(output, 'family-beta-manifest.json'), JSON.stringify(family, null, 2))
const files = artifactFileRecords(output)
writeFileSync(
  resolve(output, 'device-acceptance-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype: 'Combined Dojo / Device and syncing 1',
      sourceRevision: revision,
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
console.log(JSON.stringify({ output, revision, fileTreeSha256: fileTreeSha256(files) }, null, 2))
