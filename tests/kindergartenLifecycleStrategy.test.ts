import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { schoolYearToken } from '../src/curriculum/identity.ts'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import type { LifecycleContext, LifecycleSet } from '../src/lifecycle/contracts.ts'
import {
  lifecycleStrategyForGradeAndSchoolYear,
  resolveLifecycle,
} from '../src/lifecycle/registry.ts'
import {
  kindergarten2026UnitPlan,
  resolveKindergartenUnitLifecycle,
} from '../src/lifecycle/strategies/kindergartenUnitStrategy.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/kindergarten-workbook.json', import.meta.url))
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Omit<SheetsWorkbookPayload, 'sourceType'>
const candidates = inspectKindergartenWorkbook(fixture)
const vocabularySets: LifecycleSet[] = candidates
  .filter((candidate) => candidate.datasetId && candidate.assignedWeek && candidate.tier1.length > 0)
  .map((candidate) => ({
    datasetId: candidate.datasetId!,
    grade: candidate.grade,
    schoolYearKey: schoolYearToken(candidate.schoolYear),
    activationDate: candidate.assignedWeek!.startDate,
    instructionalEndDate: candidate.assignedWeek!.endDate,
    kind: 'vocabulary',
  }))
const idByStartDate = new Map(vocabularySets.map((set) => [set.activationDate, set.datasetId]))

function context(currentDateKey: string, sets: readonly LifecycleSet[] = vocabularySets): LifecycleContext {
  return {
    scope: { grade: 'Kindergarten', schoolYearKey: '2026-27', currentDateKey },
    sets,
    progressionEvents: [],
  }
}

function id(startDate: string) {
  const datasetId = idByStartDate.get(startDate)
  if (!datasetId) throw new Error(`Missing fixture dataset for ${startDate}.`)
  return datasetId
}

test('Kindergarten Unit 1 has explicit teaching and review boundaries from the source workbook', () => {
  assert.deepEqual(kindergarten2026UnitPlan, [{
    id: 'kindergarten-2026-27-unit-1',
    instructionStartDate: '2026-08-31',
    instructionEndDate: '2026-09-27',
    reviewStartDate: '2026-09-28',
    reviewEndDate: '2026-10-04',
    reviewCycle: 1,
  }])
  const profile = lifecycleStrategyForGradeAndSchoolYear('Kindergarten', '2026–2027')
  assert.equal(profile?.profileId, 'kindergarten-unit-lifecycle-2026-27')
  assert.equal(profile?.version, 1)
})

test('future Kindergarten weeks remain unavailable before Unit 1 begins', () => {
  const resolution = resolveLifecycle(context('2026-08-30'))

  assert.equal(resolution.acquisitionDatasetId, null)
  assert.deepEqual(resolution.testReviews, [])
  assert.deepEqual(resolution.masteryDatasetIds, [])
  assert.deepEqual(resolution.futureDatasetIds, [
    id('2026-08-31'),
    id('2026-09-07'),
    id('2026-09-14'),
    id('2026-09-21'),
  ])
})

test('each arrived week becomes the current Acquisition set and joins the cumulative unit review', () => {
  const resolution = resolveLifecycle(context('2026-09-13'))
  const firstWeek = id('2026-08-31')
  const currentWeek = id('2026-09-07')

  assert.equal(resolution.acquisitionDatasetId, currentWeek)
  assert.deepEqual(resolution.testReviews, [
    { datasetId: firstWeek, cycle: 1, reviewGroupId: 'kindergarten-2026-27-unit-1' },
    { datasetId: currentWeek, cycle: 1, reviewGroupId: 'kindergarten-2026-27-unit-1' },
  ])
  assert.deepEqual(resolution.futureDatasetIds, [id('2026-09-14'), id('2026-09-21')])
  assert.deepEqual(resolution.assignmentByDatasetId[firstWeek], {
    datasetId: firstWeek,
    stage: { kind: 'test-review', cycle: 1 },
    enteredStageOn: '2026-08-31',
  })
  assert.deepEqual(resolution.assignmentByDatasetId[currentWeek], {
    datasetId: currentWeek,
    stage: { kind: 'acquisition' },
    enteredStageOn: '2026-09-07',
  })
})

test('the final Unit 1 Sunday reviews every learned week without a weekly-review rollover', () => {
  const resolution = resolveLifecycle(context('2026-09-27'))

  assert.equal(resolution.acquisitionDatasetId, id('2026-09-21'))
  assert.deepEqual(resolution.testReviews, vocabularySets
    .slice()
    .sort((left, right) => left.activationDate.localeCompare(right.activationDate))
    .map((set) => ({
      datasetId: set.datasetId,
      cycle: 1,
      reviewGroupId: 'kindergarten-2026-27-unit-1',
    })))
  assert.deepEqual(resolution.masteryDatasetIds, [])
  assert.deepEqual(resolution.futureDatasetIds, [])
})

test('the week after instruction is a cumulative Unit 1 review with no Acquisition set', () => {
  const resolution = resolveLifecycle(context('2026-09-28'))
  const orderedIds = vocabularySets
    .slice()
    .sort((left, right) => left.activationDate.localeCompare(right.activationDate))
    .map((set) => set.datasetId)

  assert.equal(resolution.acquisitionDatasetId, null)
  assert.deepEqual(resolution.testReviews, orderedIds.map((datasetId) => ({
    datasetId,
    cycle: 1,
    reviewGroupId: 'kindergarten-2026-27-unit-1',
  })))
  assert.deepEqual(resolution.masteryDatasetIds, [])
  assert.deepEqual(resolution.masteredAtByDatasetId, {})
})

test('Unit 1 becomes mastery only after the review week and its assessment end', () => {
  const resolution = resolveLifecycle(context('2026-10-05'))
  const orderedIds = vocabularySets
    .slice()
    .sort((left, right) => left.activationDate.localeCompare(right.activationDate))
    .map((set) => set.datasetId)

  assert.equal(resolution.acquisitionDatasetId, null)
  assert.deepEqual(resolution.testReviews, [])
  assert.deepEqual(resolution.masteryDatasetIds, orderedIds)
  assert.deepEqual(resolution.masteredAtByDatasetId, Object.fromEntries(
    orderedIds.map((datasetId) => [datasetId, '2026-10-05']),
  ))
})

test('a missing weekly source holds the latest arrived teaching set and never invents a cohort', () => {
  const withoutSeptember14 = vocabularySets.filter((set) => set.activationDate !== '2026-09-14')
  const resolution = resolveLifecycle(context('2026-09-20', withoutSeptember14))

  assert.equal(resolution.acquisitionDatasetId, id('2026-09-07'))
  assert.deepEqual(resolution.testReviews.map((review) => review.datasetId), [
    id('2026-08-31'),
    id('2026-09-07'),
  ])
  assert.deepEqual(resolution.futureDatasetIds, [id('2026-09-21')])
})

test('Kindergarten lifecycle input is deterministic and excludes other scopes', () => {
  const foreign: LifecycleSet = {
    ...vocabularySets[0],
    datasetId: 'grade-2-foreign',
    grade: 'Grade 2',
  }
  const unordered = [foreign, ...vocabularySets.slice().reverse(), vocabularySets[0]]

  assert.deepEqual(
    resolveLifecycle(context('2026-09-27', unordered)),
    resolveLifecycle(context('2026-09-27')),
  )
})

test('conflicting duplicate Kindergarten dataset identities fail closed', () => {
  const reference = vocabularySets[0]
  assert.throws(
    () => resolveLifecycle(context('2026-09-01', [
      reference,
      { ...reference, instructionalEndDate: '2026-09-13' },
    ])),
    /Conflicting Kindergarten lifecycle set identity/,
  )
})

test('unapproved no-instruction units, dates, and unit membership fail closed', () => {
  const reference = vocabularySets[0]
  assert.throws(
    () => resolveLifecycle(context('2026-09-01', [{ ...reference, kind: 'no-instruction' }])),
    /no-instruction handling is not approved/,
  )
  assert.throws(
    () => resolveLifecycle(context('2026-09-01', [{
      ...reference,
      activationDate: '2026-09-01',
      instructionalEndDate: '2026-09-07',
    }])),
    /Monday-through-Sunday/,
  )
  assert.throws(
    () => resolveLifecycle(context('2026-09-01', [{
      ...reference,
      activationDate: '2026-09-28',
      instructionalEndDate: '2026-10-04',
    }])),
    /outside the approved unit plan/,
  )
})

test('an invalid or overlapping Kindergarten unit plan fails before assigning practice', () => {
  assert.throws(
    () => resolveKindergartenUnitLifecycle(context('2026-09-01'), [{
      id: 'not-a-monday',
      instructionStartDate: '2026-09-01',
      instructionEndDate: '2026-09-06',
      reviewStartDate: '2026-09-07',
      reviewEndDate: '2026-09-13',
      reviewCycle: 1,
    }]),
    /must start on Monday/,
  )
  assert.throws(
    () => resolveKindergartenUnitLifecycle(context('2026-09-01'), [
      kindergarten2026UnitPlan[0],
      {
        id: 'overlap',
        instructionStartDate: '2026-09-21',
        instructionEndDate: '2026-10-04',
        reviewStartDate: '2026-10-05',
        reviewEndDate: '2026-10-11',
        reviewCycle: 1,
      },
    ]),
    /overlap/,
  )
})
