import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  LEARNING_GAME_CATALOG,
  learningGamesForChannel,
  learningGameSupportsChannel,
} from '../src/learningGames/catalog.ts'
import {
  memoryDeck,
  sequenceIsCorrect,
  summarizeLearningGame,
  validContextRounds,
  validGamePairs,
  validSelectionRounds,
  validSequenceRounds,
} from '../src/learningGames/model.ts'

test('the reusable catalog exposes ten unique formats with strict channel ownership', () => {
  assert.equal(LEARNING_GAME_CATALOG.length, 10)
  assert.equal(new Set(LEARNING_GAME_CATALOG.map((game) => game.id)).size, 10)
  assert.deepEqual(
    learningGamesForChannel('tier-1-writing').filter((game) => game.skills.includes('writing')).map((game) => game.id),
    ['dictation-streak', 'copy-hide-write-combo', 'correction-rescue'],
  )
  assert.deepEqual(
    learningGamesForChannel('tier-2-reading').filter((game) => game.skills.includes('reading')).map((game) => game.id),
    ['context-gap-dash', 'sentence-scramble', 'read-aloud-boss-rush'],
  )
  assert.equal(learningGameSupportsChannel('dictation-streak', 'tier-2-reading'), false)
  assert.equal(learningGameSupportsChannel('read-aloud-boss-rush', 'tier-1-writing'), false)
  for (const id of ['speed-match', 'target-blast', 'lily-pad-path', 'memory-flip'] as const) {
    assert.equal(learningGameSupportsChannel(id, 'tier-1-writing'), true)
    assert.equal(learningGameSupportsChannel(id, 'tier-2-reading'), true)
  }
})

test('pair, selection, and sequence contracts reject malformed engine input', () => {
  const pairs = [{
    id: 'pair-1',
    targetId: 'target-1',
    left: { id: 'left-1', label: 'left' },
    right: { id: 'right-1', label: 'right' },
  }]
  const selection = [{
    id: 'prompt-1',
    targetId: 'target-1',
    targetText: 'target',
    choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    correctChoiceId: 'a',
  }]
  const sequence = [{
    id: 'sequence-1',
    targetId: 'target-1',
    targetText: 'target',
    tokens: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    correctTokenIds: ['b', 'a'],
  }]

  assert.equal(validGamePairs(pairs), true)
  assert.equal(validGamePairs([{ ...pairs[0], right: pairs[0].left }]), false)
  assert.equal(validSelectionRounds(selection), true)
  assert.equal(validSelectionRounds([{ ...selection[0], correctChoiceId: 'missing' }]), false)
  assert.equal(validContextRounds([{ ...selection[0], sentenceBefore: '', sentenceAfter: '' }]), false)
  assert.equal(validContextRounds([{ ...selection[0], sentenceBefore: 'Before ', sentenceAfter: ' after.' }]), true)
  assert.equal(validSequenceRounds(sequence), true)
  assert.equal(validSequenceRounds([{ ...sequence[0], correctTokenIds: ['a'] }]), false)
  assert.equal(sequenceIsCorrect(sequence[0], ['b', 'a']), true)
  assert.equal(sequenceIsCorrect(sequence[0], ['a', 'b']), false)
})

test('memory layout and summaries preserve engine-owned identities', () => {
  const pairs = [
    { id: 'p1', targetId: 't1', left: { id: 'l1', label: 'L1' }, right: { id: 'r1', label: 'R1' } },
    { id: 'p2', targetId: 't2', left: { id: 'l2', label: 'L2' }, right: { id: 'r2', label: 'R2' } },
  ]
  const deck = memoryDeck(pairs)
  assert.equal(deck.length, 4)
  assert.deepEqual(new Set(deck.map((card) => card.pairId)), new Set(['p1', 'p2']))
  assert.deepEqual(new Set(deck.map((card) => card.targetId)), new Set(['t1', 't2']))

  const attempts = [{
    gameId: 'speed-match' as const,
    promptId: 'p1',
    targetId: 't1',
    correct: true,
    response: ['l1', 'r1'],
    assessmentMode: 'automatic' as const,
  }]
  assert.deepEqual(summarizeLearningGame('speed-match', attempts), {
    gameId: 'speed-match',
    attempted: 1,
    correct: 1,
    attempts,
  })
})

test('the game library remains independent from curriculum and learning engines', () => {
  const sources = [
    'contracts.ts',
    'catalog.ts',
    'model.ts',
    'GameShell.tsx',
    'PairGames.tsx',
    'SelectionGames.tsx',
    'SentenceScramble.tsx',
    'ProductionGames.tsx',
    'index.ts',
  ].map((file) => readFileSync(new URL(`../src/learningGames/${file}`, import.meta.url), 'utf8')).join('\n')

  assert.doesNotMatch(sources, /grade5Lab|curriculum\/|warmup\/|acquisition\/|firebase|firestore/i)
  assert.doesNotMatch(sources, /2026-|grade-5__|神奇|或者|了解/)
})
