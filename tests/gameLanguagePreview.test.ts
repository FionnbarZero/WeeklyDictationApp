import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { inspectSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import {
  learningModuleCapabilities,
  learningModuleCapability,
  learningModuleCohortFromDatasets,
} from '../src/ninjaSkills/content.ts'
import { withPreviewGameLanguage } from '../src/ninjaSkills/gameLanguagePreview.ts'
import { GAME_CONTENT_VERSION, GAME_LANGUAGE } from '../src/ninjaSkills/gameLanguagePreviewCatalog.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'
import { assertGamePack } from '../src/ninjaSkills/review.ts'
import { startGameCheckpoint, validateGameCheckpoint } from '../src/ninjaSkills/progress.ts'
import { dictationAudioText } from '../src/ninjaSkills/dictationContent.ts'
import { currentSnapshot, newlySupported, nextLessonSnapshot } from './imported-game-content/fixtures.ts'
import { withGameLanguage } from './w2-recovery/contentFixtures.ts'

const modules = [
  'speed-match',
  'dictation-streak',
  'sentence-scramble',
  'context-gap-dash',
  'memory-flip',
  'target-blast',
] as const
const grades = [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const
function datasets(slug: string) {
  return inspectSnapshot(
    JSON.parse(readFileSync(new URL(`./fixtures/game-content-2026-10-26/${slug}.json`, import.meta.url), 'utf8')),
  ).datasets
}

for (const [slug, grade] of grades) {
  test(`${grade}: every current and retained Tier 1/2 occurrence has usable language without altering curriculum`, () => {
    const rows = GAME_LANGUAGE[grade]
    const terms = datasets(slug).flatMap((d) => learningModuleCohortFromDatasets(d.id, 'test', [d])!.terms)
    assert.deepEqual(
      new Set(rows.map((row) => row[0])),
      new Set(terms.filter((t) => t.tier !== 'tier-3').map((t) => t.text)),
    )
    assert.equal(new Set(rows.map((row) => row[0])).size, rows.length)
    for (const [text, meaning, pinyin, tokens, choices] of rows) {
      assert.ok(meaning.trim() && meaning.length <= 100, text)
      const chars = Array.from(text)
      assert.equal(pinyin.split(' ').length, chars.length, text)
      assert.equal(choices.length, chars.length, text)
      const sentence = tokens.join('')
      assert.ok(sentence.length < 256 && sentence !== text, text)
      assert.equal(sentence.split(text).length, 2, `${text}: one exact occurrence`)
      assert.ok(tokens.length >= 2 && tokens.length <= 64 && tokens.every((t) => t.trim()), text)
      for (const [index, choice] of choices.entries()) {
        assert.match(choice, /^[\u3400-\u9fff]{3}$/u)
        assert.equal(new Set(choice).size, 3, text)
        assert.ok(choice.includes(chars[index]), text)
      }
    }
    for (const d of datasets(slug)) {
      const original = learningModuleCohortFromDatasets(d.id, 'audit', [d])!
      const before = JSON.stringify(original)
      const enriched = withPreviewGameLanguage(original)
      assert.equal(JSON.stringify(original), before, 'source must not mutate')
      assert.deepEqual(enriched.provenance, original.provenance)
      assert.equal(enriched.terms.length, original.terms.length)
      enriched.terms.forEach((t, i) => {
        const prior = original.terms[i]
        assert.deepEqual(
          [t.text, t.tier, t.occurrenceId, t.datasetId],
          [prior.text, prior.tier, prior.occurrenceId, prior.datasetId],
        )
        if (t.tier === 'tier-3') assert.deepEqual(t, prior)
        else {
          assert.ok(t.meaning && t.context && t.pinyinText && t.pinyinSteps, t.text)
          assert.equal(t.supplementalVersion, GAME_CONTENT_VERSION)
        }
      })
      assert.deepEqual(withPreviewGameLanguage(enriched), enriched, 'idempotent support')
      const n1 = new Set(enriched.terms.filter((t) => t.tier === 'tier-1').map((t) => t.text)).size
      const n2 = new Set(enriched.terms.filter((t) => t.tier === 'tier-2').map((t) => t.text)).size
      for (const id of modules) {
        const capability = learningModuleCapability(
          id,
          { ...enriched, terms: enriched.terms.filter((t) => t.tier !== 'tier-3') },
          NINJA_SKILLS_PROFILES[grade],
          0,
          true,
        )
        const expected =
          id === 'context-gap-dash'
            ? n1 >= 3
            : ['speed-match', 'dictation-streak'].includes(id)
              ? n1 > 0 && n2 > 0
              : ['memory-flip', 'target-blast'].includes(id)
                ? n2 >= 2
                : n1 > 0
        assert.equal(capability.status, expected ? 'ready' : 'unavailable', `${grade}/${d.startDate}/${id}`)
        if (capability.status !== 'ready') continue
        assertGamePack(capability.pack)
        const checkpoint = startGameCheckpoint(
          { childId: 'synthetic-content-check', grade, week: d.startDate, gameId: id },
          capability.pack,
          'audit-run',
          'audit',
          '2026-10-25T12:00:00.000Z',
        )
        assert.deepEqual(validateGameCheckpoint(JSON.parse(JSON.stringify(checkpoint))), checkpoint)
        if (capability.pack.moduleId === 'dictation-streak') {
          for (const round of capability.pack.rounds) {
            const target = enriched.terms.find((t) => t.occurrenceId === round.targetId)!
            assert.equal(round.audioText, dictationAudioText(target.text, target.context!.sentence))
          }
        }
      }
      // All eligible targets appear across visits, not just the first displayed subset.
      for (const id of ['dictation-streak', 'speed-match', 'sentence-scramble'] as const) {
        if (id !== 'sentence-scramble' && !n2) continue
        const observed = new Set<string>()
        for (let visit = 0; visit < enriched.terms.length * 2; visit++) {
          const c = learningModuleCapability(
            id,
            { ...enriched, terms: enriched.terms.filter((t) => t.tier !== 'tier-3') },
            NINJA_SKILLS_PROFILES[grade],
            visit,
            true,
          )
          assert.equal(c.status, 'ready')
          if (c.status === 'ready')
            for (const prompt of 'pairs' in c.pack ? c.pack.pairs : c.pack.rounds)
              observed.add(enriched.terms.find((t) => t.occurrenceId === prompt.targetId)!.text)
        }
        assert.deepEqual(
          observed,
          new Set(
            enriched.terms
              .filter((t) => (id === 'sentence-scramble' ? t.tier === 'tier-1' : t.tier !== 'tier-3'))
              .map((t) => t.text),
          ),
        )
      }
    }
  })
}

test('source-provided content and unknown sources/targets are preserved; production catalog is unchanged', () => {
  const d = datasets('kindergarten')[0]
  const c = learningModuleCohortFromDatasets(d.id, 'test', [d])!
  for (const altered of [
    { ...c, grade: 'Unknown' as typeof c.grade },
    { ...c, provenance: [] },
    {
      ...c,
      provenance: c.provenance.map((p) => ({ ...p, source: { ...p.source, sourceDocumentId: 'other-source' } })),
    },
    { ...c, terms: c.terms.map((t) => ({ ...t, text: '未在目录中' })) },
  ])
    assert.deepEqual(withPreviewGameLanguage(altered), altered)
  const teacher = {
    ...c,
    terms: c.terms.map((t) => ({
      ...t,
      meaning: 'Source meaning',
      pinyinText: 'alternate pronunciation',
      context: { sentence: 'Source sentence', tokens: ['Source', ' sentence'] },
    })),
  }
  assert.deepEqual(withPreviewGameLanguage(teacher), teacher)
  const baseline = learningModuleCapabilities(c, NINJA_SKILLS_PROFILES.Kindergarten)
  assert.ok(
    baseline
      .filter((cap) => cap.status === 'ready')
      .every((cap) => cap.status === 'ready' && ['target-blast', 'memory-flip'].includes(cap.pack.moduleId)),
  )
})

test('saved packs and unused source terms never acquire the new catalog during review', () => {
  const d = inspectSnapshot(
    JSON.parse(readFileSync(new URL('./fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8')),
  ).datasets[0]
  const enriched = withPreviewGameLanguage(learningModuleCohortFromDatasets(d.id, 'test', [d])!)
  // These retained terms had identical support in the approved previous
  // catalog. Model its stored version so upgrading cannot silently repin it.
  const c = {
    ...enriched,
    terms: enriched.terms
      .filter((t) => t.tier !== 'tier-3')
      .map((t) => ({ ...t, supplementalVersion: 'practice-language-2026-10-25-v1' })),
  }
  for (const id of modules) {
    const cap = learningModuleCapability(id, c, NINJA_SKILLS_PROFILES['Grade 5'], 0, true)
    assert.equal(cap.status, 'ready')
    if (cap.status !== 'ready') throw new Error('Expected all six saved games to be supported')
    const before = structuredClone(cap.pack)
    const saved = startGameCheckpoint(
      { childId: 'saved-content-test', grade: 'Grade 5', week: d.startDate, gameId: cap.pack.moduleId },
      cap.pack,
      'saved',
      'old-writer',
      '2026-10-24T12:00:00.000Z',
    )
    assert.deepEqual(withPreviewGameLanguage(c), c, 'already-pinned language must not be refreshed')
    assert.ok(
      enriched.terms.filter((t) => t.tier !== 'tier-3').every((t) => t.supplementalVersion === GAME_CONTENT_VERSION),
    )
    assert.deepEqual(validateGameCheckpoint(JSON.parse(JSON.stringify(saved))).pack, before)
    assert.deepEqual(
      learningModuleCapability(cap.pack.moduleId, cap.pack.cohort, NINJA_SKILLS_PROFILES['Grade 5'], 0, true),
      cap,
    )
  }
})

for (const cohort of newlySupported) {
  test(`${cohort.grade}: newly imported targets retain their tiers and become normal earlier-target games`, async () => {
    const original = currentSnapshot(cohort.slug)
    const next = nextLessonSnapshot(cohort.slug)
    const originalUnits =
      original.payload.sourceType === 'google-sheets' ? original.payload.sheets : original.payload.slides
    const laterUnits = next.payload.sourceType === 'google-sheets' ? next.payload.sheets : next.payload.slides
    assert.deepEqual(
      laterUnits!.slice(1),
      originalUnits,
      'test clock advancement must preserve all original source units',
    )
    const source = await validateCurriculum(JSON.stringify(next), cohort.grade)
    assert.equal(source.datasets[0].startDate, '2026-11-02')
    const current = source.datasets.find((d) => d.startDate === cohort.week)!
    assert.deepEqual(
      current.vocabulary!.tier1.map((w) => w.text),
      cohort.writing,
    )
    assert.deepEqual(
      current.vocabulary!.tier2.map((w) => w.text),
      cohort.reading,
    )
    const games = reinforcementGames(withGameLanguage(source.datasets), '2026-11-02', cohort.grade)
    for (const game of games) {
      assert.deepEqual(
        game.datasets.map((d) => d.id),
        [current.id],
        'never borrow unrelated words to make a game ready',
      )
      const moduleId = game.capability.status === 'ready' ? game.capability.pack.moduleId : game.capability.moduleId
      if (cohort.slug === 'kindergarten' && moduleId === 'context-gap-dash') {
        assert.equal(game.capability.status, 'unavailable')
        if (game.capability.status === 'unavailable')
          assert.match(game.capability.reason, /at least three distinct Tier 1/)
      } else {
        assert.equal(game.capability.status, 'ready')
        if (game.capability.status === 'ready') assertGamePack(game.capability.pack)
      }
    }
    const words = withPreviewGameLanguage(learningModuleCohortFromDatasets(current.id, 'new', [current])!).terms
    for (const [text, pinyin] of cohort.slug === 'kindergarten'
      ? [
          ['绿色', 'lǜ sè'],
          ['黄色', 'huáng sè'],
          ['马', 'mǎ'],
        ]
      : [
          ['名字', 'míng zi'],
          ['穷苦', 'qióng kǔ'],
          ['银行', 'yín háng'],
          ['印在', 'yìn zài'],
        ]) {
      assert.equal(words.find((word) => word.text === text)!.pinyinText, pinyin)
    }
  })
}
