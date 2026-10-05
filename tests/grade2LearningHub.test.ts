import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Dataset, PracticeTarget, Word } from '../src/domain.ts'
import { grade2LearningHubView } from '../src/grade2/learningHub.ts'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway, Tier2ReadingTarget } from '../src/tier2/contracts.ts'

function word(datasetId: string, id: string, text: string, tier: 'tier-1' | 'tier-2'): Word {
  return {
    id,
    text,
    sentence: '',
    datasetId,
    grade: 'Grade 2',
    language: 'mandarin',
    tier,
    activityType: tier === 'tier-1' ? 'dictation' : 'reading',
  }
}

function dataset(id: string, dateRange: string, writing: string[], reading: string[]): Dataset {
  const tier1 = writing.map((text, index) => word(id, `${id}-writing-${index + 1}`, text, 'tier-1'))
  const tier2 = reading.map((text, index) => word(id, `${id}-reading-${index + 1}`, text, 'tier-2'))
  return {
    id,
    dateRange,
    startDate: '2026-09-21',
    endDate: '2026-09-27',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    description: dateRange,
    words: tier1,
    vocabulary: { tier1, tier2, tier3: [] },
  }
}

function pathway(kind: Tier2ReadingPathway['kind'], source: Dataset, cycle?: number): Tier2ReadingPathway {
  return {
    kind,
    ...(cycle ? { cycle } : {}),
    available: true,
    cohorts: [{ datasetId: source.id, targets: source.vocabulary!.tier2 as Tier2ReadingTarget[], available: true }],
  }
}

const acquisition = dataset('grade2-acquisition', '9/21–9/27', ['大', '小'], ['老师', '同学'])
const review = dataset('grade2-review', '9/14–9/20', ['天', '地'], ['白天', '土地'])
const mastery = dataset('grade2-mastery', '9/7–9/13', ['人', '口'], ['大人', '门口'])
const acquisitionTarget: PracticeTarget = { dataset: acquisition, phase: 'acquisition' }
const testReviewTarget: PracticeTarget = { dataset: review, phase: 'test-review' }
const readingLifecycle: Tier2ReadingLifecycle = {
  grade: 'Grade 2',
  schoolYearKey: '2026-27',
  activityModule: 'mandarin-tier2-reading',
  acquisition: pathway('acquisition', acquisition),
  testReviews: [pathway('test-review', review, 1)],
  mastery: pathway('mastery', mastery),
  futureDatasetIds: [],
  noInstructionDatasetIds: [],
}

const hub = grade2LearningHubView({
  childName: 'Maya',
  datasets: [acquisition, review, mastery],
  masteredDatasets: [mastery],
  acquisitionTarget,
  testReviewTarget,
  readingLifecycle,
  warmupWordCount: 16,
})

test('Grade 2 uses the same four child-facing path names as Kindergarten and Grade 5', () => {
  assert.deepEqual(hub.sections.map((section) => section.title), [
    'Enter the Dojo',
    'Practice your Ninja Skills',
    'The Final Boss Test',
    'Enter the Spirit Realm',
  ])
})

test('the shared names preserve the Grade 2 lifecycle mapping', () => {
  const [dojo, ninjaSkills, finalBoss, spiritRealm] = hub.sections
  assert.equal(dojo.activities[0].action.kind, 'launch')
  assert.equal(dojo.activities[1].action.kind, 'launch')
  assert.equal(dojo.activities[2].action.kind, 'launch')
  assert.ok(ninjaSkills.activities.every((activity) => activity.action.kind === 'disabled'))
  assert.equal(finalBoss.activities[0].action.kind, 'launch')
  assert.equal(finalBoss.activities[1].action.kind, 'launch')
  assert.equal(spiritRealm.activities[0].action.kind, 'launch')
  assert.equal(spiritRealm.activities[1].action.kind, 'launch')
  if (dojo.activities[0].action.kind === 'launch') assert.equal(dojo.activities[0].action.launch.kind, 'writing')
  if (dojo.activities[1].action.kind === 'launch') assert.equal(dojo.activities[1].action.launch.kind, 'stroke-order')
  if (finalBoss.activities[0].action.kind === 'launch') {
    assert.equal(finalBoss.activities[0].action.launch.kind, 'writing')
    if (finalBoss.activities[0].action.launch.kind === 'writing') assert.equal(finalBoss.activities[0].action.launch.target.phase, 'test-review')
  }
  if (spiritRealm.activities[0].action.kind === 'launch') assert.equal(spiritRealm.activities[0].action.launch.kind, 'warmup')
})

test('the Dojo exposes every historical cohort with per-activity launch states', () => {
  const older = {
    ...dataset('grade2-older', '9/1–9/7', ['上', '下'], ['早上', '下午']),
    startDate: '2026-09-01',
    endDate: '2026-09-07',
  }
  const model = grade2LearningHubView({
    childName: 'Maya',
    datasets: [acquisition, review, mastery, older],
    masteredDatasets: [mastery],
    acquisitionTarget,
    testReviewTarget,
    readingLifecycle,
    warmupWordCount: 16,
    reentryCohorts: [
      {
        dataset: older,
        experiences: [
          { experienceId: 'writing', status: 'in-progress', progressionId: 'writing-progress' },
          { experienceId: 'stroke-order', status: 'not-started' },
          { experienceId: 'reading', status: 'completed', progressionId: 'reading-progress' },
        ],
        updatedAt: '2026-09-04T12:00:00.000Z',
      },
    ],
  })
  const reentry = model.sections[0].reentry
  assert.ok(reentry)
  assert.equal(reentry.label, 'Reenter')
  assert.deepEqual(
    reentry.cohorts.map((cohort) => cohort.label),
    ['9/1–9/7'],
  )
  assert.equal(reentry.cohorts[0].statusLabel, '1 unfinished · 1 completed · 1 available to start')
  assert.deepEqual(
    reentry.cohorts[0].actions.map((action) => action.label),
    ['Continue Writing', 'Start Stroke Order', 'Practice again Reading'],
  )
  assert.ok(reentry.cohorts[0].actions.every((action) => action.kind === 'launch'))
  assert.deepEqual(
    reentry.cohorts[0].actions.map((action) => (action.kind === 'launch' ? action.launch.kind : 'disabled')),
    ['writing', 'stroke-order', 'reading'],
  )
  const readingAction = reentry.cohorts[0].actions[2]
  assert.equal(readingAction.kind, 'launch')
  if (readingAction.kind !== 'launch') return
  const reading = readingAction.launch
  assert.equal(reading.kind, 'reading')
  if (reading.kind === 'reading')
    assert.deepEqual(
      reading.pathway.cohorts.map((cohort) => cohort.datasetId),
      [older.id],
    )
})

test('the Grade 2 production home uses the shared Learning Hub without replacing its practice engines', () => {
  const app = [
    readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/home/HomeViews.tsx', import.meta.url), 'utf8'),
  ].join('\n')
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.match(app, /grade2LearningHubView/)
  assert.match(app, /<LearningHub model=\{model\} onLaunch=\{launch\} showTopbar=\{false\}/)
  assert.match(app, /if \(request\.kind === 'writing'\) onStart\(request\.target, request\.selection\)/)
  assert.match(
    app,
    /else if \(request\.kind === 'stroke-order'\) onStartStrokeOrder\(request\.target, request\.selection\)/,
  )
  assert.match(app, /else if \(request\.kind === 'reading'\) onStartReading\(request\.pathway, request\.selection\)/)
  assert.match(app, /else onStartWarmup\(\)/)
  assert.match(main, /learningHub\/learningHub\.css/)
})
