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

const acquisition = dataset('grade2-acquisition', '9/21–9/27', ['学', '校'], ['老师', '同学'])
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
  assert.ok(ninjaSkills.activities.every((activity) => activity.action.kind === 'disabled'))
  assert.equal(finalBoss.activities[0].action.kind, 'launch')
  assert.equal(finalBoss.activities[1].action.kind, 'launch')
  assert.equal(spiritRealm.activities[0].action.kind, 'launch')
  assert.equal(spiritRealm.activities[1].action.kind, 'launch')
  if (dojo.activities[0].action.kind === 'launch') assert.equal(dojo.activities[0].action.launch.kind, 'writing')
  if (finalBoss.activities[0].action.kind === 'launch') {
    assert.equal(finalBoss.activities[0].action.launch.kind, 'writing')
    if (finalBoss.activities[0].action.launch.kind === 'writing') assert.equal(finalBoss.activities[0].action.launch.target.phase, 'test-review')
  }
  if (spiritRealm.activities[0].action.kind === 'launch') assert.equal(spiritRealm.activities[0].action.launch.kind, 'warmup')
})

test('the Grade 2 production home uses the shared Learning Hub without replacing its practice engines', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.match(app, /grade2LearningHubView/)
  assert.match(app, /<LearningHub model=\{model\} onLaunch=\{launch\} showTopbar=\{false\}/)
  assert.match(app, /if \(request\.kind === 'writing'\) onStart\(request\.target\)/)
  assert.match(app, /else if \(request\.kind === 'reading'\) onStartReading\(request\.pathway\)/)
  assert.match(app, /else onStartWarmup\(\)/)
  assert.match(main, /learningHub\/learningHub\.css/)
})
