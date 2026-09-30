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
  assert.throws(() => completeTestReview('writing', targets, review), /every original target is assessed/)
})

test('completion preserves target order, mode, and the final draft assessments', () => {
  const targets = [{ id: 'one', text: '一' }, { id: 'two', text: '二' }]
  let review = createTestReviewState(targets)
  review = assessTestReviewTarget(review, 'one', 'incorrect')
  review = assessTestReviewTarget(review, 'one', 'correct')
  review = assessTestReviewTarget(review, 'two', 'incorrect')

  assert.deepEqual(completeTestReview('reading', targets, review), {
    mode: 'reading',
    assessments: [
      { target: targets[0], correct: true },
      { target: targets[1], correct: false },
    ],
    attempted: 2,
    correct: 1,
    total: 2,
  })
  assert.throws(
    () => completeTestReview('reading', [...targets].reverse(), review),
    /every original target is assessed/,
  )
})

test('an assessment for an unknown target is a no-op', () => {
  const state = createTestReviewState([{ id: 'one', text: '一' }])
  assert.equal(assessTestReviewTarget(state, 'missing', 'correct'), state)
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
  assert.doesNotMatch(combinedSource, /from\s+['"][^'"]*(?:App|domain|firestore|firebase|lifecycle|grade2|grade5|kindergarten|testReviewPrototype)[^'"]*['"]/i)
  assert.doesNotMatch(combinedSource, /localStorage|sessionStorage/)
})

test('Phase 2 activates the shared runner only in the isolated prototype', () => {
  const consumers = allApplicationTypeScriptFiles(join(repositoryRoot, 'src'))
    .filter((file) => /(?:^|\/)DeferredTestReview(?:\.tsx)?['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(repositoryRoot, file).split(sep).join('/'))
  assert.deepEqual(consumers, ['src/testReviewPrototype/TestReviewPrototype.tsx'])

  const harness = source('src/testReviewPrototype/TestReviewPrototype.tsx')
  assert.match(harness, /from '..\/testReview\/DeferredTestReview\.tsx'/)
  assert.doesNotMatch(harness, /startEphemeralAudioRecording|SelfAssessmentActions/)
})
