import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { masteredGamesForGrade } from '../src/grade5PresentationPreview/masteredGames.ts'
import { octoberStrokeMedians } from '../src/learningGames/strokeOrder/octoberStrokeAssets.ts'
import { buildStrokeOrderRounds } from '../src/learningGames/strokeOrder/rounds.ts'
import { CONTEXT_GAP_MS, playGappedContext } from '../src/reportRepairs/contextAudio.ts'
import { reserveMaintenanceGame } from '../src/reportRepairs/maintenanceRotation.ts'
import { reportRepairsPreview } from '../src/reportRepairs/policy.ts'
import { zuiOutlines } from '../src/reportRepairs/zuiOutlines.ts'
import { FIVE_STEP_SEQUENCE, strokeMatchesGuide, suppliedStrokes } from '../src/strokeTeacherPrototype/model.ts'
import { withGameLanguage } from './w2-recovery/contentFixtures.ts'

test('report repair feature remains off for ordinary builds', () => assert.equal(reportRepairsPreview, false))
test('Context Gap reads only the two sides slowly, leaves silence, and cancels a superseded continuation', async () => {
  const spoken: unknown[] = []
  let current = true
  const round = { sentenceBefore: '小鸟住在', sentenceAfter: '里。' }
  await playGappedContext(
    round,
    async (...args) => {
      spoken.push(args)
    },
    async (ms) => {
      spoken.push(ms)
    },
    () => current,
  )
  assert.deepEqual(spoken, [['小鸟住在', 'zh-CN', 0.5], CONTEXT_GAP_MS, ['里。', 'zh-CN', 0.5]])
  spoken.length = 0
  await playGappedContext(
    round,
    async (...args) => {
      spoken.push(args)
    },
    async () => {
      current = false
    },
    () => current,
  )
  assert.deepEqual(spoken, [['小鸟住在', 'zh-CN', 0.5]])
})
test('new maintenance entrances rotate without requiring a score, partition by child, and reject damaged cursors', async () => {
  const source = await validateCurriculum(
    readFileSync('tests/fixtures/game-content-2026-10-26/grade2.json', 'utf8'),
    'Grade 2',
  )
  const datasets = withGameLanguage(source.datasets.filter((d) => d.startDate < '2026-09-29'))
  const game = masteredGamesForGrade(datasets, [], 'one', 'Grade 2').find(
    (g) => g.capability.status === 'ready' && g.capability.pack.moduleId === 'speed-match',
  )!
  assert.equal(game.capability.status, 'ready')
  if (game.capability.status !== 'ready') return
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
  const a = reserveMaintenanceGame(storage, 'one', 'Grade 2', game.capability.pack),
    b = reserveMaintenanceGame(storage, 'one', 'Grade 2', game.capability.pack)
  assert.equal(a.moduleId, 'speed-match')
  assert.equal(b.moduleId, 'speed-match')
  if (a.moduleId !== 'speed-match' || b.moduleId !== 'speed-match') return
  assert.notDeepEqual(
    a.pairs.map((p) => p.targetId),
    b.pairs.map((p) => p.targetId),
  )
  assert.deepEqual(reserveMaintenanceGame(storage, 'two', 'Grade 2', game.capability.pack), a)
  map.set([...map.keys()][0], 'broken')
  assert.throws(() => reserveMaintenanceGame(storage, 'one', 'Grade 2', game.capability.pack))
  assert.equal(map.get([...map.keys()][0]), 'broken')
})
test('最 retains all twelve strokes through backward chaining and uses twelve source contours', () => {
  assert.equal(octoberStrokeMedians.最.length, 12)
  assert.equal(zuiOutlines.length, 12)
  const strokes = buildStrokeOrderRounds([{ id: 'zui', text: '最' }]).rounds[0].strokes
  for (const step of FIVE_STEP_SEQUENCE) {
    const prefix = suppliedStrokes(step, strokes.length)
    assert.equal(prefix + (strokes.length - prefix), 12)
    for (const stroke of strokes) assert.equal(strokeMatchesGuide(stroke, stroke), true)
  }
  assert.equal(suppliedStrokes(3, 12), 8)
  assert.equal(suppliedStrokes(4, 12), 4)
})
