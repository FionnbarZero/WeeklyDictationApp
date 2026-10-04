import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { kindergartenCurrentSourceWeek } from '../src/kindergartenLab/currentWeek.ts'
import { kindergartenLearningHubView } from '../src/kindergartenLab/learningHub.ts'
import { kindergartenUnitReviewForLab } from '../src/kindergartenLab/unitReview.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'

const workbook = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as SheetsWorkbookPayload
const candidates = inspectKindergartenWorkbook(workbook)
const current = candidates.find((candidate) => candidate.rawDate === 'Week 6 09/21')!
const reviewWeek = candidates.find((candidate) => candidate.rawDate === 'Week 7 09/28')!
const nextUnit = candidates.find((candidate) => candidate.rawDate === 'Week 8 10/05')!
const review = kindergartenUnitReviewForLab(candidates)
const hub = kindergartenLearningHubView(current, review)

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

test('Ninja Skills offers three distinct Kindergarten games', () => {
  assert.deepEqual(hub.sections[1].activities.map((activity) => activity.title), [
    'Listening Lily Pads',
    'Memory Lanterns',
    'Sky Writing',
  ])
})

test('Final Boss owns cumulative review and Spirit Realm owns mastery warmup', () => {
  assert.deepEqual(hub.sections[2].activities.map((activity) => activity.title), ['Writing Test', 'Reading Test'])
  assert.deepEqual(hub.sections[3].activities.map((activity) => activity.title), ['Writing mastery warmup', 'Reading mastery'])
  assert.equal(hub.sections[2].cohorts[0].groups[0].words.length, 14)
  assert.equal(hub.sections[3].cohorts[0].groups[1].words.length, 9)
})

test('the authoritative top spreadsheet tab selects the current curriculum week', () => {
  assert.equal(kindergartenCurrentSourceWeek(candidates)?.rawDate, 'Week 8 10/05')
})

test('the Unit 1 review week opens the Final Boss and holds acquisition and mastery', () => {
  const reviewHub = kindergartenLearningHubView(reviewWeek, review)
  assert.deepEqual(reviewHub.sections.map((section) => [section.id, section.available]), [
    ['current-week', false],
    ['ninja-skills', false],
    ['final-boss', true],
    ['spirit-realm', false],
  ])
  assert.equal(reviewHub.sections[0].cohorts[0].label, 'Week 7 09/28')
  assert.match(reviewHub.heroDescription, /Unit 1 review week/)
})

test('the week after review opens the next acquisition cohort and moves Unit 1 to mastery', () => {
  const nextHub = kindergartenLearningHubView(nextUnit, review)
  assert.deepEqual(nextHub.sections.map((section) => [section.id, section.available]), [
    ['current-week', true],
    ['ninja-skills', true],
    ['final-boss', false],
    ['spirit-realm', true],
  ])
  assert.equal(nextHub.sections[0].cohorts[0].label, 'Week 8 10/05')
})
