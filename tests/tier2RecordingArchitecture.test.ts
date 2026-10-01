import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the recording presentation has a small explicit boundary and no persistence path', () => {
  assert.deepEqual(readdirSync(new URL('../src/readingPractice/', import.meta.url)).sort(), [
    'ReadingResponsePanel.tsx',
    'Tier2ReadingPractice.tsx',
    'audioRecorder.ts',
    'contracts.ts',
    'useAudioRecorder.ts',
  ])
  const combined = [
    source('src/readingPractice/ReadingResponsePanel.tsx'),
    source('src/readingPractice/Tier2ReadingPractice.tsx'),
    source('src/readingPractice/audioRecorder.ts'),
    source('src/readingPractice/contracts.ts'),
    source('src/readingPractice/useAudioRecorder.ts'),
  ].join('\n')
  assert.doesNotMatch(combined, /firebase|firestore|localStorage|indexedDB|fetch\s*\(|XMLHttpRequest|WebSocket/i)
  assert.doesNotMatch(source('src/tier2/contracts.ts'), /from ['"].*(?:react|firebase|firestore)|\bMediaRecorder\b|\bgetUserMedia\b/i)
})

test('Tier 1 and Tier 2 use the same red and green self-assessment component', () => {
  const tier1 = source('src/practice/PracticeView.tsx')
  const tier2 = source('src/readingPractice/ReadingResponsePanel.tsx')
  const actions = source('src/practice/SelfAssessmentActions.tsx')
  assert.match(tier1, /<SelfAssessmentActions/)
  assert.match(tier2, /<SelfAssessmentActions/)
  assert.match(actions, /className="wrong-button"/)
  assert.match(actions, /className="right-button"/)
})

test('the smoke presentation records before comparison and comparison before assessment', () => {
  const panel = source('src/readingPractice/ReadingResponsePanel.tsx')
  assert.match(panel, /Tap Record, then read the word aloud/)
  assert.match(panel, /Say the word\. Tap Stop when you finish/)
  assert.match(panel, /teachingPrompt/)
  assert.match(panel, /onPlayTeachingIntroduction/)
  assert.match(panel, /Listen, then read this word aloud/)
  assert.match(panel, /Record my reading/)
  assert.match(panel, /You’ll hear your voice first, then the example/)
  assert.match(panel, /Compare my reading/)
  assert.match(panel, /Did your reading match the example/)
  assert.match(panel, /incorrectLabel="Not yet"/)
  assert.match(panel, /correctLabel="Yes"/)
  assert.match(panel, /comparison !== 'complete'/)
  assert.match(panel, /comparison === 'complete'/)
  assert.match(panel, /Continue without recording/)
  assert.match(source('src/tier2ReadingLabHarness.tsx'), /Recordings stay in this prompt|recording is temporary/i)
  assert.match(source('src/tier2ReadingLabHarness.tsx'), /teachingPrompt=\{showContinue\}/)
  assert.match(source('src/tier2ReadingLabHarness.tsx'), /readingShowCopyInstruction/)
})

test('recording is exposed only through the shared Tier 2 runner and stays outside persistence infrastructure', () => {
  const infrastructure = [
    source('index.html'),
    source('src/main.tsx'),
    source('src/firestoreClient.ts'),
  ].join('\n')
  assert.doesNotMatch(infrastructure, /ReadingResponsePanel|Tier2ReadingPractice|getUserMedia|MediaRecorder/)
  assert.match(source('src/App.tsx'), /Tier2ReadingPractice/)
  assert.match(source('src/grade5LearningHubHarness.tsx'), /Tier2ReadingPractice/)
  assert.match(source('src/kindergartenLearningLabHarness.tsx'), /Tier2ReadingPractice/)
  assert.doesNotMatch(source('src/App.tsx'), /getUserMedia|MediaRecorder/)
  assert.match(source('src/tier2ReadingLabHarness.tsx'), /ReadingResponsePanel/)
})
