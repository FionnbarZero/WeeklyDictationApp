import type {
  AcquisitionAssessment,
  AcquisitionTarget,
  AcquisitionTargetSet,
  EngineAcquisitionFlow,
} from '../acquisition/contracts.ts'
import { revealAcquisition, startAcquisition } from '../acquisition/engine.ts'
import { transitionAcquisition } from '../acquisition/transition.ts'
import type { WeeklyDatasetCandidate } from '../curriculum/model.ts'
import { grade5WritingLabProfile } from './practiceProfile.ts'

export type Grade5LabRevealMethod = 'timer' | 'skip_timer'

export type Grade5AcquisitionTarget = AcquisitionTarget & {
  grade: 'Grade 5'
  sourceUnitId: string
  sourcePosition: number
}

export type Grade5AcquisitionLabState = {
  cohortId: string
  // The flow also contains generic Familiar-DT seed targets, so its shared
  // engine type cannot require source-only Grade 5 provenance on every target.
  targetSet: AcquisitionTargetSet<AcquisitionTarget>
  flow: EngineAcquisitionFlow<AcquisitionTarget>
  assessments: AcquisitionAssessment<AcquisitionTarget, Grade5LabRevealMethod>[]
}

export function grade5AcquisitionTargetSet(candidate: WeeklyDatasetCandidate): AcquisitionTargetSet<AcquisitionTarget> {
  if (candidate.grade !== 'Grade 5' || candidate.status !== 'valid' || !candidate.datasetId) {
    throw new Error('Grade 5 Acquisition requires one valid canonical Grade 5 cohort.')
  }
  if (candidate.tier1.length === 0 || candidate.tier1.some((word) => !word.targetOccurrenceId)) {
    throw new Error('Grade 5 Acquisition requires canonical Tier 1 target occurrences.')
  }
  return {
    id: candidate.datasetId,
    targets: candidate.tier1.map((word) => ({
      id: word.targetOccurrenceId!,
      text: word.text,
      sentence: '',
      datasetId: candidate.datasetId!,
      grade: 'Grade 5',
      sourceUnitId: candidate.source.sourceUnitId,
      sourcePosition: word.sourcePosition,
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
    })),
  }
}

export function startGrade5AcquisitionLab(candidate: WeeklyDatasetCandidate, random = Math.random): Grade5AcquisitionLabState {
  const targetSet = grade5AcquisitionTargetSet(candidate)
  return {
    cohortId: targetSet.id,
    targetSet,
    flow: startAcquisition(targetSet, grade5WritingLabProfile.acquisition, random),
    assessments: [],
  }
}

export function revealGrade5AcquisitionLab(state: Grade5AcquisitionLabState): Grade5AcquisitionLabState {
  return { ...state, flow: revealAcquisition(state.flow) }
}

export function answerGrade5AcquisitionLab(
  state: Grade5AcquisitionLabState,
  correct: boolean,
  revealMethod: Grade5LabRevealMethod,
  random = Math.random,
): Grade5AcquisitionLabState {
  const transition = transitionAcquisition(
    state.flow,
    state.targetSet,
    grade5WritingLabProfile.acquisition,
    { correct, revealMethod },
    random,
  )
  return {
    ...state,
    flow: transition.nextFlow,
    assessments: transition.assessment
      ? [...state.assessments, transition.assessment]
      : state.assessments,
  }
}
