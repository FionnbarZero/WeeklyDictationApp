import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SheetsWorkbookPayload, SlidesPresentationPayload } from '../src/curriculum/model.ts'
import {
  grade5LabReadingPathway,
  grade5LabReadingRequestIsConnected,
} from '../src/grade5Lab/readingPractice.ts'
import { buildGrade5LearningHub } from '../src/grade5Lab/learningHub.ts'
import {
  kindergartenReadingAcquisitionPathway,
  kindergartenReadingMasteryPathway,
  kindergartenReadingReviewPathway,
} from '../src/kindergartenLab/readingPractice.ts'
import { kindergartenUnitReviewForLab } from '../src/kindergartenLab/unitReview.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import { tier2ReadingPathwayTargets } from '../src/tier2/pathway.ts'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Grade 5 connects complete source-derived reading cohorts to every ordinary lifecycle pathway', () => {
  const payload = JSON.parse(source('tests/fixtures/grade5-presentation.json')) as SlidesPresentationPayload
  const extraction = extractGrade5Presentation(payload)
  const hub = buildGrade5LearningHub(extraction)
  const request = (sectionId: string, activityId: string) => {
    const section = hub.sections.find((item) => item.id === sectionId)
    const activity = section?.activities.find((item) => item.id === activityId)
    assert.ok(activity)
    assert.equal(activity.launchRequests.length, 1)
    return activity.launchRequests[0]
  }

  const pathways = [
    grade5LabReadingPathway(extraction, request('homework', 'acquisition-reading')),
    grade5LabReadingPathway(extraction, request('test-review-1', 'test-review-1-reading')),
    grade5LabReadingPathway(extraction, request('test-review-2', 'test-review-2-reading')),
    grade5LabReadingPathway(extraction, request('review', 'mastery-reading-warmup')),
  ]

  assert.deepEqual(pathways.map((pathway) => pathway.kind), [
    'acquisition',
    'test-review',
    'test-review',
    'mastery',
  ])
  assert.deepEqual(pathways.map((pathway) => tier2ReadingPathwayTargets(pathway).length), [9, 8, 8, 5])
  assert.ok(pathways.every((pathway) => pathway.available))

  const reteach = hub.sections.find((item) => item.id === 'review')!
    .activities.find((item) => item.id === 'mastery-reteach')!
    .launchRequests.find((item) => item.learningChannel === 'tier-2-reading')!
  assert.equal(grade5LabReadingRequestIsConnected(reteach), false)
})

test('Kindergarten connects separate reading Acquisition, cumulative review, and mastery paths', () => {
  const workbook = JSON.parse(source('tests/fixtures/kindergarten-workbook.json')) as SheetsWorkbookPayload
  const candidates = inspectKindergartenWorkbook(workbook)
  const current = candidates.find((candidate) => candidate.rawDate === 'Week 6 09/21')
  assert.ok(current)
  const review = kindergartenUnitReviewForLab(candidates)
  const acquisition = kindergartenReadingAcquisitionPathway(current)
  const testReview = kindergartenReadingReviewPathway(review)
  const mastery = kindergartenReadingMasteryPathway(review)

  assert.deepEqual(tier2ReadingPathwayTargets(acquisition).map((target) => target.text), ['红色', '蓝色'])
  assert.equal(tier2ReadingPathwayTargets(testReview).length, 9)
  assert.equal(tier2ReadingPathwayTargets(mastery).length, 9)
  assert.equal(review.dataset.words.length, 14)
  assert.equal(review.dataset.vocabulary?.tier2.length, 9)
  assert.ok(review.dataset.words.every((word) => word.tier === 'tier-1'))
  assert.ok(review.dataset.vocabulary?.tier2.every((word) => word.tier === 'tier-2'))
})

test('the reusable reading runner owns engine transitions and no persistence dependency', () => {
  const runner = source('src/readingPractice/Tier2ReadingPractice.tsx')
  const app = source('src/App.tsx')
  const grade5 = source('src/grade5LearningHubHarness.tsx')
  const kindergarten = source('src/kindergartenLearningLabHarness.tsx')

  assert.match(runner, /startAcquisition/)
  assert.match(runner, /transitionAcquisition/)
  assert.match(runner, /ReadingResponsePanel/)
  assert.doesNotMatch(runner, /firebase|firestore|localStorage|saveCloud|fetch\(/i)
  for (const integration of [app, grade5, kindergarten]) {
    assert.match(integration, /Tier2ReadingPractice/)
  }
})
