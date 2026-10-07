import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assessTestReviewTarget,
  completeTestReview,
  createTestReviewState,
} from '../src/testReview/state.ts'
import { releaseRetainedReadingCaptures } from '../src/testReview/retainedReadingClips.ts'
import { writingSessionAnswers } from '../src/application/testReview.ts'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const boundaryDirectory = join(repositoryRoot, 'src/testReview')

function source(relativePath: string) {
  return readFileSync(join(repositoryRoot, relativePath), 'utf8')
}

function isTypeScriptFamilyFile(fileName: string) {
  return /\.(?:ts|tsx|mts|cts)$/.test(fileName)
}

function typeScriptFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return typeScriptFiles(entryPath, root)
    if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
    return [relative(root, entryPath).split(sep).join('/')]
  }).sort()
}

function allApplicationTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return allApplicationTypeScriptFiles(entryPath)
    return entry.isFile() && isTypeScriptFamilyFile(entry.name) ? [entryPath] : []
  })
}

test('the shared review state rejects duplicate target occurrence IDs', () => {
  assert.throws(() => createTestReviewState([
    { id: 'same', text: '一' },
    { id: 'same', text: '二' },
  ]), /duplicate target occurrence IDs/)
})

test('an incomplete review cannot be completed', () => {
  const targets = [{ id: 'one', text: '一' }, { id: 'two', text: '二' }]
  const review = assessTestReviewTarget(createTestReviewState(targets), 'one', 'correct')
  assert.throws(() => completeTestReview('writing', targets, review, {
    one: 'timer',
    two: 'skip_timer',
  }), /every original target is collected and assessed/)
})

test('a completed review requires collection evidence for every original target', () => {
  const targets = [{ id: 'one', text: '一' }]
  const review = assessTestReviewTarget(createTestReviewState(targets), 'one', 'correct')
  assert.throws(() => completeTestReview('writing', targets, review, {}), /every original target is collected and assessed/)
  assert.throws(() => completeTestReview('writing', targets, review, {
    one: 'recording-comparison',
  }), /requested mode/)
})

test('completion preserves target order, mode, and the final draft assessments', () => {
  const targets = [{ id: 'one', text: '一' }, { id: 'two', text: '二' }]
  let review = createTestReviewState(targets)
  review = assessTestReviewTarget(review, 'one', 'incorrect')
  review = assessTestReviewTarget(review, 'one', 'correct')
  review = assessTestReviewTarget(review, 'two', 'incorrect')

  assert.deepEqual(completeTestReview('reading', targets, review, {
    one: 'recording-comparison',
    two: 'recording-unavailable',
  }), {
    mode: 'reading',
    assessments: [
      { target: targets[0], correct: true, collectionMethod: 'recording-comparison' },
      { target: targets[1], correct: false, collectionMethod: 'recording-unavailable' },
    ],
    attempted: 2,
    correct: 1,
    total: 2,
  })
  assert.throws(
    () => completeTestReview('reading', [...targets].reverse(), review, {
      one: 'recording-comparison',
      two: 'recording-unavailable',
    }),
    /every original target is collected and assessed/,
  )
})

test('an assessment for an unknown target is a no-op', () => {
  const state = createTestReviewState([{ id: 'one', text: '一' }])
  assert.equal(assessTestReviewTarget(state, 'missing', 'correct'), state)
})

test('the writing adapter preserves final order, correctness, and Skip Timer evidence', () => {
  const words = [
    { id: 'one', text: '一', sentence: '', datasetId: 'week' },
    { id: 'two', text: '二', sentence: '', datasetId: 'week' },
  ]
  const answers = writingSessionAnswers({
    mode: 'writing',
    assessments: [
      { target: words[0], correct: true, collectionMethod: 'timer' },
      { target: words[1], correct: false, collectionMethod: 'skip_timer' },
    ],
    attempted: 2,
    correct: 1,
    total: 2,
  })
  assert.deepEqual(answers, [
    { word: words[0], correct: true, revealMethod: 'timer' },
    { word: words[1], correct: false, revealMethod: 'skip_timer' },
  ])
  assert.throws(() => writingSessionAnswers({
    mode: 'reading',
    assessments: [{ target: words[0], correct: true, collectionMethod: 'recording-comparison' }],
    attempted: 1,
    correct: 1,
    total: 1,
  }), /cannot become Tier 1 writing answers/)
})

test('retained reading clips are explicitly released', () => {
  let releases = 0
  releaseRetainedReadingCaptures([
    { targetId: 'one', clip: { url: 'blob:one', dispose: () => { releases += 1 } } },
    { targetId: 'two', clip: null },
    { targetId: 'three', clip: { url: 'blob:three', dispose: () => { releases += 1 } } },
  ])
  assert.equal(releases, 2)
})

test('the shared Test Review boundary has the exact approved Phase 2 file inventory', () => {
  assert.deepEqual(typeScriptFiles(boundaryDirectory), [
    'DeferredTestReview.tsx',
    'FinalReviewPage.tsx',
    'ReadingResponseCollector.tsx',
    'WritingResponseCollector.tsx',
    'contracts.ts',
    'retainedReadingClips.ts',
    'state.ts',
  ])

  const combinedSource = typeScriptFiles(boundaryDirectory)
    .map((file) => source(`src/testReview/${file}`))
    .join('\n')
  // The shared interruption clock is not the curriculum progression engine.
  const withoutActivityClock = combinedSource.replace(/from ['"]\.\.\/activity\/activityLifecycle\.ts['"]/g, '')
  assert.doesNotMatch(withoutActivityClock, /from\s+['"][^'"]*(?:App|domain|firestore|firebase|lifecycle|grade2|grade5|kindergarten|testReviewPrototype)[^'"]*['"]/i)
  assert.doesNotMatch(combinedSource, /localStorage|sessionStorage/)
})

test('shared deferred review is activated through writing practice and the Kindergarten reading Final Boss', () => {
  const consumers = allApplicationTypeScriptFiles(join(repositoryRoot, 'src'))
    .filter((file) => /(?:^|\/)DeferredTestReview(?:\.tsx)?['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(repositoryRoot, file).split(sep).join('/'))
  assert.deepEqual(consumers, [
    'src/grade5LearningHubHarness.tsx',
    'src/kindergartenLearningLabHarness.tsx',
    'src/practice/PracticeView.tsx',
    'src/readingPractice/Tier2ReadingPractice.tsx',
    'src/testReviewPrototype/TestReviewPrototype.tsx',
  ])

  const harness = source('src/testReviewPrototype/TestReviewPrototype.tsx')
  const practiceView = source('src/practice/PracticeView.tsx')
  const app = source('src/App.tsx')
  const grade5 = source('src/grade5LearningHubHarness.tsx')
  const kindergarten = source('src/kindergartenLearningLabHarness.tsx')
  assert.match(harness, /from '..\/testReview\/DeferredTestReview\.tsx'/)
  assert.doesNotMatch(harness, /startEphemeralAudioRecording|SelfAssessmentActions/)
  assert.match(practiceView, /mode="writing"/)
  assert.match(practiceView, /writingTimerSeconds=\{timerSeconds\}/)
  assert.match(practiceView, /deferred-writing-test-review/)
  assert.match(source('src/testReview/WritingResponseCollector.tsx'), /<SkyWritingAcquisition/)
  assert.doesNotMatch(source('src/testReview/WritingResponseCollector.tsx'), /write the response on paper/i)
  assert.match(app, /completeDeferredWritingTestReview/)
  assert.match(grade5, /deferred-writing-test-review/)
  assert.match(grade5, /mode="reading"/)
  assert.match(grade5, /Reading Test Review/)
  assert.match(kindergarten, /deferred-writing-test-review/)
  assert.match(kindergarten, /mode="reading"/)
  assert.match(kindergarten, /Final Boss Reading Test/)
  const readingRunner = source('src/readingPractice/Tier2ReadingPractice.tsx')
  assert.match(readingRunner, /pathway\.kind === 'test-review'/)
  assert.match(readingRunner, /<DeferredTestReview/)
  assert.match(readingRunner, /mode="reading"/)
})
