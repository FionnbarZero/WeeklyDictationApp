import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildCurriculumSnapshot, publishCurriculumSnapshot } from '../backend/betaCurriculum.ts'
import { gradeSlugs } from '../src/familyBeta/curriculum.ts'
import type { CurriculumSourcePayload } from '../src/curriculum/model.ts'
import { BETA_GRADES } from '../src/familyBeta/model.ts'

// Bootstrap/recovery utility only. Normal refreshes are automatic in curriculumServer.ts.
// Usage: node --experimental-strip-types scripts/build-beta-snapshots.ts grade2 source.json [modified-ISO]
const [slug, path, modified = ''] = process.argv.slice(2)
const grade = BETA_GRADES.find((grade) => gradeSlugs[grade] === slug)
if (!grade || !path)
  throw new Error('Provide kindergarten|grade2|grade5, a source JSON path, and optional source modified time.')
{
  const raw = JSON.parse(await readFile(path, 'utf8'))
  const payload = {
    ...raw,
    sourceType: grade === 'Kindergarten' ? 'google-sheets' : 'google-slides',
  } as CurriculumSourcePayload
  const snapshot = buildCurriculumSnapshot(grade, payload, modified)
  await publishCurriculumSnapshot(resolve('public/curriculum/beta', `${gradeSlugs[grade]}.json`), snapshot)
  console.log(`${grade}: validated teacher-source snapshot written.`)
}
