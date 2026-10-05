import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AcquisitionStrategy,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
} from '../src/acquisition/contracts.ts'
import { revealAcquisition, startAcquisition } from '../src/acquisition/engine.ts'
import { transitionAcquisition } from '../src/acquisition/transition.ts'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { grade5AcquisitionStrategy } from '../src/acquisition/strategies/grade5.ts'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import { datasetFromCanonicalCandidate } from '../src/curriculum/datasetProjection.ts'
import { candidateFromSheet } from '../src/curriculum/adapters/googleSheets.ts'
import type { Dataset, Word } from '../src/domain/contracts.ts'
import { kindergartenSheetsProfile } from '../src/kindergartenSheetsImporter.ts'
import type { LifecycleContext, LifecycleProgressionEvent, LifecycleSet } from '../src/lifecycle/contracts.ts'
import { resolveTier2ReadingLifecycle } from '../src/tier2/lifecycle.ts'
import { grade2Tier2ReadingProfile } from '../src/tier2/profiles/grade2.ts'
import { grade5Tier2ReadingProfile } from '../src/tier2/profiles/grade5.ts'
import { kindergartenTier2ReadingProfile } from '../src/tier2/profiles/kindergarten.ts'
import { tier2ReadingProfileForScope } from '../src/tier2/registry.ts'
import { TIER2_READING_RESPONSE_RULE, type Tier2ReadingProfile } from '../src/tier2/contracts.ts'

function word(
  datasetId: string,
  id: string,
  text: string,
  tier: 'tier-1' | 'tier-2',
): Word {
  return {
    id,
    text,
    sentence: '',
    datasetId,
    language: 'mandarin',
    tier,
    activityType: tier === 'tier-1' ? 'dictation' : 'reading',
  }
}

function dataset(
  grade: string,
  id: string,
  startDate: string,
  endDate: string,
  readingTerms: readonly string[] = [`read-${id}`],
): Dataset {
  const tier1 = [word(id, `${id}-tier-1-1`, `write-${id}`, 'tier-1')]
  const tier2 = readingTerms.map((text, index) => word(id, `${id}-tier-2-${index + 1}`, text, 'tier-2'))
  return {
    id,
    dateRange: `${startDate} to ${endDate}`,
    startDate,
    endDate,
    grade,
    schoolYear: '2026–2027',
    description: id,
    words: tier1,
    vocabulary: { tier1, tier2, tier3: [] },
  }
}

function lifecycleSet(source: Dataset): LifecycleSet {
  return {
    datasetId: source.id,
    grade: source.grade,
    schoolYearKey: '2026-27',
    activationDate: source.startDate,
    instructionalEndDate: source.endDate,
    kind: 'vocabulary',
  }
}

function context(
  grade: string,
  currentDateKey: string,
  datasets: readonly Dataset[],
  progressionEvents: readonly LifecycleProgressionEvent[] = [],
): LifecycleContext {
  return {
    scope: { grade, schoolYearKey: '2026-27', currentDateKey },
    sets: datasets.map(lifecycleSet),
    progressionEvents,
  }
}

function datasetIds(pathway: { cohorts: readonly { datasetId: string }[] } | null) {
  return pathway?.cohorts.map((cohort) => cohort.datasetId) || []
}

function assertReadingAcquisitionMatches(
  profile: Tier2ReadingProfile,
  writingPattern: AcquisitionStrategy,
) {
  const readingPattern = profile.acquisitionStrategy
  assert.equal(readingPattern.version, writingPattern.version)
  assert.deepEqual(readingPattern.timers, writingPattern.timers)
  assert.equal(readingPattern.dtObservationMode, writingPattern.dtObservationMode)
  assert.deepEqual(readingPattern.introductionSequence, writingPattern.introductionSequence)
  assert.deepEqual(readingPattern.expandedSequence, writingPattern.expandedSequence)
  assert.deepEqual(readingPattern.correctionSequence, writingPattern.correctionSequence)
  assert.deepEqual(
    readingPattern.familiarDtTargets.map((target) => target.text),
    writingPattern.familiarDtTargets.map((target) => target.text),
  )
  assert.notStrictEqual(readingPattern, writingPattern)
  assert.notStrictEqual(readingPattern.familiarDtTargets, writingPattern.familiarDtTargets)
  assert.ok(readingPattern.familiarDtTargets.every((target) =>
    target.language === 'mandarin'
      && target.tier === 'tier-2'
      && target.activityType === 'reading'
      && !writingPattern.familiarDtTargets.some((writingTarget) => writingTarget.id === target.id),
  ))
}

test('Grade 2 and Grade 5 Tier 2 reading mirror their grade-owned Acquisition patterns without sharing Tier 1 target identity', () => {
  const patterns = [
    [grade2Tier2ReadingProfile, grade2AcquisitionStrategy],
    [grade5Tier2ReadingProfile, grade5AcquisitionStrategy],
  ] as const
  for (const [profile, writingPattern] of patterns) {
    assertReadingAcquisitionMatches(profile, writingPattern)
    assert.strictEqual(profile.responseRule, TIER2_READING_RESPONSE_RULE)
  }
  assert.deepEqual(TIER2_READING_RESPONSE_RULE, {
    targetPresentation: 'visible',
    response: 'read-aloud',
    assessment: 'self-assessment',
    recording: 'prompted-ephemeral',
    comparisonOrder: 'child-then-model',
  })
})

test('Kindergarten Tier 2 reading owns the approved five-target 1-2-3-3 Expanded sequence', () => {
  const reading = kindergartenTier2ReadingProfile.acquisitionStrategy
  assert.equal(kindergartenTier2ReadingProfile.id, 'kindergarten-tier-2-reading-v2')
  assert.equal(kindergartenTier2ReadingProfile.version, 2)
  assert.equal(reading.id, 'kindergarten-tier-2-reading-acquisition-v3')
  assert.equal(reading.version, 3)
  assert.deepEqual(reading.introductionSequence, kindergartenAcquisitionStrategy.introductionSequence)
  assert.deepEqual(reading.correctionSequence, kindergartenAcquisitionStrategy.correctionSequence)
  assert.deepEqual(reading.expandedSequence, [
    'target',
    'dt',
    'target',
    'dt', 'dt',
    'target',
    'dt', 'dt', 'dt',
    'target',
    'dt', 'dt', 'dt',
    'target',
  ])
  assert.deepEqual(reading.correctionPolicy, {
    assessmentMode: 'feedback-only',
    finalExpandedFailure: 'retry-target-after-correction',
  })
  assert.deepEqual(
    reading.familiarDtTargets.map((target) => target.text),
    kindergartenAcquisitionStrategy.familiarDtTargets.map((target) => target.text),
  )
  assert.ok(reading.familiarDtTargets.every((target) =>
    target.tier === 'tier-2' && target.activityType === 'reading'))
})

function kindergartenReadingTargetSet(): AcquisitionTargetSet<(typeof kindergartenTier2ReadingProfile.acquisitionStrategy.familiarDtTargets)[number]> {
  return {
    id: 'kindergarten-reading-sequence',
    targets: [{
      id: 'kindergarten-reading-target-1',
      text: '妈妈',
      sentence: '',
      datasetId: 'kindergarten-reading-sequence',
      language: 'mandarin',
      tier: 'tier-2',
      activityType: 'reading',
    }],
  }
}

function answerKindergartenReading(
  flow: EngineAcquisitionFlow<(typeof kindergartenTier2ReadingProfile.acquisitionStrategy.familiarDtTargets)[number]>,
  targetSet: ReturnType<typeof kindergartenReadingTargetSet>,
  correct = true,
) {
  return transitionAcquisition(
    revealAcquisition(flow),
    targetSet,
    kindergartenTier2ReadingProfile.acquisitionStrategy,
    { correct, revealMethod: 'recording-comparison' as const },
    () => 0,
  )
}

test('Kindergarten reading completes Introduction once and times five Expanded targets from 10 to 6 seconds', () => {
  const strategy = kindergartenTier2ReadingProfile.acquisitionStrategy
  const targetSet = kindergartenReadingTargetSet()
  let flow = startAcquisition(targetSet, strategy, () => 0)
  const introduction: Array<[string, boolean]> = []
  while (flow.phase === 'introduction') {
    introduction.push([flow.prompt!.kind, flow.prompt!.countsTowardWeeklyScore])
    flow = answerKindergartenReading(flow, targetSet).nextFlow
  }
  assert.deepEqual(introduction, [
    ['familiar-dt', false],
    ['familiar-dt', false],
    ['show-copy', false],
    ['target', true],
  ])

  const expanded: Array<[string, number, boolean]> = []
  while (!flow.complete) {
    expanded.push([flow.prompt!.kind, flow.prompt!.timerSeconds, flow.prompt!.countsTowardWeeklyScore])
    flow = answerKindergartenReading(flow, targetSet).nextFlow
  }
  assert.deepEqual(expanded.map(([kind]) => kind), strategy.expandedSequence.map((kind) => kind === 'dt' ? 'familiar-dt' : kind))
  assert.deepEqual(expanded.filter(([kind]) => kind === 'target').map(([, seconds]) => seconds), [10, 9, 8, 7, 6])
  assert.ok(expanded.filter(([kind]) => kind === 'target').every(([, , scored]) => scored))
  assert.deepEqual(flow.earnedDtPool.map((target) => target.id), ['kindergarten-reading-target-1'])
})

test('Kindergarten reading Correction is unscored and cannot promote a failed final Expanded target', () => {
  const strategy = kindergartenTier2ReadingProfile.acquisitionStrategy
  const targetSet = kindergartenReadingTargetSet()
  let flow = startAcquisition(targetSet, strategy, () => 0)
  while (flow.phase === 'introduction') flow = answerKindergartenReading(flow, targetSet).nextFlow
  while (flow.phase === 'expanded-trials' && flow.step < strategy.expandedSequence.length - 1) {
    flow = answerKindergartenReading(flow, targetSet).nextFlow
  }

  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.timerSeconds, 6)
  const failedFinal = answerKindergartenReading(flow, targetSet, false)
  assert.equal(failedFinal.assessment?.countsTowardWeeklyScore, true)
  flow = failedFinal.nextFlow
  assert.equal(flow.phase, 'correction')
  assert.deepEqual(flow.earnedDtPool, [])

  const correctionAssessments: Array<[string, boolean]> = []
  while (flow.phase === 'correction') {
    const transition = answerKindergartenReading(flow, targetSet)
    if (transition.assessment) {
      correctionAssessments.push([
        transition.assessment.kind,
        transition.assessment.countsTowardWeeklyScore,
      ])
    }
    flow = transition.nextFlow
  }
  assert.deepEqual(correctionAssessments, [
    ['target', false],
    ['familiar-dt', false],
    ['target', false],
  ])
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, strategy.expandedSequence.length - 1)
  assert.equal(flow.prompt?.kind, 'target')
  assert.equal(flow.prompt?.timerSeconds, 6)
  assert.deepEqual(flow.earnedDtPool, [])

  flow = answerKindergartenReading(flow, targetSet).nextFlow
  assert.equal(flow.complete, true)
  assert.deepEqual(flow.earnedDtPool.map((target) => target.id), ['kindergarten-reading-target-1'])
})

test('an incorrect Kindergarten reading Introduction target uses feedback-only Correction before Expanded Trials', () => {
  const strategy = kindergartenTier2ReadingProfile.acquisitionStrategy
  const targetSet = kindergartenReadingTargetSet()
  let flow = startAcquisition(targetSet, strategy, () => 0)
  while (flow.prompt?.kind !== 'target') flow = answerKindergartenReading(flow, targetSet).nextFlow
  const failedIntroduction = answerKindergartenReading(flow, targetSet, false)
  assert.equal(failedIntroduction.assessment?.countsTowardWeeklyScore, true)
  flow = failedIntroduction.nextFlow

  const correctionScores: boolean[] = []
  while (flow.phase === 'correction') {
    const transition = answerKindergartenReading(flow, targetSet)
    if (transition.assessment) correctionScores.push(transition.assessment.countsTowardWeeklyScore)
    flow = transition.nextFlow
  }
  assert.deepEqual(correctionScores, [false, false, false])
  assert.equal(flow.phase, 'expanded-trials')
  assert.equal(flow.step, 0)
})

test('Grade 2 Tier 2 reading follows Acquisition, one Test Review, and Mastery assignments', () => {
  const datasets = [
    dataset('Grade 2', 'g2-w1', '2026-08-31', '2026-09-04'),
    dataset('Grade 2', 'g2-w2', '2026-09-07', '2026-09-11'),
    dataset('Grade 2', 'g2-w3', '2026-09-14', '2026-09-18'),
    dataset('Grade 2', 'g2-w4', '2026-09-21', '2026-09-25'),
  ]
  const reading = resolveTier2ReadingLifecycle(
    grade2Tier2ReadingProfile,
    context('Grade 2', '2026-09-21', datasets),
    datasets,
  )

  assert.deepEqual(datasetIds(reading.acquisition), ['g2-w4'])
  assert.deepEqual(reading.testReviews.map((review) => ({ cycle: review.cycle, ids: datasetIds(review) })), [
    { cycle: 1, ids: ['g2-w3'] },
  ])
  assert.deepEqual(datasetIds(reading.mastery), ['g2-w1', 'g2-w2'])
  assert.ok(reading.acquisition?.cohorts[0].targets.every((target) => target.tier === 'tier-2'))
  assert.notStrictEqual(reading.acquisition?.cohorts[0].targets[0], datasets[3].words[0])
})

test('Kindergarten Tier 2 reading preserves its cumulative unit review instead of adopting Grade 2 replacement review', () => {
  const datasets = [
    dataset('Kindergarten', 'k-w1', '2026-08-31', '2026-09-06'),
    dataset('Kindergarten', 'k-w2', '2026-09-07', '2026-09-13'),
    dataset('Kindergarten', 'k-w3', '2026-09-14', '2026-09-20'),
    dataset('Kindergarten', 'k-w4', '2026-09-21', '2026-09-27'),
  ]
  const reading = resolveTier2ReadingLifecycle(
    kindergartenTier2ReadingProfile,
    context('Kindergarten', '2026-09-27', datasets),
    datasets,
  )

  assert.deepEqual(datasetIds(reading.acquisition), ['k-w4'])
  assert.equal(reading.testReviews.length, 1)
  assert.equal(reading.testReviews[0].cycle, 1)
  assert.equal(reading.testReviews[0].reviewGroupId, 'kindergarten-2026-27-unit-1')
  assert.deepEqual(datasetIds(reading.testReviews[0]), ['k-w1', 'k-w2', 'k-w3', 'k-w4'])
  assert.deepEqual(datasetIds(reading.mastery), [])
})

test('Kindergarten High-frequency reading words enter the canonical Tier 2 engine', () => {
  const candidate = candidateFromSheet({
    sheetId: 45,
    title: 'Week 6 09/21',
    values: [['Mandarin\n- Writing character 九、十、白\n- High-frequency reading words 红色、蓝色']],
  }, kindergartenSheetsProfile)
  const source = datasetFromCanonicalCandidate(candidate)
  const reading = resolveTier2ReadingLifecycle(
    kindergartenTier2ReadingProfile,
    context('Kindergarten', '2026-09-27', [source]),
    [source],
  )

  assert.deepEqual(reading.acquisition?.cohorts[0].targets.map((target) => target.text), ['红色', '蓝色'])
  assert.ok(reading.acquisition?.cohorts[0].targets.every((target) =>
    target.tier === 'tier-2' && target.activityType === 'reading',
  ))
})

test('Grade 5 Tier 2 reading preserves Test Review 1 and Test Review 2 before Mastery', () => {
  const datasets = [
    dataset('Grade 5', 'g5-w1', '2026-08-31', '2026-09-04'),
    dataset('Grade 5', 'g5-w2', '2026-09-07', '2026-09-11'),
    dataset('Grade 5', 'g5-w3', '2026-09-14', '2026-09-18'),
    dataset('Grade 5', 'g5-w4', '2026-09-21', '2026-09-25'),
  ]
  const progressionEvents: LifecycleProgressionEvent[] = datasets.map((source, index) => ({
    eventId: `g5-event-${index + 1}`,
    grade: 'Grade 5',
    schoolYearKey: '2026-27',
    effectiveDate: source.startDate,
    introducedDatasetId: source.id,
    ...(index > 0 ? { confirmedDatasetId: datasets[index - 1].id } : {}),
  }))
  const reading = resolveTier2ReadingLifecycle(
    grade5Tier2ReadingProfile,
    context('Grade 5', '2026-09-21', datasets, progressionEvents),
    datasets,
  )

  assert.deepEqual(datasetIds(reading.acquisition), ['g5-w4'])
  assert.deepEqual(reading.testReviews.map((review) => ({ cycle: review.cycle, ids: datasetIds(review) })), [
    { cycle: 1, ids: ['g5-w3'] },
    { cycle: 2, ids: ['g5-w2'] },
  ])
  assert.deepEqual(datasetIds(reading.mastery), ['g5-w1'])
})

test('an empty Tier 2 cohort remains visible but unavailable and never falls back to Tier 1 writing words', () => {
  const emptyReading = dataset('Grade 2', 'g2-current', '2026-09-21', '2026-09-25', [])
  const reading = resolveTier2ReadingLifecycle(
    grade2Tier2ReadingProfile,
    context('Grade 2', '2026-09-21', [emptyReading]),
    [emptyReading],
  )

  assert.equal(reading.acquisition?.available, false)
  assert.deepEqual(reading.acquisition?.cohorts[0].targets, [])
  assert.match(reading.acquisition?.unavailableReason || '', /No canonical Tier 2 reading targets/)
  assert.equal(emptyReading.words.length, 1)
})

test('Tier 2 reading profiles require exact supported scope and never inherit another grade', () => {
  assert.strictEqual(tier2ReadingProfileForScope('Kindergarten', '2026-27'), kindergartenTier2ReadingProfile)
  assert.strictEqual(tier2ReadingProfileForScope('Grade 2', '2026-27'), grade2Tier2ReadingProfile)
  assert.strictEqual(tier2ReadingProfileForScope('Grade 5', '2026-27'), grade5Tier2ReadingProfile)
  assert.equal(tier2ReadingProfileForScope('Grade 3', '2026-27'), null)
  assert.equal(tier2ReadingProfileForScope('Grade 2', '2027-28'), null)
  assert.throws(
    () => resolveTier2ReadingLifecycle(
      grade2Tier2ReadingProfile,
      context('Grade 5', '2026-09-21', []),
      [],
    ),
    /exact grade and school-year profile scope/,
  )
})
