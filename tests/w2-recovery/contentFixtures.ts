import type { Dataset, Word } from '../../src/domain/contracts.ts'
import { learningModuleCohortFromDatasets } from '../../src/ninjaSkills/content.ts'
import { withPreviewGameLanguage } from '../../src/ninjaSkills/gameLanguagePreview.ts'

/** Match the isolated build's opt-in catalog while Node keeps production flags off. */
export function withGameLanguage(datasets: readonly Dataset[]): Dataset[] {
  return datasets.map((dataset) => {
    const cohort = withPreviewGameLanguage(learningModuleCohortFromDatasets(dataset.id, 'test', [dataset])!)
    const word = (value: Word): Word => {
      const term = cohort.terms.find((t) => t.occurrenceId === value.id)!
      return {
        ...value,
        learningModule: {
          ...value.learningModule,
          meaning: term.meaning,
          pinyinText: term.pinyinText,
          pinyinSteps: term.pinyinSteps,
          context: term.context,
        },
      }
    }
    return {
      ...dataset,
      words: dataset.words.map(word),
      ...(dataset.vocabulary
        ? {
            vocabulary: {
              tier1: dataset.vocabulary.tier1.map(word),
              tier2: dataset.vocabulary.tier2.map(word),
              tier3: dataset.vocabulary.tier3.map(word),
            },
          }
        : {}),
    }
  })
}
