import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { createInitialState } from '../src/domain.ts'
import { hydrateLocalStateFromJson } from '../src/localHydration.ts'
import { grade2DeckProfile } from '../src/slidesImporter.ts'

const sourcePath = (relativePath: string) => fileURLToPath(new URL(`../${relativePath}`, import.meta.url))

function browserSource(directory: string): string {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return [browserSource(path)]
    return /\.(?:ts|tsx)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : []
  }).join('\n')
}

test('browser source has no shared dataset or import-log writer path', () => {
  assert.equal(existsSync(sourcePath('src/importerService.ts')), false)
  assert.doesNotMatch(readFileSync(sourcePath('src/App.tsx'), 'utf8'), /importerService|saveDataset|writeImportLog/)
  assert.doesNotMatch(readFileSync(sourcePath('src/localHydration.ts'), 'utf8'), /firestoreClient|saveDataset|writeImportLog/)
  assert.doesNotMatch(readFileSync(sourcePath('src/domain.ts'), 'utf8'), /firestoreClient|saveDataset|writeImportLog/)
  const source = browserSource(join(dirname(sourcePath('src/App.tsx'))))
  assert.doesNotMatch(source, /GOOGLE_OAUTH_|googleAccessToken|fetchGooglePresentation|oauth2\.googleapis\.com|slides\.googleapis\.com/)
  assert.doesNotMatch(source, /from ['"]\.\.\/backend\//)
})

test('dashboard exposes separate Acquisition and Test Review start controls', () => {
  const source = readFileSync(sourcePath('src/App.tsx'), 'utf8')
  assert.match(source, /'Start Acquisition'/)
  assert.match(source, /'Start Test Review'/)
  assert.match(source, /onClick=\{\(\) => onStart\(target\)\}/)
  assert.match(source, /acquisitionDataset && <PracticeLaneCard/)
  assert.match(source, /testReviewDataset && <PracticeLaneCard/)
})

test('Acquisition and Test Review use the configured six-trial adaptive Warmup', () => {
  const source = readFileSync(sourcePath('src/App.tsx'), 'utf8')
  assert.match(source, /targetSize: primaryChoices\.length > 0 \? practiceProfile\.lifecycle\.primaryWarmupTrials : undefined/)
  assert.match(source, /warmup: warmupSelection/)
})

test('cloud state reloads when a child grade changes', () => {
  const source = readFileSync(sourcePath('src/App.tsx'), 'utf8')
  assert.match(source, /selectedChild\?\.id, selectedChild\?\.grade/)
})

test('an unsupported grade shows an explicit setup state while preserving history access', () => {
  const source = readFileSync(sourcePath('src/App.tsx'), 'utf8')
  assert.match(source, /!practiceProfile && <UnsupportedPracticeView/)
  assert.match(source, /Practice for \{child\.grade\} is not configured yet\. Existing datasets and history remain available\./)
  assert.match(source, /function UnsupportedPracticeView[\s\S]*onClick=\{onHistory\}>View progress/)
})

test('Acquisition UI reveals every trial and visibly distinguishes only show-and-copy prompts', () => {
  const source = readFileSync(sourcePath('src/App.tsx'), 'utf8')
  assert.match(source, /return \{ \.\.\.current, acquisition: revealAcquisitionPrompt\(current\.acquisition\), stage: 'review' \}/)
  assert.match(source, /session\.segment === 'primary' \? session\.acquisition\?\.prompt : undefined/)
  assert.match(source, /wordIsVisibleDuringWriting\(acquisitionPrompt\?\.kind\)/)
  assert.match(source, /className="copy-target"/)
  assert.match(source, /Look, listen, and/)
  assert.match(source, /practicePosition\(session\)/)
  assert.match(source, /<PromptCountdown key=\{stageKey\} durationSeconds=\{timerSeconds\} onComplete=\{onDictationComplete\}/)
  assert.match(source, /setSession\(\{ \.\.\.current, acquisition: nextFlow, primaryAnswers, stage: 'dictation'/)
  assert.match(source, /className="replay-button" onClick=\{onReplay\}/)
  assert.doesNotMatch(source, /setInterval\(\(\) => setSeconds/)
})

test('header navigation abandons an active cloud practice session through the normal exit path', () => {
  const source = readFileSync(sourcePath('src/App.tsx'), 'utf8')
  assert.match(source, /const leavePractice = \(nextView: View\) =>/)
  assert.match(source, /const exitPractice = \(\) => leavePractice\('home'\)/)
  assert.match(source, /if \(view === 'practice' && nextView !== 'practice'\) \{ leavePractice\(nextView\); return \}/)
  assert.match(source, /void abandonSession\(/)
})

test('local hydration performs no network or Firestore writes', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Local hydration must not call fetch.')
  }) as typeof fetch
  try {
    const payload = JSON.stringify({
      presentationId: grade2DeckProfile.sourceDeckId,
      slides: [{ objectId: 'read-only-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
    })
    const result = hydrateLocalStateFromJson(createInitialState(), payload, grade2DeckProfile)
    assert.equal(result.state.datasets.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(fetchCalls, 0)
})
