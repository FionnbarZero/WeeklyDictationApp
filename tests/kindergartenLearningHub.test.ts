import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { kindergartenLearningHubView } from '../src/kindergartenLab/learningHub.ts'
import { kindergartenUnitReviewForLab } from '../src/kindergartenLab/unitReview.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'

const workbook = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as SheetsWorkbookPayload
const candidates = inspectKindergartenWorkbook(workbook)
const current = candidates.find((candidate) => candidate.rawDate === 'Week 6 09/21')!
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
  assert.deepEqual(hub.sections[2].activities.map((activity) => activity.title), ['Prepare for your test'])
  assert.deepEqual(hub.sections[3].activities.map((activity) => activity.title), ['Mastery warmup'])
  assert.equal(hub.sections[2].cohorts[0].groups[0].words.length, 14)
  assert.equal(hub.sections[3].cohorts[0].groups[1].words.length, 9)
})
