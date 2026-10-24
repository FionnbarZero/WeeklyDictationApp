import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import type { BetaGrade } from '../src/familyBeta/model.ts'
import { masteredDatasetsForGrade, masteredGamesForGrade } from '../src/grade5PresentationPreview/masteredGames.ts'
import { assertGamePack } from '../src/ninjaSkills/review.ts'

for (const [slug, grade] of [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const) {
  test(`${grade}: mastered arcade preserves membership, channel rules and bounded rounds`, () => {
    const source = inspectSnapshot(
      JSON.parse(readFileSync(new URL(`./fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')),
    )
    const all = source.datasets
    const mastered = [...all].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 2)
    const before = JSON.stringify(all)
    const pool = masteredDatasetsForGrade(mastered, all, '2026-10-23', grade)
    const eligible = new Set(pool.flatMap((d) => [...d.words, ...(d.vocabulary?.tier2 || [])]).map((w) => w.id))
    const active = new Set(
      all
        .filter((d) => !mastered.includes(d) && d.startDate <= '2026-10-23')
        .flatMap((d) => [...d.words, ...(d.vocabulary?.tier2 || [])])
        .map((w) => w.text),
    )
    assert.ok(pool.every((d) => mastered.some((m) => m.id === d.id) && d.grade === grade))
    for (const d of pool)
      for (const word of [...d.words, ...(d.vocabulary?.tier2 || [])]) assert.ok(!active.has(word.text))
    let ready = 0
    for (const { capability } of masteredGamesForGrade(pool, [], 'synthetic-child', grade as BetaGrade)) {
      if (capability.status !== 'ready') {
        assert.ok(capability.reason.length > 0)
        continue
      }
      ready++
      assertGamePack(capability.pack)
      const prompts = 'pairs' in capability.pack ? capability.pack.pairs : capability.pack.rounds
      assert.ok(prompts.length > 0 && prompts.length <= 10)
      assert.ok(prompts.every((p) => eligible.has(p.targetId)))
    }
    assert.ok(ready > 0)
    assert.equal(JSON.stringify(all), before)
    assert.ok(
      masteredGamesForGrade([], [], 'synthetic-child', grade).every((g) => g.capability.status === 'unavailable'),
    )
  })
}
