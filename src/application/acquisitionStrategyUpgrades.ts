import type { AcquisitionStrategy, AcquisitionTarget } from '../acquisition/contracts.ts'
import { restartCurrentAcquisitionIntroduction } from '../acquisition/engine.ts'
import type { AcquisitionStrategyUpgrade } from '../acquisition/persistence/contracts.ts'
import { acquisitionStrategyFingerprint } from '../acquisition/persistence/identity.ts'
import { grade2AcquisitionStrategy } from '../acquisition/strategies/grade2.ts'
import { kindergartenAcquisitionStrategy } from '../acquisition/strategies/kindergarten.ts'

const tenPositionExpandedSequence = [
  'target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target',
] as const

const grade2AcquisitionV3 = {
  ...grade2AcquisitionStrategy,
  id: 'grade2-acquisition-v3',
  version: 3,
  expandedSequence: tenPositionExpandedSequence,
} as const satisfies AcquisitionStrategy

const kindergartenAcquisitionV1 = {
  ...kindergartenAcquisitionStrategy,
  id: 'kindergarten-acquisition-v1',
  version: 1,
  expandedSequence: tenPositionExpandedSequence,
} as const satisfies AcquisitionStrategy

function restoreElevenPositionSequence<TTarget extends AcquisitionTarget>(
  id: string,
  previous: AcquisitionStrategy<TTarget>,
  current: AcquisitionStrategy<TTarget>,
): AcquisitionStrategyUpgrade<TTarget> {
  return {
    id,
    fromStrategyId: previous.id,
    fromStrategyVersion: previous.version,
    fromStrategyFingerprint: acquisitionStrategyFingerprint(previous),
    toStrategyId: current.id,
    toStrategyVersion: current.version,
    upgrade: (flow) => {
      const currentIdentity = {
        ...flow,
        strategyId: current.id,
        strategyVersion: current.version,
      }

      // Introduction itself did not change. Finished teaching and open-ended
      // DT practice also have no ambiguous sequence cursor to reinterpret.
      if (flow.phase === 'introduction' || flow.teachingComplete || flow.mode === 'dt-practice') {
        return currentIdentity
      }

      // The restored second target shifts every later Expanded Trials cursor.
      // Restarting only this target's Introduction is safer than guessing which
      // of the five required target presentations the child has completed.
      return restartCurrentAcquisitionIntroduction(currentIdentity, current, () => 0)
    },
  }
}

const grade2V3ToV4 = restoreElevenPositionSequence(
  'grade2-acquisition-v3-to-v4-restore-five-target-trials',
  grade2AcquisitionV3,
  grade2AcquisitionStrategy,
)

const kindergartenV1ToV2 = restoreElevenPositionSequence(
  'kindergarten-acquisition-v1-to-v2-restore-five-target-trials',
  kindergartenAcquisitionV1,
  kindergartenAcquisitionStrategy,
)

export function acquisitionStrategyUpgradesFor(strategy: AcquisitionStrategy) {
  if (strategy.id === grade2AcquisitionStrategy.id) return [grade2V3ToV4]
  if (strategy.id === kindergartenAcquisitionStrategy.id) return [kindergartenV1ToV2]
  return []
}

export const legacyAcquisitionStrategiesForTest = {
  grade2V3: grade2AcquisitionV3,
  kindergartenV1: kindergartenAcquisitionV1,
} as const
