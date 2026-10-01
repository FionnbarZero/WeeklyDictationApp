import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the modular games harness is development-only and outside production entry points', () => {
  const production = [source('index.html'), source('src/main.tsx'), source('src/App.tsx')].join('\n')
  const html = source('learning-games-harness.html')
  const harness = source('src/learningGamesHarness.tsx')

  assert.doesNotMatch(production, /learning-games-harness|learningGamesHarness/)
  assert.match(html, /id="learning-games-harness-root"/)
  assert.match(html, /src="\/src\/learningGamesHarness\.tsx"/)
  assert.match(harness, /import\.meta\.env\.DEV/)
  assert.match(harness, /Synthetic interaction-QA values only/)
  assert.doesNotMatch(harness, /grade5Lab|curriculum\/|warmup\/|acquisition\/|firebase|firestore|localStorage/i)
})

test('the harness exposes every modular game component from one gallery', () => {
  const harness = source('src/learningGamesHarness.tsx')
  for (const component of [
    'SpeedMatch',
    'TargetBlast',
    'LilyPadPath',
    'MemoryFlip',
    'ContextGapDash',
    'SentenceScramble',
    'ReadAloudBossRush',
    'DictationStreak',
    'CopyHideWriteCombo',
    'CorrectionRescue',
  ]) assert.match(harness, new RegExp(`<${component}`))

  assert.match(harness, /LEARNING_GAME_CATALOG\.map/)
  assert.match(harness, /<ReadingResponsePanel/)
  assert.match(harness, /renderResponse=/)
  assert.match(harness, /View emitted attempt events/)
  assert.match(harness, /Nothing is saved/)
})
