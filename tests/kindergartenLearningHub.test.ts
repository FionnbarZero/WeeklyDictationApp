import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { kindergartenCurrentSourceWeek, kindergartenPreviousSourceWeek } from '../src/kindergartenLab/currentWeek.ts'
import { kindergartenLearningHubView } from '../src/kindergartenLab/learningHub.ts'
import {
  kindergartenCompletedUnitPoolForLab,
  kindergartenNinjaUnitPoolsForLab,
  kindergartenUnitPoolForLab,
} from '../src/kindergartenLab/unitReview.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'

const workbook = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as SheetsWorkbookPayload
const candidates = inspectKindergartenWorkbook(workbook)
const reviewWeek = candidates.find((candidate) => candidate.rawDate === 'Week 7 09/28')!
const nextUnit = candidates.find((candidate) => candidate.rawDate === 'Week 8 10/05')!

function hubFor(candidate: typeof nextUnit) {
  return kindergartenLearningHubView(
    candidate,
    kindergartenUnitPoolForLab(candidates, candidate),
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

test('the current-week Dojo contains only writing and reading', () => {
  assert.deepEqual(hub.sections[0].activities.map((activity) => activity.title), [
    'Writing characters',
    'High-frequency words',
  ])
  assert.ok(hub.sections[0].activities.every((activity) => activity.action.kind === 'launch'))
})

test('Ninja Skills offers three games and keeps every arrived unit in a separate selectable cohort', () => {
  assert.deepEqual(hub.sections[1].activities.map((activity) => activity.title), [
    'Listening Lily Pads',
    'Memory Lanterns',
    'Sky Writing',
  ])
  assert.equal(hub.sections[1].cohortPickerLabel, 'Choose a unit')
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

test('Final Boss owns the growing active-unit pool and Spirit Realm owns the completed-unit pool', () => {
  assert.deepEqual(hub.sections[2].activities.map((activity) => activity.title), ['Writing Test', 'Reading Test'])
  assert.deepEqual(hub.sections[3].activities.map((activity) => activity.title), ['Writing mastery warmup', 'Reading mastery'])
  assert.equal(hub.sections[2].cohorts[0].label, 'Unit 2 · 1 week')
  assert.equal(hub.sections[2].cohorts[0].groups[0].words.length, 2)
  assert.equal(hub.sections[2].cohorts[0].groups[1].words.length, 3)
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
  assert.equal(hub.sections[2].cohorts[0].label, 'Unit 2 · 1 week')
  assert.equal(hub.sections[3].cohorts[0].label, 'Unit 1 · 4 weeks')
})
