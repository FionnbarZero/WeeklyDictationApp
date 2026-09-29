import type {
  AcquisitionAssessment,
  AcquisitionTarget,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
} from '../acquisition/contracts.ts'
import { revealAcquisition, startAcquisition } from '../acquisition/engine.ts'
import { transitionAcquisition } from '../acquisition/transition.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import type { Dataset } from '../domain/contracts.ts'
import { kindergartenWritingLabProfile } from './practiceProfile.ts'

export type KindergartenLabRevealMethod = 'timer' | 'skip_timer'

export type KindergartenAcquisitionTarget = AcquisitionTarget & {
  grade: 'Kindergarten'
  sourceUnitId: string
  sourcePosition: number
}

export type KindergartenAcquisitionLabState = {
  cohortId: string
  targetSet: AcquisitionTargetSet<AcquisitionTarget>
  flow: EngineAcquisitionFlow<AcquisitionTarget>
  assessments: AcquisitionAssessment<AcquisitionTarget, KindergartenLabRevealMethod>[]
}

export function kindergartenCandidateIsUsableInLab(candidate: WeeklyDatasetCandidate) {
  const blockers = candidate.validationOutcomes
    .filter((outcome) => outcome.severity === 'error')
    .map((outcome) => outcome.code)
  return candidate.grade === 'Kindergarten'
    && candidate.source.sourceType === 'google-sheets'
    && candidate.source.adapterId === 'kindergarten-google-sheets-v1'
    && Boolean(candidate.datasetId && candidate.assignedWeek)
    && candidate.tier1.length > 0
    && candidate.tier1.every((target) => Boolean(target.targetOccurrenceId))
    && candidate.status === 'valid'
    && blockers.length === 0
}

function ephemeralDatasetId(candidate: WeeklyDatasetCandidate) {
  return `__kindergarten-lab__${candidate.datasetId}`
}

export function kindergartenAcquisitionTargetSet(candidate: WeeklyDatasetCandidate): AcquisitionTargetSet<AcquisitionTarget> {
  if (!kindergartenCandidateIsUsableInLab(candidate)) {
    throw new Error('Kindergarten Acquisition lab requires one canonical inspected vocabulary tab from the registered Sheets profile.')
  }
  const datasetId = ephemeralDatasetId(candidate)
  return {
    id: datasetId,
    targets: candidate.tier1.map((word) => ({
      id: `__kindergarten-lab__${word.targetOccurrenceId}`,
      text: word.text,
      sentence: '',
      datasetId,
      grade: 'Kindergarten',
      sourceUnitId: candidate.source.sourceUnitId,
      sourcePosition: word.sourcePosition,
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    })),
  }
}

export function kindergartenWritingDatasetForLab(candidate: WeeklyDatasetCandidate): Dataset {
  const targetSet = kindergartenAcquisitionTargetSet(candidate)
  return {
    id: targetSet.id,
    dateRange: candidate.dateRangeLabel || 'Fixture week',
    startDate: candidate.normalizedStartDate!,
    endDate: candidate.normalizedEndDate!,
    grade: 'Kindergarten',
    schoolYear: candidate.schoolYear,
    description: `Development-only Kindergarten Tier 1 writing fixture from source tab ${candidate.source.sourceUnitId}`,
    importStatus: 'valid',
    words: targetSet.targets.map((target) => ({ ...target, grade: 'Kindergarten' })),
  }
}

export function startKindergartenAcquisitionLab(candidate: WeeklyDatasetCandidate, random = Math.random): KindergartenAcquisitionLabState {
  const targetSet = kindergartenAcquisitionTargetSet(candidate)
  return {
    cohortId: targetSet.id,
    targetSet,
    flow: startAcquisition(targetSet, kindergartenWritingLabProfile.acquisition, random),
    assessments: [],
  }
}

export function revealKindergartenAcquisitionLab(state: KindergartenAcquisitionLabState): KindergartenAcquisitionLabState {
  return { ...state, flow: revealAcquisition(state.flow) }
}

export function answerKindergartenAcquisitionLab(
  state: KindergartenAcquisitionLabState,
  correct: boolean,
  revealMethod: KindergartenLabRevealMethod,
  random = Math.random,
): KindergartenAcquisitionLabState {
  const transition = transitionAcquisition(
    state.flow,
    state.targetSet,
    kindergartenWritingLabProfile.acquisition,
    { correct, revealMethod },
    random,
  )
  return {
    ...state,
    flow: transition.nextFlow,
    assessments: transition.assessment ? [...state.assessments, transition.assessment] : state.assessments,
  }
}
