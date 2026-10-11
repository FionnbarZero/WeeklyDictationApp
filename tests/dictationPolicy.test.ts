import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import { learningModuleCapability } from '../src/ninjaSkills/content.ts'
import { dictationAudioText, withDictationContent } from '../src/ninjaSkills/dictationContent.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'
import { rotatingGameTerms } from '../src/ninjaSkills/policy.ts'
import { assertGamePack } from '../src/ninjaSkills/review.ts'
import {
  checkpointGameAnswer,
  completeGameCheckpoint,
  startGameCheckpoint,
  validateGameCheckpoint,
} from '../src/ninjaSkills/progress.ts'

for (const [slug, grade] of [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const) {
  test(`${grade}: Dictation four-part audio, reviewed errors, immutable facts and pinned language`, () => {
    const datasets = inspectSnapshot(
      JSON.parse(readFileSync(new URL(`../public/curriculum/beta/${slug}.json`, import.meta.url), 'utf8')),
    ).datasets
    const capability = reinforcementGames(datasets, '2026-10-05', grade).find(
      ({ capability: c }) => c.status === 'ready' && c.pack.moduleId === 'dictation-streak',
    )!.capability
    assert.ok(capability.status === 'ready' && capability.pack.moduleId === 'dictation-streak')
    const pack = capability.pack
    assertGamePack(pack)
    for (const round of pack.rounds) {
      const term = pack.cohort.terms.find((t) => t.occurrenceId === round.targetId)!
      assert.equal(round.audioText, dictationAudioText(term.text, term.context!.sentence))
      assert.deepEqual(round.audioText!.split('。').filter(Boolean), [
        term.text,
        term.context!.sentence.replace(/。$/, ''),
        term.text,
        term.text,
      ])
      assert.equal(round.pinyinSteps!.length, Array.from(term.text).length)
      for (const [index, step] of round.pinyinSteps!.entries())
        assert.ok(step.candidates.includes(Array.from(term.text)[index]))
    }
    assert.deepEqual(withDictationContent(pack.cohort), pack.cohort)
    const start = startGameCheckpoint(
      { childId: 'child', grade, week: '2026-10-05', gameId: 'dictation-streak' },
      pack,
      'attempt',
      'writer',
      '2026-10-11T12:00:00.000Z',
    )
    const answer = (index: number, response = pack.rounds[index].targetText, correct = true) => ({
      gameId: 'dictation-streak' as const,
      promptId: pack.rounds[index].id,
      targetId: pack.rounds[index].targetId,
      correct,
      response,
      assessmentMode: 'automatic' as const,
    })
    const now = '2026-10-11T12:01:00.000Z'
    const wrong = '错'.repeat(Array.from(pack.rounds[0].targetText).length)
    assert.throws(() => checkpointGameAnswer(start, answer(1), now), /current game prompt/)
    assert.throws(() => checkpointGameAnswer(start, answer(0, wrong), now))
    for (const invalid of ['', '123', 'pinyin', '字'.repeat(100)])
      assert.throws(() => checkpointGameAnswer(start, answer(0, invalid, false), now))
    let value = checkpointGameAnswer(start, answer(0, wrong, false), now)
    assert.deepEqual(value.cleared, [])
    assert.throws(() => checkpointGameAnswer(value, answer(1), now))
    assert.throws(() => validateGameCheckpoint({ ...value, cleared: [pack.rounds[0].id] }))
    for (let index = 0; index < pack.rounds.length; index++) value = checkpointGameAnswer(value, answer(index), now)
    const result = completeGameCheckpoint(value, now)
    assert.equal(result.result.attempted, pack.rounds.length + 1)
    assert.equal(result.result.correct, pack.rounds.length)
    assert.deepEqual(new Set(result.targets.map((t) => t.tier)), new Set(['tier-1', 'tier-2']))
    assert.equal(JSON.stringify(result).includes('"response"'), false)
    const tampered = structuredClone(start)
    if (tampered.pack.moduleId !== 'dictation-streak') throw new Error('Wrong fixture')
    ;(tampered.pack.rounds[0] as { audioText: string }).audioText = 'wrong prompt'
    assert.throws(() => validateGameCheckpoint(tampered))
    const tier1 = { ...pack.cohort, terms: pack.cohort.terms.filter((t) => t.tier === 'tier-1') }
    assert.equal(
      learningModuleCapability('dictation-streak', tier1, NINJA_SKILLS_PROFILES[grade]).status,
      'unavailable',
    )
    const missing = {
      ...pack.cohort,
      provenance: pack.cohort.provenance.map((p) => ({
        ...p,
        source: { ...p.source, sourceDocumentId: 'unrecognized' },
      })),
      terms: pack.cohort.terms.map((t) => ({ ...t, pinyinSteps: undefined })),
    }
    assert.equal(
      learningModuleCapability('dictation-streak', missing, NINJA_SKILLS_PROFILES[grade]).status,
      'unavailable',
    )
    const eligible = pack.cohort.terms.filter((t) => t.pinyinSteps && t.context)
    const reached = new Set<string>()
    for (let visit = 0; visit < eligible.length; visit++) {
      const selected = rotatingGameTerms('dictation-streak', eligible, 3, visit)
      assert.deepEqual(new Set(selected.map((t) => t.tier)), new Set(['tier-1', 'tier-2']))
      selected.forEach((t) => reached.add(t.occurrenceId))
    }
    assert.equal(reached.size, eligible.length)
  })
}
