import type { Dataset } from '../domain/contracts.ts'
import type { BetaGrade, BetaResult } from '../familyBeta/model.ts'
import { LEARNING_MODULE_CATALOG } from '../ninjaSkills/catalog.ts'
import { learningModuleCapability, learningModuleCohortFromDatasets } from '../ninjaSkills/content.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
import { withGrade5MasteredLanguage } from './masteredLanguage.ts'

// Match term text without depending on, or invoking, the adaptive warmup engine.
const normalizedText = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ')

/** The lifecycle supplies mastery membership. Never infer it from a game score
 * or borrow the current assessment when the mastered pool is empty. */
export function grade5MasteredDatasets(mastered: Dataset[], all: Dataset[], date: string) {
  return masteredDatasetsForGrade(mastered, all, date, 'Grade 5')
}

export function masteredDatasetsForGrade(mastered: Dataset[], all: Dataset[], date: string, grade: BetaGrade) {
  const ids = new Set(mastered.map((dataset) => dataset.id))
  const years = new Set(mastered.map((dataset) => dataset.schoolYear))
  const active = new Set(
    all
      .filter(
        (dataset) =>
          dataset.grade === grade && years.has(dataset.schoolYear) && dataset.startDate <= date && !ids.has(dataset.id),
      )
      .flatMap((dataset) => [...(dataset.vocabulary?.tier1 || dataset.words), ...(dataset.vocabulary?.tier2 || [])])
      .map((word) => normalizedText(word.text)),
  )
  const seenWriting = new Set<string>()
  const seenReading = new Set<string>()
  return [...mastered]
    .filter((dataset) => dataset.grade === grade && dataset.startDate <= date)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id))
    .map((dataset) => {
      const eligible = (words: Dataset['words'], seen: Set<string>) =>
        words.filter((word) => {
          const text = normalizedText(word.text)
          if (!text || active.has(text) || seen.has(text)) return false
          seen.add(text)
          return true
        })
      const writing = eligible(dataset.vocabulary?.tier1 || dataset.words, seenWriting)
      const reading = eligible(dataset.vocabulary?.tier2 || [], seenReading)
      return { ...dataset, words: writing, vocabulary: { tier1: writing, tier2: reading, tier3: [] } }
    })
    .filter((dataset) => dataset.words.length || dataset.vocabulary.tier2.length)
}

/** Same five games as this Grade 5 Ninja Skills preview, ordinary game scoring,
 * and existing bounded rounds. No adaptive warmup or mastery assessments. */
export function grade5MasteredGames(datasets: Dataset[], completed: readonly BetaResult[], childId: string) {
  return masteredGamesForGrade(datasets, completed, childId, 'Grade 5')
}

/** Reuse each grade's existing tier, bounded-round and result policy. An empty
 * mastered pool never borrows from the current lesson. No mastery writes. */
export function masteredGamesForGrade(
  datasets: Dataset[],
  completed: readonly BetaResult[],
  childId: string,
  grade: BetaGrade,
) {
  const base = learningModuleCohortFromDatasets(
    `mastered:${datasets.map((dataset) => dataset.id).join(':')}`,
    'Mastered words',
    datasets,
  )
  // Writing precedes reading when a target occurs in both: sentence builders
  // must not lose its writing occurrence while deduplicating visible words.
  const cohort = base
    ? withGrade5MasteredLanguage({
        ...base,
        terms: [
          ...base.terms.filter((term) => term.tier === 'tier-1'),
          ...base.terms.filter((term) => term.tier === 'tier-2'),
        ],
      })
    : null
  return LEARNING_MODULE_CATALOG.filter((entry) => grade !== 'Grade 5' || entry.id !== 'dictation-streak').map(
    (entry) => {
      const visit = new Set(
        completed
          .filter(
            (result) =>
              result.childId === childId &&
              result.grade === grade &&
              result.channel === 'game' &&
              result.activity === entry.title &&
              result.datasetIds.length === datasets.length &&
              datasets.every((dataset) => result.datasetIds.includes(dataset.id)),
          )
          .map((result) => result.id),
      ).size
      return {
        capability: learningModuleCapability(entry.id, cohort, NINJA_SKILLS_PROFILES[grade], visit),
        channel: 'mixed' as const,
        datasets,
      }
    },
  )
}
