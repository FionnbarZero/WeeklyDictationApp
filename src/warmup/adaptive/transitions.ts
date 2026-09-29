import {
  NEEDS_ATTENTION_RECOVERY_CORRECT,
  type AdaptiveWarmupProfile,
  type ChildMasteryState,
  type WarmupAssessment,
} from './contracts.ts'
import { adaptiveWarmupProfileErrors, profileMatchesState } from './profileValidation.ts'

export function applyAdaptiveWarmupAssessment(
  state: ChildMasteryState,
  assessment: WarmupAssessment,
  currentRotationCycle: number,
  profile: AdaptiveWarmupProfile,
): ChildMasteryState {
  if (assessment.outcome === 'skipped' || assessment.outcome === 'unanswered') return state
  if (!assessment.reviewedAt || !Number.isFinite(Date.parse(assessment.reviewedAt))) throw new Error('A completed Warmup assessment requires a valid reviewed timestamp.')
  if (!Number.isInteger(currentRotationCycle) || currentRotationCycle < 1) throw new Error('The current Mastery Rotation cycle must be a positive integer.')
  const profileErrors = adaptiveWarmupProfileErrors(profile)
  if (profileErrors.length > 0) throw new Error(`The Adaptive Warmup profile is invalid: ${profileErrors.join(' ')}`)
  if (!profileMatchesState(profile, state)) throw new Error('The Adaptive Warmup profile does not own this child mastery state.')

  const promotedRotationCycle = profile.rotationPolicy.promotedTermEligibility === 'next-cycle'
    ? currentRotationCycle + 1
    : currentRotationCycle

  if (assessment.outcome === 'incorrect') {
    return {
      ...state,
      evidence: 'support-needed',
      bucket: 'needs-attention',
      consecutiveCorrect: 0,
      lastReviewedAt: assessment.reviewedAt,
      lastIncorrectAt: assessment.reviewedAt,
      ...(state.bucket === 'mastery-rotation' ? { lastConsumedRotationCycle: currentRotationCycle } : {}),
    }
  }

  if (state.bucket === 'recent-entry') {
    const consecutiveCorrect = state.consecutiveCorrect + 1
    if (consecutiveCorrect >= profile.recentEntryPromotionCorrect) {
      return {
        ...state,
        evidence: 'demonstrated',
        bucket: 'mastery-rotation',
        consecutiveCorrect: 0,
        rotationEligibleFromCycle: promotedRotationCycle,
        lastConsumedRotationCycle: undefined,
        lastReviewedAt: assessment.reviewedAt,
      }
    }
    return { ...state, evidence: 'demonstrated', consecutiveCorrect, lastReviewedAt: assessment.reviewedAt }
  }

  if (state.bucket === 'needs-attention') {
    const consecutiveCorrect = state.consecutiveCorrect + 1
    if (consecutiveCorrect >= NEEDS_ATTENTION_RECOVERY_CORRECT) {
      return {
        ...state,
        evidence: 'demonstrated',
        bucket: 'mastery-rotation',
        consecutiveCorrect: 0,
        rotationEligibleFromCycle: promotedRotationCycle,
        lastConsumedRotationCycle: undefined,
        lastReviewedAt: assessment.reviewedAt,
      }
    }
    return { ...state, evidence: 'support-needed', consecutiveCorrect, lastReviewedAt: assessment.reviewedAt }
  }

  return {
    ...state,
    evidence: 'demonstrated',
    consecutiveCorrect: 0,
    lastReviewedAt: assessment.reviewedAt,
    lastConsumedRotationCycle: currentRotationCycle,
  }
}
