import type {
  AcquisitionCorrectionPolicy,
  AcquisitionSequenceToken,
  AcquisitionStrategy,
  AcquisitionTarget,
} from '../acquisition/contracts.ts'
import type { Tier2ReadingTarget } from './contracts.ts'

type ReadingStrategyOptions = {
  readonly id: string
  readonly familiarDatasetId: string
  readonly familiarTargetIdPrefix: string
  readonly pattern: AcquisitionStrategy
  readonly version?: number
  readonly expandedSequence?: readonly AcquisitionSequenceToken[]
  readonly correctionPolicy?: AcquisitionCorrectionPolicy
}

function readingFamiliarTargets(options: ReadingStrategyOptions): Tier2ReadingTarget[] {
  return options.pattern.familiarDtTargets.map((target, index) => ({
    id: `${options.familiarTargetIdPrefix}-${index + 1}`,
    text: target.text,
    sentence: target.sentence,
    datasetId: options.familiarDatasetId,
    language: 'mandarin',
    tier: 'tier-2',
    activityType: 'reading',
  }))
}

/**
 * Tier 2 deliberately follows the same teaching pattern as the grade's Tier 1
 * Acquisition strategy while owning separate reading targets and identity.
 * Bumping the grade-owned pattern version also bumps the mirrored reading
 * strategy version, preventing a silent reinterpretation of saved progress.
 */
export function acquisitionStrategyForTier2Reading(
  options: ReadingStrategyOptions,
): AcquisitionStrategy<Tier2ReadingTarget> {
  const correctionPolicy = options.correctionPolicy || options.pattern.correctionPolicy
  return {
    id: options.id,
    version: options.version ?? options.pattern.version,
    timers: { ...options.pattern.timers },
    dtObservationMode: options.pattern.dtObservationMode,
    ...(correctionPolicy ? { correctionPolicy } : {}),
    familiarDtTargets: readingFamiliarTargets(options),
    introductionSequence: [...options.pattern.introductionSequence],
    expandedSequence: [...(options.expandedSequence || options.pattern.expandedSequence)],
    correctionSequence: [...options.pattern.correctionSequence],
  }
}

export function isTier2ReadingTarget(target: AcquisitionTarget): target is Tier2ReadingTarget {
  return target.language === 'mandarin' && target.tier === 'tier-2' && target.activityType === 'reading'
}
