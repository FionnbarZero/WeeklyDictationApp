import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateCurriculum } from '../src/familyBeta/curriculum.ts'
import {
  buildGrade5AssessmentPayload,
  extractGrade5Assessment,
  GRADE5_ASSESSMENT_SOURCE_ID,
} from '../src/grade5PresentationPreview/assessmentSource.ts'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

// Build only a separate, local-profile prototype. No publisher or cloud account.
const root = resolve(import.meta.dirname, '..')
const w1Curriculum = process.argv.includes('--w1-curriculum')
const w0Writing = w1Curriculum || process.argv.includes('--w0-writing')
const standalone = process.argv.includes('--grade5-standalone')
if (w0Writing && (standalone || process.argv.includes('--grade5-presentation')))
  throw new Error('W0 must use its separate all-grade package. The Grade 5 presentation website is frozen.')
const presentation = standalone || process.argv.includes('--grade5-presentation')
const retireStandalone = w0Writing || presentation || process.argv.includes('--retire-standalone-games')
const compactParents = retireStandalone || process.argv.includes('--compact-parent-controls')
const grade5Repairs = compactParents || process.argv.includes('--grade5-repairs')
const regressions = grade5Repairs || process.argv.includes('--regressions-oct20')
const out = resolve(
  root,
  w1Curriculum
    ? 'w1-curriculum-preview-dist'
    : w0Writing
      ? 'w0-writing-preview-dist'
      : standalone
        ? 'grade5-standalone-dist'
        : presentation
          ? 'grade5-presentation-preview-dist'
          : grade5Repairs
            ? 'grade5-repair-preview-dist'
            : regressions
              ? 'regression-preview-dist'
              : 'dojo-launch-preview-dist',
)
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const octoberResources = process.argv.includes('--kindergarten-oct19')
const prototype = w1Curriculum
  ? 'W1 curriculum and activity entry / Prototype 3'
  : w0Writing
    ? 'W0 integrated writing / Prototype 2'
    : standalone
      ? '5th grade Dojo / Standalone 1'
      : presentation
        ? '10/19 – Fifth Grade Ninja Dojo / Integrated Preview 3'
        : retireStandalone
          ? 'Streamlined Dojo / Prototype 1'
          : compactParents
            ? 'Compact parent toolbar / Prototype 1'
            : grade5Repairs
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
      VITE_COMPACT_PARENT_PREVIEW: String(compactParents),
      VITE_RETIRE_STANDALONE_GAMES: String(retireStandalone),
      VITE_GRADE5_PRESENTATION_PREVIEW: String(presentation),
      VITE_GRADE5_STANDALONE: String(standalone),
      VITE_WRITING_CORRECTION_PREVIEW: String(w0Writing),
      VITE_W1_CURRICULUM_PREVIEW: String(w1Curriculum),
    },
  },
)
if (grade5Repairs && !presentation) {
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
if (presentation) {
  const baseline = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/dojo-launch-2026-10-16/grade5.json'), 'utf8'))
  const payload = buildGrade5AssessmentPayload(baseline.payload)
  extractGrade5Assessment(payload)
  writeFileSync(
    resolve(out, 'curriculum/beta/grade5.json'),
    JSON.stringify(
      {
        ...baseline,
        sourceId: GRADE5_ASSESSMENT_SOURCE_ID,
        retrievedAt: new Date().toISOString(),
        sourceModifiedAt: null,
        contentSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        payload,
      },
      null,
      2,
    ),
  )
}
for (const [slug] of grades) {
  if (presentation && slug === 'grade5') continue
  copyFileSync(
    resolve(root, `tests/fixtures/dojo-launch-2026-10-16/${slug}.json`),
    resolve(out, `curriculum/beta/${slug}.json`),
  )
}
const entry = resolve(out, 'family-beta-preview.html')
if (w0Writing)
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8').replace(
      /<title>[^<]*<\/title>/,
      `<title>${w1Curriculum ? 'Ninja Dojo · W1 integrated test' : 'W0 integrated writing'}</title>`,
    ),
  )
if (presentation)
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8').replace(
      /<title>[^<]*<\/title>/,
      `<title>${standalone ? '5th grade Dojo' : '10/19 – Fifth Grade Ninja Dojo'}</title>`,
    ),
  )
if (!compactParents)
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8').replace(
      /(<body\b[^>]*>)/,
      `$1\n<style>body:has(.beta-grade-frame[data-writing-stage="true"]:not([hidden])) > .dojo-prototype-note { display:none }</style><aside class="dojo-prototype-note" role="note" style="padding:12px;text-align:center;background:#fff2cc;color:#332800;font:600 16px system-ui">${bannerLabel} · ${revision.slice(0, 7)} · ${description} · Test learners only · Browser-only progress; no account or cloud saving</aside>`,
    ),
  )
if (standalone) {
  copyFileSync(resolve(root, 'site/5th-grade-dojo/_headers'), resolve(out, '_headers'))
  copyFileSync(resolve(root, 'site/5th-grade-dojo/_redirects'), resolve(out, '_redirects'))
}
const files = artifactFileRecords(out).filter((file) => file.path !== 'dojo-launch-manifest.json')
writeFileSync(
  resolve(out, 'dojo-launch-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype,
      ...(w1Curriculum
        ? {
            curriculumEntry:
              'Explicit joined/split stroke-order heading correction preserves old work; inherited game/section report context; retained-source resource inventory. Parent target editor is separate W0c.',
          }
        : {}),
      ...(w0Writing
        ? {
            grades: ['Kindergarten', 'Grade 2', 'Grade 5'],
            writingCorrection:
              'New Grade 2 writing attempts: copy once, memory once, repeat until correct. Other grades and existing pinned lessons retain their rules.',
            longWriting:
              'No 500-assessment cutoff. Lossless long-history storage; existing byte, owner and stale-writer safeguards retained.',
          }
        : {}),
      ...(standalone
        ? {
            name: '5th grade Dojo',
            edition: 'standalone-browser-only',
            approvedPreviewRevision: '97c559d74db813ef839a0a3c793838c2c33a4f38',
          }
        : {}),
      ...(presentation
        ? { grades: ['Grade 5'], assessment: '2026-10-23 · PDF page 2 · eight shared reading/writing targets' }
        : {}),
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
