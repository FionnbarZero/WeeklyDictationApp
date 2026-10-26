import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { recoverGrade2Wetland } from '../../src/familyBeta/grade2WetlandReview.ts'
import type { CurriculumSnapshot } from '../../src/familyBeta/curriculum.ts'

export const grades = [
  { slug: 'kindergarten', label: 'Kindergarten', write: 'Writing characters', week: '2026-10-19' },
  { slug: 'grade2', label: 'Grade 2', write: 'Learn to Write', week: '2026-10-13' },
  { slug: 'grade5', label: 'Grade 5', write: 'Learn to Write', week: '2026-10-05' },
] as const
export function snapshot(slug: string) {
  const value = JSON.parse(
    readFileSync(new URL(`../fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
  return { ...value, retrievedAt: '2026-10-23T12:00:00.000Z' }
}
export function futureSnapshot(slug: string) {
  const value = snapshot(slug),
    payload = value.payload
  if (payload.sourceType === 'google-sheets') {
    const sheet = structuredClone(payload.sheets![0])
    sheet.sheetId = 987654321
    sheet.title = 'Week 11 10/26'
    sheet.values = [['Mandarin'], ['We will learn…\n- High frequency word 你、家、森林\n- Writing character 一、二']]
    payload.sheets!.unshift(sheet)
  } else if (payload.sourceType === 'google-slides' && slug === 'grade2') {
    const slide = structuredClone(payload.slides!.find((s) => JSON.stringify(s).includes('Week 10/13'))!)
    slide.objectId = 'automatic-future-grade2'
    slide.text = slide.text!.replace(/Week[^\n]+/, 'Week 10/26-10/30')
    payload.slides!.unshift(slide)
  } else if (payload.sourceType === 'google-slides') {
    const slide = JSON.parse(JSON.stringify(payload.slides![0]).replace('Week 9 (10/5-9)', 'Week 12 (10/26-30)'))
    // Grade 5 requires the top row to confirm the previous cohort. Only the
    // bottom upcoming vocabulary changes; do not fabricate a broken chain.
    for (const element of slide.pageElements) {
      const rows = element.table?.tableRows
      if (rows) rows[rows.length - 1] = JSON.parse(JSON.stringify(rows[rows.length - 1]).replaceAll('盐', '一'))
    }
    slide.objectId = 'automatic-future-grade5'
    payload.slides!.unshift(slide)
  }
  value.retrievedAt = '2026-10-24T12:00:00.000Z'
  value.contentSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return value
}

/** The new preview validates then recovers the one reviewed truncated Wetland slide. */
export async function expectedSnapshotHash(value: CurriculumSnapshot) {
  return (process.env.REPORT_REPAIRS_AUDIT === '1' ? await recoverGrade2Wetland(value) : value).contentSha256
}
