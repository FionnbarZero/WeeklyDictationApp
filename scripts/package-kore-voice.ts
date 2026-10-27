import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const root = resolve(import.meta.dirname, '..')
const output = resolve(process.argv[2] || 'family-beta-artifacts/kore-2026-10-26/package')
if (existsSync(output)) throw new Error('Use a new immutable package directory.')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const readingRecognition = process.argv.includes('--grade5-reading-review')
const readingSource = readingRecognition
  ? JSON.parse(readFileSync(resolve(root, 'src/grade5RecognitionReview/source.json'), 'utf8'))
  : null
execFileSync(
  process.execPath,
  [
    '--experimental-strip-types',
    'scripts/build-dojo-launch-preview.ts',
    '--integrated-warmup',
    ...(readingRecognition ? ['--grade5-reading-review'] : []),
  ],
  {
    cwd: root,
    stdio: 'inherit',
  },
)
cpSync(resolve(root, 'kore-voice-preview-dist'), output, { recursive: true })
const files = artifactFileRecords(output)
writeFileSync(
  resolve(output, 'kore-voice-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype: readingRecognition ? 'Combined Dojo / Grade 5 recognition review 1' : 'Combined Dojo / Wetland book 1',
      sourceRevision: revision,
      voice: 'cmn-CN-Chirp3-HD-Kore',
      speakingRate: 0.65,
      grades: ['Kindergarten', 'Grade 2', 'Grade 5'],
      entry: 'family-beta-preview.html',
      ...(readingSource
        ? {
            readingReview: {
              grade: 'Grade 5',
              targets: readingSource.targets.length,
              sourceDocumentId: readingSource.documentId,
              sourceDocumentSha256: readingSource.documentSha256,
              studyStart: readingSource.studyStart,
              assessmentStart: readingSource.assessmentStart,
              assessmentEnd: readingSource.assessmentEnd,
              writing: 'coming-soon-disabled',
              spiritRealm: 'existing-mastered-pool',
            },
          }
        : {}),
      limitations:
        'Isolated browser-only test learners. Current and retained curriculum recordings; unrecorded future text or failed media uses existing browser speech recovery. English unchanged. Physical-device acceptance and canonical integration pending. Frozen Grade 5 excluded.',
      fileTreeSha256: fileTreeSha256(files),
      files,
    },
    null,
    2,
  ),
)
console.log(`Prepared all-grade Kore prototype: ${output}`)
