import type { AcquisitionProgressRecord, AppState, Dataset } from '../domain.ts'

type AcquisitionProgressEnvelope = NonNullable<AppState['acquisitionProgressEnvelopes']>[number]

export type DojoExperienceId = 'writing' | 'stroke-order' | 'reading'
export type DojoExperienceStatus = 'not-started' | 'in-progress' | 'completed' | 'unavailable'

export type DojoReentryExperience = {
  readonly experienceId: DojoExperienceId
  readonly status: DojoExperienceStatus
  readonly progressionId?: string
  readonly visitId?: string
  readonly updatedAt?: string
  readonly unavailableReason?: string
}

export type DojoReentryCohort = {
  readonly dataset: Dataset
  readonly experiences: readonly DojoReentryExperience[]
  readonly updatedAt: string
}

const experienceOrder: readonly DojoExperienceId[] = ['writing', 'stroke-order', 'reading']

function explicitExperience(value: unknown): DojoExperienceId | null {
  return value === 'writing' || value === 'stroke-order' || value === 'reading' ? value : null
}

/** Legacy Acquisition records predate experience identity and belong to Writing. */
export function dojoExperienceForProgress(
  progress: AcquisitionProgressRecord | AcquisitionProgressEnvelope,
): DojoExperienceId {
  const identity = progress as typeof progress & { readonly experienceId?: unknown }
  const explicit = explicitExperience(identity.experienceId)
  if (explicit) return explicit
  if ('activityModule' in progress) {
    if (progress.activityModule === 'mandarin-tier1-stroke-order') return 'stroke-order'
    if (progress.activityModule === 'mandarin-tier2-reading') return 'reading'
  }
  return 'writing'
}

function progressStatus(progress: AcquisitionProgressRecord | AcquisitionProgressEnvelope) {
  return 'contractId' in progress
    ? progress.status === 'in-progress'
      ? ('in-progress' as const)
      : ('completed' as const)
    : progress.flow.teachingComplete
      ? ('completed' as const)
      : ('in-progress' as const)
}

function newest<T extends { readonly updatedAt: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

export function dojoReentryCohorts(input: {
  readonly state: AppState
  readonly childId: string
  readonly datasets: readonly Dataset[]
  readonly activeDatasetId?: string | null
  readonly currentDateKey?: string
}): DojoReentryCohort[] {
  const eligibleDatasets = input.datasets.filter((dataset) => dataset.words.length > 0 && !dataset.isWritingWorkshop)
  const datasetsById = new Map(eligibleDatasets.map((dataset) => [dataset.id, dataset]))
  const activeStartDate = input.activeDatasetId ? datasetsById.get(input.activeDatasetId)?.startDate : undefined
  const historical = eligibleDatasets.filter(
    (dataset) =>
      dataset.id !== input.activeDatasetId &&
      (activeStartDate
        ? dataset.startDate < activeStartDate
        : input.currentDateKey
          ? dataset.endDate < input.currentDateKey
          : true),
  )
  const progressions: Array<AcquisitionProgressRecord | AcquisitionProgressEnvelope> = [
    ...input.state.acquisitionProgressions,
    ...(input.state.acquisitionProgressEnvelopes || []),
  ].filter((progress) => progress.childId === input.childId && datasetsById.has(progress.datasetId))

  return historical
    .map((dataset): DojoReentryCohort => {
      const experiences = experienceOrder.map((experienceId): DojoReentryExperience => {
        const quarantined = (input.state.acquisitionProgressQuarantine || []).find(
          (record) =>
            record.childId === input.childId &&
            record.datasetId === dataset.id &&
            (record.experienceId || 'writing') === experienceId,
        )
        if (quarantined) {
          return {
            experienceId,
            status: 'unavailable',
            unavailableReason: 'Saved progress needs review before this activity can reopen.',
          }
        }
        const matches = progressions.filter(
          (progress) => progress.datasetId === dataset.id && dojoExperienceForProgress(progress) === experienceId,
        )
        const selected =
          newest(matches.filter((progress) => progressStatus(progress) === 'in-progress')) ||
          newest(matches.filter((progress) => progressStatus(progress) === 'completed'))
        if (!selected) return { experienceId, status: 'not-started' }
        return {
          experienceId,
          status: progressStatus(selected),
          progressionId: selected.id,
          ...('visitId' in selected && selected.visitId ? { visitId: selected.visitId } : {}),
          updatedAt: selected.updatedAt,
        }
      })
      return {
        dataset,
        experiences,
        updatedAt: experiences.reduce(
          (latest, experience) =>
            experience.updatedAt && experience.updatedAt > latest ? experience.updatedAt : latest,
          '',
        ),
      }
    })
    .sort(
      (left, right) =>
        right.dataset.startDate.localeCompare(left.dataset.startDate) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.dataset.id.localeCompare(right.dataset.id),
    )
}

/** Compatibility name retained while callers move from unfinished-only to all-history behavior. */
export const unfinishedDojoReentryCohorts = dojoReentryCohorts
