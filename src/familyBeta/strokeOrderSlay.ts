import type { AcquisitionStrategy, AcquisitionTarget } from '../acquisition/contracts.ts'
import { grade2AcquisitionStrategy } from '../acquisition/strategies/grade2.ts'
import { grade5AcquisitionStrategy } from '../acquisition/strategies/grade5.ts'
import { kindergartenAcquisitionStrategy } from '../acquisition/strategies/kindergarten.ts'
import { schoolYearToken } from '../curriculum/identity.ts'
import type { Dataset } from '../domain/contracts.ts'
import { grade2StrokeMedians } from '../learningGames/strokeOrder/grade2StrokeAssets.ts'
import { buildStrokeOrderRounds, strokeAssetIsAvailable } from '../learningGames/strokeOrder/rounds.ts'
import { GAME_POLICIES } from '../ninjaSkills/policy.ts'

export const STROKE_ORDER_MODULE = 'stroke-order-slay'
export const STROKE_ORDER_TITLE = 'Stroke Order Slay'
const strategies: Record<string, AcquisitionStrategy> = {
  Kindergarten: kindergartenAcquisitionStrategy,
  'Grade 2': grade2AcquisitionStrategy,
  'Grade 5': grade5AcquisitionStrategy,
}
export function strokeOrderGuide(target: Pick<AcquisitionTarget, 'id' | 'text'>) {
  const guide = supported(target.text) ? buildStrokeOrderRounds([target], grade2StrokeMedians).rounds[0] : undefined
  if (!guide) throw new Error('This saved target has no validated stroke guide. Your progress is preserved.')
  return guide
}

function supported(text: string) {
  // The shared writing pad has six lanes. Never silently crop a longer source.
  return [...text].length <= 6 && strokeAssetIsAvailable(text, grade2StrokeMedians)
}

/** Current writing cohort only. Every eligible supported target is included in
 * teacher order: no sampling can silently skip a supported word. */
export function strokeOrderLesson(datasets: readonly Dataset[]) {
  if (datasets.length !== 1) throw new Error('Stroke Order Slay needs one current writing cohort.')
  const dataset = datasets[0]
  const strategy = strategies[dataset.grade]
  const words = dataset.vocabulary?.tier1 || dataset.words
  if (
    !strategy ||
    schoolYearToken(dataset.schoolYear) !== '2026-27' ||
    !words.length ||
    words.some(
      (word) =>
        word.datasetId !== dataset.id ||
        word.tier !== GAME_POLICIES[STROKE_ORDER_MODULE].tiers[0] ||
        word.activityType !== 'dictation' ||
        word.language !== 'mandarin',
    ) ||
    new Set(words.map((w) => w.id)).size !== words.length
  )
    throw new Error('This cohort has no validated Tier 1 writing targets for Stroke Order Slay.')
  const targets = words.filter((word) => supported(word.text))
  if (!targets.length || strategy.familiarDtTargets.some((word) => !supported(word.text)))
    throw new Error('Stroke guides are not ready for this cohort. Ordinary writing is still available.')
  return {
    strategy,
    targetSet: { id: dataset.id, targets },
    total: words.length,
    unsupported: words.filter((word) => !targets.includes(word)).map((word) => word.text),
  }
}
