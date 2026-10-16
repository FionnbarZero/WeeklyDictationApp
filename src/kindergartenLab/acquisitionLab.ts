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
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import { datasetFromCanonicalCandidate } from '../curriculum/datasetProjection.ts'
import { kindergartenDictationContextCatalog } from '../curriculum/kindergartenDictationContextCatalog.ts'
import type { DictationContextCatalog } from '../curriculum/contextCatalog.ts'

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

export function kindergartenCandidateHasValidSource(candidate: WeeklyDatasetCandidate) {
  const blockers = candidate.validationOutcomes
    .filter((outcome) => outcome.severity === 'error')
    .map((outcome) => outcome.code)
  return candidate.grade === 'Kindergarten'
    && candidate.source.sourceType === 'google-sheets'
    && candidate.source.adapterId === 'kindergarten-google-sheets-v1'
    && Boolean(candidate.datasetId && candidate.assignedWeek)
    && candidate.status === 'valid'
    && blockers.length === 0
}

export function kindergartenWritingUnavailableReason(candidate: WeeklyDatasetCandidate) {
  if (!kindergartenCandidateHasValidSource(candidate) || !candidate.tier1.length
    || candidate.tier1.some((target) => !target.targetOccurrenceId))
    return 'This week’s Kindergarten writing lesson is unavailable. Please report this problem; your progress is preserved.'
  const missing = candidate.tier1.filter((target) => !kindergartenAudioForText(target.text)?.storagePath)
  return missing.length
    ? `Writing audio is not ready for ${missing.map((target) => target.text).join('、')}. Please report this problem; no words or progress were skipped.`
    : null
}

export function kindergartenCandidateIsUsableInLab(candidate: WeeklyDatasetCandidate) {
  return kindergartenWritingUnavailableReason(candidate) === null
}

function ephemeralDatasetId(candidate: WeeklyDatasetCandidate) {
  return `__kindergarten-lab__${candidate.datasetId}`
}

export function kindergartenAcquisitionTargetSet(
  candidate: WeeklyDatasetCandidate,
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): AcquisitionTargetSet<AcquisitionTarget> {
  const unavailable = kindergartenWritingUnavailableReason(candidate)
  if (unavailable) throw new Error(unavailable)
  const datasetId = ephemeralDatasetId(candidate)
  const projected = datasetFromCanonicalCandidate(candidate, contextCatalog)
  return {
    id: datasetId,
    targets: projected.vocabulary!.tier1.map((word, index) => ({
      id: `__kindergarten-lab__${word.id}`,
      text: word.text,
      sentence: word.sentence,
      datasetId,
      grade: 'Kindergarten',
      sourceUnitId: candidate.source.sourceUnitId,
      sourcePosition: candidate.tier1[index].sourcePosition,
      language: 'mandarin',
      tier: 'tier-1',
      activityType: 'dictation',
      audio: kindergartenAudioForText(word.text),
    })),
  }
}

export function kindergartenWritingDatasetForLab(
  candidate: WeeklyDatasetCandidate,
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): Dataset {
  const targetSet = kindergartenAcquisitionTargetSet(candidate, contextCatalog)
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

export function startKindergartenAcquisitionLab(
  candidate: WeeklyDatasetCandidate,
  random = Math.random,
  contextCatalog: DictationContextCatalog = kindergartenDictationContextCatalog,
): KindergartenAcquisitionLabState {
  const targetSet = kindergartenAcquisitionTargetSet(candidate, contextCatalog)
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
