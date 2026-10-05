import type { Dataset, Word } from '../domain/contracts.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { candidateContentFingerprint } from '../curriculum/identity.ts'
import type { LearningHubActivity } from '../learningHub/contracts.ts'
import { LEARNING_MODULE_CATALOG, learningModuleCatalogEntry } from './catalog.ts'
import type {
  LearningModuleCapability,
  LearningModuleChoice,
  LearningModuleCohort,
  LearningModuleContextRound,
  LearningModuleId,
  LearningModulePack,
  LearningModuleSelectionRound,
  LearningModuleSequenceRound,
  LearningModuleTerm,
} from './contracts.ts'
import type { NinjaSkillsProfile } from './profiles.ts'

function distinctTerms(terms: readonly LearningModuleTerm[]) {
  const seen = new Set<string>()
  return terms.filter((term) => {
    if (!term.occurrenceId || !term.text.trim() || seen.has(term.occurrenceId)) return false
    seen.add(term.occurrenceId)
    return true
  })
}

function distinctTermsByText(terms: readonly LearningModuleTerm[]) {
  const seen = new Set<string>()
  return terms.filter((term) => {
    const text = term.text.trim()
    if (!text || seen.has(text)) return false
    seen.add(text)
    return true
  })
}

function scopeNote(included: number, eligible: number) {
  return eligible > included
    ? `This practice visit uses the first ${included} of ${eligible} eligible source targets in source order.`
    : undefined
}

function termFromWord(word: Word): LearningModuleTerm {
  return {
    occurrenceId: word.id,
    text: word.text.trim(),
    tier: word.tier || 'tier-1',
    ...(word.learningModule?.meaning ? { meaning: word.learningModule.meaning } : {}),
    ...(word.learningModule?.pinyinText ? { pinyinText: word.learningModule.pinyinText } : {}),
    ...(word.learningModule?.pinyinSteps ? { pinyinSteps: word.learningModule.pinyinSteps } : {}),
    ...(word.learningModule?.context ? { context: word.learningModule.context } : {}),
  }
}

function datasetProvenance(dataset: Dataset): LearningModuleCohort['provenance'][number] | null {
  const source = dataset.source || (dataset.sourceDeckId && dataset.sourceSlideId
    ? {
        sourceType: 'google-slides' as const,
        sourceDocumentId: dataset.sourceDeckId,
        sourceUnitId: dataset.sourceSlideId,
        adapterId: 'grade-2-google-slides-legacy-projection',
      }
    : null)
  if (!source) return null
  const vocabulary = dataset.vocabulary || { tier1: dataset.words, tier2: [], tier3: [] }
  const occurrences = (words: readonly Word[]) => words.map((word, index) => ({
    text: word.text,
    sourcePosition: index + 1,
    targetOccurrenceId: word.id,
    ...(word.learningModule ? { learningModule: word.learningModule } : {}),
  }))
  const contentFingerprint = dataset.contentFingerprint || candidateContentFingerprint({
    grade: dataset.grade,
    schoolYear: dataset.schoolYear,
    assignedWeek: { startDate: dataset.startDate, endDate: dataset.endDate },
    tier1: occurrences(vocabulary.tier1),
    tier2: occurrences(vocabulary.tier2),
    tier3: occurrences(vocabulary.tier3),
  })
  return { datasetId: dataset.id, contentFingerprint, source }
}

export function learningModuleCohortFromDatasets(
  id: string,
  label: string,
  datasets: readonly Dataset[],
): LearningModuleCohort | null {
  const provenance = datasets.map(datasetProvenance)
  if (!datasets.length || provenance.some((item) => !item)) return null
  const words = datasets.flatMap((dataset) =>
    dataset.vocabulary
      ? [...dataset.vocabulary.tier1, ...dataset.vocabulary.tier2, ...dataset.vocabulary.tier3]
      : dataset.words,
  )
  return {
    id,
    label,
    grade: datasets[0].grade,
    schoolYear: datasets[0].schoolYear,
    terms: distinctTerms(words.map(termFromWord)),
    provenance: provenance.filter((item): item is NonNullable<typeof item> => Boolean(item)),
  }
}

export function learningModuleCohortFromCandidate(candidate: WeeklyDatasetCandidate): LearningModuleCohort | null {
  if (!candidate.datasetId || !candidate.contentFingerprint || candidate.status !== 'valid') return null
  const terms = (['tier1', 'tier2', 'tier3'] as const).flatMap((tierKey) => {
    const tier = tierKey === 'tier1' ? 'tier-1' : tierKey === 'tier2' ? 'tier-2' : 'tier-3'
    return candidate[tierKey].map(
      (word): LearningModuleTerm => ({
        occurrenceId: word.targetOccurrenceId || '',
        text: word.text.trim(),
        tier,
        ...(word.learningModule?.meaning ? { meaning: word.learningModule.meaning } : {}),
        ...(word.learningModule?.pinyinText ? { pinyinText: word.learningModule.pinyinText } : {}),
        ...(word.learningModule?.pinyinSteps ? { pinyinSteps: word.learningModule.pinyinSteps } : {}),
        ...(word.learningModule?.context ? { context: word.learningModule.context } : {}),
      }),
    )
  })
  return {
    id: candidate.datasetId,
    label: candidate.dateRangeLabel || candidate.rawDate || 'Current cohort',
    grade: candidate.grade,
    schoolYear: candidate.schoolYear,
    terms: distinctTerms(terms),
    provenance: [
      {
        datasetId: candidate.datasetId,
        contentFingerprint: candidate.contentFingerprint,
        source: candidate.source,
      },
    ],
  }
}

function choice(term: LearningModuleTerm): LearningModuleChoice {
  return { id: `choice:${term.occurrenceId}`, label: term.text }
}

function unavailable(moduleId: LearningModuleId, reason: string): LearningModuleCapability {
  return { status: 'unavailable', moduleId, reason }
}

function ready(pack: LearningModulePack): LearningModuleCapability {
  return { status: 'ready', pack }
}

function selectionChoices(terms: readonly LearningModuleTerm[], targetIndex: number) {
  const target = terms[targetIndex]
  const rotated = [...terms.slice(targetIndex + 1), ...terms.slice(0, targetIndex)]
  const selected = [target, ...rotated].slice(0, Math.min(3, terms.length))
  const shift = targetIndex % selected.length
  return [...selected.slice(shift), ...selected.slice(0, shift)].map(choice)
}

function exactContextParts(term: LearningModuleTerm) {
  const sentence = term.context?.sentence.trim() || ''
  const first = sentence.indexOf(term.text)
  if (first < 0 || first !== sentence.lastIndexOf(term.text)) return null
  return { before: sentence.slice(0, first), after: sentence.slice(first + term.text.length) }
}

function dictationPack(cohort: LearningModuleCohort, profile: NinjaSkillsProfile): LearningModuleCapability {
  const eligible = cohort.terms.filter((term) => {
    const characters = Array.from(term.text)
    return (
      term.tier === 'tier-1' &&
      term.pinyinSteps?.length === characters.length &&
      term.pinyinSteps.every(
        (step, index) =>
          step.pinyin.trim() &&
          step.candidates.length > 0 &&
          step.candidates.every((candidate) => Array.from(candidate).length === 1) &&
          step.candidates.includes(characters[index]),
      )
    )
  })
  const terms = eligible.slice(0, profile.maximumItems['dictation-streak'])
  if (!terms.length)
    return unavailable(
      'dictation-streak',
      'This cohort does not yet include reviewed Pinyin steps for Dictation Streak.',
    )
  return ready({
    moduleId: 'dictation-streak',
    title: learningModuleCatalogEntry('dictation-streak').title,
    cohort,
    ...(scopeNote(terms.length, eligible.length) ? { scopeNote: scopeNote(terms.length, eligible.length) } : {}),
    rounds: terms.map((term) => ({
      id: `dictation:${term.occurrenceId}`,
      targetId: term.occurrenceId,
      targetText: term.text,
      audioText: term.text,
      instruction: 'Listen, type each Pinyin syllable, then choose the correct character.',
      ...(term.pinyinText ? { pinyinText: term.pinyinText } : {}),
      pinyinSteps: term.pinyinSteps!,
    })),
  })
}

function speedMatchPack(cohort: LearningModuleCohort, profile: NinjaSkillsProfile): LearningModuleCapability {
  const eligible = distinctTermsByText(cohort.terms.filter((term) => term.meaning?.trim()))
  const terms = eligible.slice(0, profile.maximumItems['speed-match'])
  if (terms.length < 2)
    return unavailable(
      'speed-match',
      'Shuriken Match needs approved English meanings for at least two targets in this cohort.',
    )
  if (new Set(terms.map((term) => term.meaning!.trim())).size !== terms.length)
    return unavailable(
      'speed-match',
      'Shuriken Match needs a distinct approved English meaning for every target in this practice visit.',
    )
  return ready({
    moduleId: 'speed-match',
    title: learningModuleCatalogEntry('speed-match').title,
    cohort,
    ...(scopeNote(terms.length, eligible.length) ? { scopeNote: scopeNote(terms.length, eligible.length) } : {}),
    pairs: terms.map((term) => ({
      id: `meaning:${term.occurrenceId}`,
      targetId: term.occurrenceId,
      left: { id: `word:${term.occurrenceId}`, label: term.text },
      right: { id: `meaning:${term.occurrenceId}:answer`, label: term.meaning! },
    })),
  })
}

function targetBlastPack(cohort: LearningModuleCohort, profile: NinjaSkillsProfile): LearningModuleCapability {
  const preferred = cohort.terms.filter((term) => term.tier === 'tier-2')
  const pool = distinctTermsByText(
    preferred.length >= 2 ? preferred : cohort.terms.filter((term) => term.tier !== 'tier-3'),
  )
  if (pool.length < 2)
    return unavailable(
      'target-blast',
      'Shadow Strike Dojo needs at least two distinct authoritative targets in the same cohort.',
    )
  const terms = pool.slice(0, profile.maximumItems['target-blast'])
  const rounds: LearningModuleSelectionRound[] = terms.map((term, index) => ({
    id: `shadow:${term.occurrenceId}`,
    targetId: term.occurrenceId,
    targetText: term.text,
    cueText: 'Listen, then strike the matching character',
    audioText: term.text,
    choices: selectionChoices(pool, index),
    correctChoiceId: choice(term).id,
  }))
  return ready({
    moduleId: 'target-blast',
    title: learningModuleCatalogEntry('target-blast').title,
    cohort,
    ...(scopeNote(terms.length, pool.length) ? { scopeNote: scopeNote(terms.length, pool.length) } : {}),
    rounds,
  })
}

function memoryPack(cohort: LearningModuleCohort, profile: NinjaSkillsProfile): LearningModuleCapability {
  const eligible = distinctTermsByText(cohort.terms.filter((term) => term.tier !== 'tier-3'))
  const terms = eligible.slice(0, profile.maximumItems['memory-flip'])
  if (terms.length < 2)
    return unavailable(
      'memory-flip',
      'Memory Lanterns needs at least two distinct authoritative targets in this cohort.',
    )
  return ready({
    moduleId: 'memory-flip',
    title: learningModuleCatalogEntry('memory-flip').title,
    cohort,
    ...(scopeNote(terms.length, eligible.length) ? { scopeNote: scopeNote(terms.length, eligible.length) } : {}),
    pairs: terms.map((term) => ({
      id: `memory:${term.occurrenceId}`,
      targetId: term.occurrenceId,
      left: { id: `memory:${term.occurrenceId}:one`, label: term.text },
      right: { id: `memory:${term.occurrenceId}:two`, label: term.text },
    })),
  })
}

function contextPack(cohort: LearningModuleCohort, profile: NinjaSkillsProfile): LearningModuleCapability {
  const pool = distinctTermsByText(cohort.terms.filter((term) => term.tier === 'tier-2'))
  const eligible = pool.filter((term) => exactContextParts(term))
  const terms = eligible.slice(0, profile.maximumItems['context-gap-dash'])
  if (pool.length < 3 || !terms.length)
    return unavailable(
      'context-gap-dash',
      'Context Gap Dash needs an approved sentence and at least three distinct Tier 2 choices.',
    )
  const rounds: LearningModuleContextRound[] = terms.map((term) => {
    const parts = exactContextParts(term)!
    const index = pool.findIndex((candidate) => candidate.occurrenceId === term.occurrenceId)
    return {
      id: `context:${term.occurrenceId}`,
      targetId: term.occurrenceId,
      targetText: term.text,
      cueText: term.context!.sentence,
      audioText: term.context!.sentence,
      sentenceBefore: parts.before,
      sentenceAfter: parts.after,
      choices: selectionChoices(pool, index),
      correctChoiceId: choice(term).id,
    }
  })
  return ready({
    moduleId: 'context-gap-dash',
    title: learningModuleCatalogEntry('context-gap-dash').title,
    cohort,
    ...(scopeNote(terms.length, eligible.length) ? { scopeNote: scopeNote(terms.length, eligible.length) } : {}),
    rounds,
  })
}

function sentencePack(cohort: LearningModuleCohort, profile: NinjaSkillsProfile): LearningModuleCapability {
  const eligible = cohort.terms
    .filter((term) => {
      const sentence = term.context?.sentence.trim() || ''
      const tokens = term.context?.tokens || []
      return tokens.length >= 2 && tokens.every((token) => token.trim()) && tokens.join('') === sentence
    })
  const terms = eligible.slice(0, profile.maximumItems['sentence-scramble'])
  if (!terms.length)
    return unavailable(
      'sentence-scramble',
      'Sushi Scramble needs an approved sentence and explicit ordered tokens for this cohort.',
    )
  const rounds: LearningModuleSequenceRound[] = terms.map((term) => {
    const tokens = term.context!.tokens.map((label, index) => ({
      id: `token:${term.occurrenceId}:${index + 1}`,
      label,
    }))
    return {
      id: `sentence:${term.occurrenceId}`,
      targetId: term.occurrenceId,
      targetText: term.context!.sentence,
      audioText: term.context!.sentence,
      tokens,
      correctTokenIds: tokens.map((token) => token.id),
    }
  })
  return ready({
    moduleId: 'sentence-scramble',
    title: learningModuleCatalogEntry('sentence-scramble').title,
    cohort,
    ...(scopeNote(terms.length, eligible.length) ? { scopeNote: scopeNote(terms.length, eligible.length) } : {}),
    rounds,
  })
}

export function learningModuleCapabilities(
  cohort: LearningModuleCohort | null,
  profile: NinjaSkillsProfile,
): readonly LearningModuleCapability[] {
  if (!cohort || cohort.provenance.length === 0) {
    return LEARNING_MODULE_CATALOG.map((entry) =>
      unavailable(
        entry.id,
        `Connect and validate the authoritative ${profile.grade} curriculum source before using this learning module.`,
      ),
    )
  }
  return [
    dictationPack(cohort, profile),
    speedMatchPack(cohort, profile),
    targetBlastPack(cohort, profile),
    memoryPack(cohort, profile),
    contextPack(cohort, profile),
    sentencePack(cohort, profile),
  ]
}

export function learningModuleActivities<Launch>(
  cohort: LearningModuleCohort | null,
  profile: NinjaSkillsProfile,
  launch: (pack: LearningModulePack) => Launch,
): LearningHubActivity<Launch>[] {
  return learningModuleCapabilities(cohort, profile).map((capability) => {
    const entry = learningModuleCatalogEntry(
      capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId,
    )
    return {
      id: `learning-module:${entry.id}`,
      eyebrow: entry.eyebrow,
      title: entry.title,
      description: entry.description,
      icon: entry.icon,
      ...(capability.status === 'unavailable'
        ? { note: capability.reason }
        : capability.pack.scopeNote
          ? { note: capability.pack.scopeNote }
          : {}),
      action:
        capability.status === 'ready'
          ? { kind: 'launch', label: `Start ${entry.title}`, launch: launch(capability.pack) }
          : { kind: 'disabled', label: 'Needs Source Data', reason: capability.reason },
    }
  })
}
