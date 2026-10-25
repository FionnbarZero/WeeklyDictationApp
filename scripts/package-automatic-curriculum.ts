import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const root = resolve(import.meta.dirname, '..')
const base = resolve(root, 'family-beta-artifacts/prototypes/warmup-design-9a0cce3/package')
const out = resolve(process.argv[2] || 'automatic-curriculum-combined-dist')
if (existsSync(out)) throw new Error('Use a new package folder; never overwrite a retained package.')
const manifest = JSON.parse(readFileSync(resolve(base, 'warmup-design-manifest.json'), 'utf8'))
if (manifest.sourceRevision !== '9a0cce38eea05690ac7bb51ce9968d658b0e0b49') throw new Error('Wrong retained baseline.')
for (const file of manifest.files) {
  const bytes = readFileSync(resolve(base, file.path))
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    throw new Error(`Baseline mismatch: ${file.path}`)
}
execFileSync(
  process.execPath,
  ['--experimental-strip-types', 'scripts/build-dojo-launch-preview.ts', '--automatic-curriculum'],
  { cwd: root, stdio: 'inherit' },
)
cpSync(base, out, { recursive: true })
cpSync(resolve(root, 'automatic-curriculum-preview-dist'), resolve(out, 'automatic-curriculum'), { recursive: true })
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const files = artifactFileRecords(out)
writeFileSync(
  resolve(out, 'automatic-curriculum-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype: 'Automatic curriculum updates / Prototype 1',
      sourceRevision: revision,
      entry: 'automatic-curriculum/family-beta-preview.html',
      grades: ['Kindergarten', 'Grade 2', 'Grade 5'],
      originalCombinedRevision: manifest.baseApplicationRevision,
      originalWarmupRevision: manifest.sourceRevision,
      originalApplicationFilesUnchanged: true,
      source: 'Existing approved read-only Google curriculum service; no backend deployment or teacher-document edits.',
      limitations:
        'Isolated browser-only test learners. Scheduled date and safe-menu activation. Native Warmup design integration and authenticated cloud acceptance remain separate.',
      fileTreeSha256: fileTreeSha256(files),
      files,
    },
    null,
    2,
  ),
)
console.log(`Isolated automatic curriculum package: ${out}`)
