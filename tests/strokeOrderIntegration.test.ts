import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import type { Dataset, PracticeTarget } from '../src/domain.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import { kindergartenCurrentSourceWeek } from '../src/kindergartenLab/currentWeek.ts'
import { STROKE_ORDER_ACTIVITY_IDS } from '../src/learningGames/strokeOrder/contracts.ts'
import { grade2StrokeOrderConfig } from '../src/learningGames/strokeOrder/grade2Adapter.ts'
import { kindergartenStrokeOrderConfig } from '../src/learningGames/strokeOrder/kindergartenAdapter.ts'
import { buildStrokeOrderRounds } from '../src/learningGames/strokeOrder/rounds.ts'

const workbook = JSON.parse(
  readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8'),
) as SheetsWorkbookPayload

function grade2Target(words: string[]): PracticeTarget {
  const dataset: Dataset = {
    id: 'grade-2__2026-27__2026-09-21__2026-09-25',
    dateRange: '9/21–9/25',
    startDate: '2026-09-21',
    endDate: '2026-09-25',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    description: 'Stroke Order fixture',
    words: words.map((text, index) => ({
      id: `grade2-word-${index + 1}`,
      text,
      sentence: '',
      datasetId: 'grade-2__2026-27__2026-09-21__2026-09-25',
      grade: 'Grade 2',
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    })),
  }
  return { dataset, phase: 'acquisition' }
}

test('the grade adapters own distinct stable activity identities and timing', () => {
  const candidate = kindergartenCurrentSourceWeek(inspectKindergartenWorkbook(workbook))
  assert.ok(candidate)
  const kindergarten = kindergartenStrokeOrderConfig(candidate)
  const grade2 = grade2StrokeOrderConfig(grade2Target(['比如', '部分', '更', '方便', '美好']))

  assert.equal(kindergarten.activityId, STROKE_ORDER_ACTIVITY_IDS.kindergarten)
  assert.equal(grade2.activityId, STROKE_ORDER_ACTIVITY_IDS.grade2)
  assert.notEqual(kindergarten.activityId, grade2.activityId)
  assert.equal(kindergarten.timing.copySeconds, 10)
  assert.equal(grade2.timing.copySeconds, 20)
  assert.deepEqual(
    kindergarten.rounds.map((round) => round.targetText),
    ['牛', '羊'],
  )
  assert.deepEqual(
    grade2.rounds.map((round) => round.targetText),
    ['比如', '部分', '更', '方便', '美好'],
  )
})

test('multi-character rounds flatten geometry while resetting visible stroke numbers', () => {
  const built = buildStrokeOrderRounds([{ id: 'for-example', text: '比如' }])
  assert.deepEqual(built.unsupportedTargets, [])
  assert.equal(built.rounds.length, 1)
  assert.ok(built.rounds[0].strokes.some((stroke) => stroke.some(([x]) => x > 100)))
  assert.deepEqual(built.rounds[0].strokeLabels.slice(0, 6), [1, 2, 3, 4, 1, 2])
})

test('the current Grade 2 staging cohort has complete stroke geometry', () => {
  const current = grade2StrokeOrderConfig(grade2Target(['大', '小', '上', '下', '中']))
  assert.deepEqual(current.unsupportedTargets, [])
  assert.deepEqual(
    current.rounds.map((round) => [round.targetText, round.strokes.length]),
    [
      ['大', 3],
      ['小', 3],
      ['上', 3],
      ['下', 3],
      ['中', 4],
    ],
  )
})

test('a missing character asset fails the whole cohort closed', () => {
  const built = buildStrokeOrderRounds([
    { id: 'supported', text: '一' },
    { id: 'unsupported', text: '学校' },
  ])
  assert.deepEqual(built.rounds, [])
  assert.deepEqual(built.unsupportedTargets, ['学校'])
})

test('the shared Stroke Order presentation has no curriculum, Acquisition, or persistence dependency', () => {
  const presentation = readFileSync(
    new URL('../src/learningGames/strokeOrder/StrokeOrderActivity.tsx', import.meta.url),
    'utf8',
  )
  const imports = [...presentation.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).join('\n')
  assert.doesNotMatch(imports, /curriculum|acquisition|persistence|firestore|firebase|localStorage/i)
  assert.match(presentation, /StrokeOrderActivityProps/)
  assert.match(presentation, /data-activity-id=\{activityId\}/)
})
