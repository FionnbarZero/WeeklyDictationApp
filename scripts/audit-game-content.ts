import { readFileSync } from 'node:fs'
import { inspectSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { learningModuleCapabilities, learningModuleCohortFromDatasets } from '../src/ninjaSkills/content.ts'
import { withPreviewGameLanguage } from '../src/ninjaSkills/gameLanguagePreview.ts'
import { GAME_CONTENT_VERSION } from '../src/ninjaSkills/gameLanguagePreviewCatalog.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'
import { assertGamePack } from '../src/ninjaSkills/review.ts'
import type { LearningModuleCapability } from '../src/ninjaSkills/contracts.ts'

const games = (capabilities: readonly LearningModuleCapability[]) =>
  Object.fromEntries(
    capabilities.map((cap) => {
      if (cap.status === 'unavailable') return [cap.moduleId, { ready: false, reason: cap.reason }]
      assertGamePack(cap.pack)
      return [cap.pack.moduleId, { ready: true, ...cap.pack.selection }]
    }),
  )
const grades = []
for (const slug of ['kindergarten', 'grade2', 'grade5']) {
  const raw = readFileSync(new URL(`../tests/fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')
  const snapshot = JSON.parse(raw)
  await validateCurriculum(raw, snapshot.grade)
  const { datasets } = inspectSnapshot(snapshot)
  const unique = new Set<string>()
  const lessons = datasets.map((dataset) => {
    const rawCohort = learningModuleCohortFromDatasets(dataset.id, dataset.startDate, [dataset])!
    const cohort = { ...rawCohort, terms: rawCohort.terms.filter((t) => t.tier !== 'tier-3') }
    cohort.terms.forEach((term) => unique.add(term.text))
    const supported = withPreviewGameLanguage(cohort)
    const profile = NINJA_SKILLS_PROFILES[dataset.grade]
    return {
      week: dataset.startDate,
      sourceTargets: cohort.terms.length,
      missing: supported.terms
        .filter((t) => !t.meaning || !t.context || !t.pinyinText || !t.pinyinSteps)
        .map((t) => t.text),
      before: games(learningModuleCapabilities(cohort, profile)),
      after: games(learningModuleCapabilities(supported, profile)),
    }
  })
  grades.push({ grade: snapshot.grade, sourceHash: snapshot.contentSha256, uniqueTargets: unique.size, lessons })
}
console.log(
  JSON.stringify(
    {
      version: GAME_CONTENT_VERSION,
      scope: 'Exact retained Tier 1/2 sources; generated support, no vocabulary or policy changes.',
      grades,
    },
    null,
    2,
  ),
)
