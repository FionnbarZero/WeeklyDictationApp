import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { kindergartenCurrentSourceWeek, kindergartenPreviousSourceWeek } from '../src/kindergartenLab/currentWeek.ts'
import { kindergartenLearningHubView } from '../src/kindergartenLab/learningHub.ts'
import {
  kindergartenCompletedUnitPoolForLab,
  kindergartenNinjaUnitPoolsForLab,
  kindergartenFinalBossPoolForLab,
} from '../src/kindergartenLab/unitReview.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'

const workbook = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as SheetsWorkbookPayload
const candidates = inspectKindergartenWorkbook(workbook)
const reviewWeek = candidates.find((candidate) => candidate.rawDate === 'Week 7 09/28')!
const nextUnit = candidates.find((candidate) => candidate.rawDate === 'Week 8 10/05')!

function hubFor(candidate: typeof nextUnit) {
  return kindergartenLearningHubView(
    candidate,
    kindergartenFinalBossPoolForLab(candidates, candidate),
    kindergartenNinjaUnitPoolsForLab(candidates, candidate),
    kindergartenCompletedUnitPoolForLab(candidates, candidate),
  )
}

const hub = hubFor(nextUnit)

test('the Kindergarten hub exposes the four requested mastery paths', () => {
  assert.deepEqual(hub.sections.map((section) => section.title), [
    'Enter the Dojo',
    'Practice your Ninja Skills',
    'The Final Boss Test',
    'Enter the Spirit Realm',
  ])
  assert.equal(hub.sections[0].detailTitle, 'Welcome to the Dojo')
})

test('the current-week Dojo contains writing, Stroke Order, and reading', () => {
  assert.deepEqual(hub.sections[0].activities.map((activity) => activity.title), [
    'Writing characters',
    'Stroke Order',
    'High-frequency words',
  ])
  assert.ok(hub.sections[0].activities.every((activity) => activity.action.kind === 'launch'))
  const strokeOrder = hub.sections[0].activities[1]
  if (strokeOrder.action.kind === 'launch') {
    assert.equal(strokeOrder.action.launch.kind, 'dojo-stroke-order')
  }
})

test('Ninja Skills offers three games and keeps every arrived unit in a separate selectable cohort', () => {
  assert.deepEqual(hub.sections[1].activities.map((activity) => activity.title), [
    'Listening Lily Pads',
    'Memory Lanterns',
    'Sky Writing',
  ])
  assert.equal(hub.sections[1].cohortPickerLabel, 'Choose a unit')
  assert.equal(hub.sections[1].defaultCohortId, '__kindergarten-unit-2-ninja-lab__')
  assert.equal(hub.sections[1].cohortSummaryLabel, '2 units available')
  assert.deepEqual(hub.sections[1].cohorts.map((cohort) => cohort.label), [
    'Unit 1 · Building Communities',
    'Unit 2 · Needs and Environment',
  ])
  assert.equal(hub.sections[1].cohorts[0].groups[0].words.length, 14)
  assert.equal(hub.sections[1].cohorts[0].groups[1].words.length, 9)
  assert.deepEqual(hub.sections[1].cohorts[1].groups[0].words, ['牛', '羊'])
  assert.deepEqual(hub.sections[1].cohorts[1].groups[1].words, ['猫', '狗', '鸟'])
})

test('Final Boss keeps the complete reviewed unit instead of the current teaching week', () => {
  assert.deepEqual(hub.sections[2].activities.map((activity) => activity.title), ['Writing Test', 'Reading Test'])
  assert.deepEqual(hub.sections[3].activities.map((activity) => activity.title), ['Writing mastery warmup', 'Reading mastery'])
  assert.equal(hub.sections[2].cohorts[0].label, 'Unit 1 · 4 weeks')
  assert.equal(hub.sections[2].cohorts[0].groups[0].words.length, 14)
  assert.equal(hub.sections[2].cohorts[0].groups[1].words.length, 9)
  assert.equal(hub.sections[3].cohorts[0].label, 'Unit 1 · 4 weeks')
  assert.equal(hub.sections[3].cohorts[0].groups[0].words.length, 14)
  assert.equal(hub.sections[3].cohorts[0].groups[1].words.length, 9)
})

test('the authoritative top spreadsheet tab selects the current curriculum week', () => {
  const authoritativeCurrent = kindergartenCurrentSourceWeek(candidates)
  assert.equal(authoritativeCurrent?.rawDate, 'Week 8 10/05')
  assert.equal(kindergartenPreviousSourceWeek(candidates, authoritativeCurrent)?.rawDate, 'Week 7 09/28')
})

test('the Unit 1 review week opens its cumulative Final Boss and keeps its unit games available', () => {
  const reviewHub = hubFor(reviewWeek)
  assert.deepEqual(reviewHub.sections.map((section) => [section.id, section.available]), [
    ['current-week', false],
    ['ninja-skills', true],
    ['final-boss', true],
    ['spirit-realm', false],
  ])
  assert.equal(reviewHub.sections[0].cohorts[0].label, 'Week 7 09/28')
  assert.equal(reviewHub.sections[1].cohorts[0].label, 'Unit 1 · Building Communities')
  assert.equal(reviewHub.sections[2].cohorts[0].label, 'Unit 1 · 4 weeks')
  assert.match(reviewHub.heroDescription, /Unit 1 review week/)
})

test('the week after review opens Unit 2 everywhere it belongs and moves Unit 1 to mastery', () => {
  assert.deepEqual(hub.sections.map((section) => [section.id, section.available]), [
    ['current-week', true],
    ['ninja-skills', true],
    ['final-boss', true],
    ['spirit-realm', true],
  ])
  assert.equal(hub.sections[0].cohorts[0].label, 'Week 8 10/05')
  assert.equal(hub.sections[1].cohortSummaryLabel, '2 units available')
  assert.equal(hub.sections[2].cohorts[0].label, 'Unit 1 · 4 weeks')
  assert.equal(hub.sections[3].cohorts[0].label, 'Unit 1 · 4 weeks')
})

test('Final Boss includes every Unit 1 target and excludes every current-week target', () => {
  const pool = kindergartenFinalBossPoolForLab(candidates, nextUnit)!
  assert.deepEqual(pool.tier1Words, ['一', '二', '三', '人', '四', '五', '六', '心', '七', '八', '水', '九', '十', '白'])
  assert.deepEqual(pool.tier2Words, ['爸爸', '妈妈', '小', '我', '开心', '有', '没有', '红色', '蓝色'])
  for (const word of [...nextUnit.tier1, ...nextUnit.tier2]) {
    assert.ok(![...pool.tier1Words, ...pool.tier2Words].includes(word.text))
  }
  const beforeReview = candidates.find((candidate) => candidate.rawDate === 'Week 6 09/21')!
  assert.equal(kindergartenFinalBossPoolForLab(candidates, beforeReview), null)
})

test('future reviews do not leak backwards and later review weeks unlock their own entire unit', () => {
  const laterReview = { ...reviewWeek, curriculumUnit: nextUnit.curriculumUnit, normalizedStartDate: '2026-11-02', normalizedEndDate: '2026-11-08' }
  const all = [...candidates, laterReview]
  assert.equal(kindergartenFinalBossPoolForLab(all, nextUnit)?.unitId, 'unit-1')
  assert.deepEqual(kindergartenFinalBossPoolForLab(all, laterReview)?.tier1Words, ['牛', '羊'])
})
