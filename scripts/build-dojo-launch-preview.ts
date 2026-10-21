import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

// Build only a separate, local-profile prototype. No publisher or cloud account.
const root = resolve(import.meta.dirname, '..')
const grade5Repairs = process.argv.includes('--grade5-repairs')
const regressions = grade5Repairs || process.argv.includes('--regressions-oct20')
const out = resolve(
  root,
  grade5Repairs ? 'grade5-repair-preview-dist' : regressions ? 'regression-preview-dist' : 'dojo-launch-preview-dist',
)
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const octoberResources = process.argv.includes('--kindergarten-oct19')
const prototype = grade5Repairs
  ? 'Grade 5 regression repairs / Prototype 2'
  : regressions
    ? 'October 20 regression repairs / Prototype 3'
    : octoberResources
      ? 'Kindergarten October 19 resources / Prototype 1'
      : 'Writing reliability / Prototype 2'
const description = regressions
  ? 'Reading, writing, games, audio and Exit repairs'
  : octoberResources
    ? 'October 19 writing and reading resources'
    : 'Audio and exit repairs'
const bannerLabel = regressions || octoberResources ? prototype : 'Writing reliability · Prototype 2'
const grades = [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const
for (const [slug, grade] of grades) {
  await validateCurriculum(
    readFileSync(resolve(root, `tests/fixtures/dojo-launch-2026-10-16/${slug}.json`), 'utf8'),
    grade,
  )
}
execFileSync(
  process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'writing-pilot', '--outDir', out],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
      VITE_CURRICULUM_URL: '/curriculum/beta',
      VITE_GRADE2_WRITING_PILOT: 'true',
      VITE_CROSS_GRADE_WRITING_PILOT: 'true',
      VITE_RECONCILIATION_PREVIEW: 'true',
      VITE_PUBLIC_PREVIEW: 'true',
      VITE_GIT_REVISION: revision,
      VITE_REGRESSION_REPAIR_PREVIEW: String(regressions),
      VITE_GRADE5_REPAIR_PREVIEW: String(grade5Repairs),
    },
  },
)
if (grade5Repairs) {
  const shared = resolve(root, 'grade5-shared-target-repair-dist')
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'vite.grade5-oct23.config.ts',
      '--mode',
      'writing-pilot',
      '--outDir',
      shared,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_GIT_REVISION: revision,
        VITE_REGRESSION_REPAIR_PREVIEW: 'true',
        VITE_GRADE5_REPAIR_PREVIEW: 'true',
      },
    },
  )
  cpSync(shared, out, { recursive: true })
}
for (const [slug] of grades) {
  copyFileSync(
    resolve(root, `tests/fixtures/dojo-launch-2026-10-16/${slug}.json`),
    resolve(out, `curriculum/beta/${slug}.json`),
  )
}
const entry = resolve(out, 'family-beta-preview.html')
writeFileSync(
  entry,
  readFileSync(entry, 'utf8').replace(
    /(<body\b[^>]*>)/,
    `$1\n<style>body:has(.beta-grade-frame[data-writing-stage="true"]:not([hidden])) > .dojo-prototype-note { display:none }</style><aside class="dojo-prototype-note" role="note" style="padding:12px;text-align:center;background:#fff2cc;color:#332800;font:600 16px system-ui">${bannerLabel} · ${revision.slice(0, 7)} · ${description} · Test learners only · Browser-only progress; no account or cloud saving</aside>`,
  ),
)
const files = artifactFileRecords(out).filter((file) => file.path !== 'dojo-launch-manifest.json')
writeFileSync(
  resolve(out, 'dojo-launch-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype,
      ...(octoberResources ? { resourceLessonStartDate: '2026-10-19' } : {}),
      sourceRevision: revision,
      curriculumSnapshotDate: '2026-10-16',
      targetActivation: 'scheduled-start-date',
      persistence: 'Synthetic browser-only progress. No family account, cloud sync or offline app-shell installation.',
      fileTreeSha256: fileTreeSha256(files),
      files,
    },
    null,
    2,
  ),
)
console.log(`Isolated prototype ready: ${entry}`)
