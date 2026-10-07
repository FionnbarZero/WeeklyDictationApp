import type { AppState, Dataset } from '../domain.ts'
import { candidateContentFingerprint } from './identity.ts'

/** Revisions are immutable editions, not replacements for an existing word ID. */
export function grade2DatasetFingerprint(dataset: Dataset) {
  const occurrences = (words: Dataset['words']) =>
    words.map((word, index) => ({ text: word.text, sourcePosition: index + 1, targetOccurrenceId: word.id }))
  return candidateContentFingerprint({
    grade: dataset.grade,
    schoolYear: dataset.schoolYear,
    assignedWeek: { startDate: dataset.startDate, endDate: dataset.endDate },
    tier1: occurrences(dataset.words),
    tier2: occurrences(dataset.vocabulary?.tier2 || []),
    tier3: occurrences(dataset.vocabulary?.tier3 || []),
  })
}

export function originalDatasetId(dataset: Dataset) {
  return dataset.curriculumRevision?.originalDatasetId || dataset.id
}

function remap(dataset: Dataset, id: string): Dataset {
  const word = (value: Dataset['words'][number]) => ({
    ...value,
    id: id + value.id.slice(dataset.id.length),
    datasetId: id,
  })
  return {
    ...dataset,
    id,
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
}

export function originalGrade2Dataset(dataset: Dataset): Dataset {
  if (!dataset.curriculumRevision) return dataset
  const { curriculumRevision: _revision, ...original } = remap(dataset, dataset.curriculumRevision.originalDatasetId)
  return original
}

export function revisedGrade2Dataset(dataset: Dataset): Dataset {
  if (dataset.grade !== 'Grade 2' || dataset.curriculumRevision)
    throw new Error('Only a validated original Grade 2 dataset can become a revision.')
  const fingerprint = grade2DatasetFingerprint(dataset)
  return {
    ...remap(dataset, `${dataset.id}__rev_${fingerprint.slice(-16)}`),
    curriculumRevision: { originalDatasetId: dataset.id, fingerprint },
  }
}

export function validGrade2Revision(dataset: Dataset) {
  const revision = dataset.curriculumRevision
  return (
    !!revision &&
    dataset.grade === 'Grade 2' &&
    typeof revision.originalDatasetId === 'string' &&
    !revision.originalDatasetId.includes('__rev_') &&
    revision.fingerprint === grade2DatasetFingerprint(dataset) &&
    dataset.id === `${revision.originalDatasetId}__rev_${revision.fingerprint.slice(-16)}`
  )
}

/** Validated source content selects an edition; fetch order never chooses a winner. */
export function retainGrade2Editions(state: AppState, incoming: readonly Dataset[]): AppState {
  const datasets = [...state.datasets]
  for (const candidate of incoming) {
    const original = datasets.find((dataset) => dataset.id === candidate.id)
    if (!original) {
      datasets.push(candidate)
      continue
    }
    if (grade2DatasetFingerprint(original) === grade2DatasetFingerprint(candidate)) continue
    const edition = revisedGrade2Dataset(candidate)
    const existing = datasets.find((dataset) => dataset.id === edition.id)
    if (existing && grade2DatasetFingerprint(existing) !== grade2DatasetFingerprint(edition))
      throw new Error('A curriculum revision conflicts with retained lessons. Nothing was overwritten.')
    if (!existing) datasets.push(edition)
  }
  return { ...state, datasets }
}

export function sourceGrade2Datasets(state: AppState, incoming: readonly Dataset[]) {
  return incoming
    .map((candidate) =>
      state.datasets.find(
        (dataset) =>
          originalDatasetId(dataset) === candidate.id &&
          grade2DatasetFingerprint(dataset) === grade2DatasetFingerprint(candidate),
      ),
    )
    .filter((dataset): dataset is Dataset => !!dataset)
}
