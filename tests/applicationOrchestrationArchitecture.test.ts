import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function source(path: string) {
  return readFileSync(join(repositoryRoot, path), 'utf8')
}

function filesUnder(path: string): string[] {
  const absolute = join(repositoryRoot, path)
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry)
    return statSync(child).isDirectory()
      ? filesUnder(relative(repositoryRoot, child))
      : [relative(repositoryRoot, child)]
  })
}

test('workspace application operations stay independent from React and Firestore infrastructure', () => {
  const files = filesUnder('src/application/workspace').filter((path) => /\.tsx?$/.test(path))
  assert.ok(files.length >= 7)
  for (const path of files) {
    const contents = source(path)
    assert.doesNotMatch(
      contents,
      /from ['"][^'"]*(?:react|firestoreClient|firebaseClient|infrastructure)[^'"]*['"]/i,
      path,
    )
    assert.doesNotMatch(contents, /\b(?:window|localStorage)\b/, path)
  }
})

test('App delegates family and child workspace synchronization without raw collection loading', () => {
  const app = source('src/App.tsx')
  assert.match(app, /readFamilyWorkspace/)
  assert.match(app, /synchronizeChildWorkspace/)
  assert.match(app, /AbortController/)
  assert.doesNotMatch(
    app,
    /\b(?:ensureParentFamily|listChildren|listDatasets|listDatasetWords|listSessions|listAttempts|listScores|getCloudAdaptiveState|listAcquisitionProgressions|listDistractorTargetObservations|listWarmupVisits|listWarmupQueueEntries|listWarmupMastery|listWarmupTransitions|listWarmupAttempts|listWarmupGraphPoints|listWarmupRotations|cloudDataToAppState)\b/,
  )
})

test('React composition imports neither Firestore operations nor recovery-journal modules', () => {
  const app = source('src/App.tsx')
  assert.doesNotMatch(app, /from ['"]\.\/firestoreClient/)
  assert.doesNotMatch(app, /from ['"][^'"]*PendingJournal/)
  assert.match(app, /startPracticeOperation/)
  assert.match(app, /recordPracticeAnswerOperation/)
  assert.match(app, /leavePracticeOperation/)
  assert.match(app, /completePracticeOperation/)
  assert.match(app, /discardTestReviewOperation/)
})

test('the application shell waits for durable completion before leaving practice', () => {
  const app = source('src/App.tsx')
  assert.equal(app.match(/await outcome\.cloudCommit/g)?.length, 3)
  assert.match(app, /completionInFlightRef/)
  assert.match(app, /await outcome\.cloudCommit[\s\S]*?setSession\(null\)[\s\S]*?setView\('home'\)/)
})

test('session completion and adaptive state cross one atomic persistence boundary', () => {
  const completion = source('src/application/practice/completion.ts')
  const firestoreClient = source('src/firestoreClient.ts')
  assert.doesNotMatch(completion, /Promise\.all|saveAdaptiveState/)
  assert.match(completion, /persistence\.completeSession\([\s\S]*?state,[\s\S]*?completedAt/)
  assert.match(firestoreClient, /cloudSessionCompletionWrites\([\s\S]*?adaptiveState: CloudAdaptiveState/)
  assert.match(firestoreClient, /warmupState', 'current'\], adaptiveState/)
})

test('practice application operations depend on capabilities instead of React or Firestore', () => {
  const files = filesUnder('src/application/practice').filter((path) => /\.tsx?$/.test(path))
  assert.ok(files.length >= 5)
  for (const path of files) {
    const contents = source(path)
    assert.doesNotMatch(
      contents,
      /from ['"][^'"]*(?:react|firestoreClient|firebaseClient|infrastructure)[^'"]*['"]/i,
      path,
    )
    assert.doesNotMatch(contents, /\b(?:window|localStorage)\b/, path)
  }
})

test('the application shell represents writing and reading as one mutually exclusive experience', () => {
  const app = source('src/App.tsx')
  assert.match(app, /type ActiveExperience =[\s\S]*kind: 'practice'[\s\S]*kind: 'reading'/)
  assert.match(app, /useState<ActiveExperience>\(null\)/)
  assert.doesNotMatch(app, /useState<PracticeSession \| null>/)
  assert.doesNotMatch(app, /useState<Tier2ReadingPathway \| null>/)
})

test('the render failure boundary cannot clear recovery journals', () => {
  const boundary = source('src/AppErrorBoundary.tsx')
  assert.doesNotMatch(boundary, /localStorage|sessionStorage|PendingJournal|removePending/i)
  assert.doesNotMatch(boundary, /saved practice is still safe/i)
  assert.match(boundary, /session-only activity may need to be restarted/)
})

test('profile switching and sign-out stay unavailable during an active experience', () => {
  const app = source('src/App.tsx')
  assert.match(app, /const activityControlsLocked = activeExperience !== null \|\| practiceStartInFlight/)
  assert.match(app, /startPracticeOperation\([\s\S]*?finally\(\(\) => setPracticeStartInFlight\(false\)\)/)
  assert.match(app, /if \(activityControlsLocked\) return/)
  assert.match(app, /className="profile-switcher"\s+disabled=\{activityControlsLocked\}/)
  assert.match(app, /showChildMenu && !activityControlsLocked/)
  assert.match(app, /Exit the current activity before switching profiles or signing out\./)
})
