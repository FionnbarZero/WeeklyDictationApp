import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { CurriculumSnapshot } from '../../src/familyBeta/curriculum.ts'

export const newlySupported = [
  {
    slug: 'kindergarten',
    grade: 'Kindergarten',
    week: '2026-10-26',
    writing: ['大', '马'],
    reading: ['绿色', '黄色', '吃'],
  },
  {
    slug: 'grade5',
    grade: 'Grade 5',
    week: '2026-10-13',
    writing: ['名字', '穷', '穷苦', '家庭', '勇敢', '喜爱', '伟大'],
    reading: ['表现', '州', '造成', '不便', '成立', '银行', '国家', '方便', '建议', '印在'],
  },
] as const

export function currentSnapshot(slug: string): CurriculumSnapshot {
  return JSON.parse(readFileSync(new URL(`../fixtures/game-content-2026-10-26/${slug}.json`, import.meta.url), 'utf8'))
}

/** Test-only future source response. It exercises the normal earlier-target
 * game selector without advancing children, changing source documents, adding
 * a test menu, or weakening the game cohort/minimum-size rules. All original
 * source units remain byte-for-byte intact. */
export function nextLessonSnapshot(slug: string): CurriculumSnapshot {
  const value = currentSnapshot(slug)
  const payload = value.payload
  if (payload.sourceType === 'google-sheets') {
    payload.sheets!.unshift({
      sheetId: 987654322,
      title: 'Week 12 11/02',
      values: [['Mandarin'], ['We will learn…\n- High frequency word 你、家、森林\n- Writing character 一、二']],
    })
  } else if (payload.sourceType === 'google-slides') {
    const slide = structuredClone(payload.slides![0])
    slide.objectId = 'test-only-next-lesson-grade5'
    slide.text = 'Week 13 (11/2-6)'
    slide.pageElements = slide.pageElements!.filter((element) => 'table' in element)
    for (const element of slide.pageElements) {
      const rows = element.table?.tableRows
      if (!rows) continue
      // Preserve this week's real confirmation row. Replace only the cloned
      // future slide's upcoming section with a distinct, already-supported set.
      rows.splice(2, rows.length - 2, {
        tableCells: [
          {
            text: {
              textElements: [
                {
                  textRun: {
                    content:
                      'Coming next week.\nCore vocab:\nTier 1: 盐、咸、层、用处、神奇的\nTier 2: 河流、躺、留、不断地、美味的、刷牙、洒、沉、浮\nTier 3: 蒸发、消毒、融化、溶解',
                  },
                },
              ],
            },
          },
        ],
      })
    }
    payload.slides!.unshift(slide)
  }
  value.retrievedAt = '2026-11-02T18:00:00.000Z'
  value.contentSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return value
}
