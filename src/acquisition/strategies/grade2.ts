import type { AcquisitionStrategy, AcquisitionTarget } from '../contracts.ts'

const familiarDtTargets: AcquisitionTarget[] = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '大', '小', '上', '下', '人', '水',
].map((text, index) => ({
  id: `familiar-dt-${index + 1}`,
  text,
  sentence: '',
  datasetId: '__familiar-dt__',
  language: 'mandarin',
  tier: 'tier-1',
  activityType: 'dictation',
}))

export const grade2AcquisitionStrategyV3 = {
  id: 'grade2-acquisition-v3',
  version: 3,
  timers: {
    familiarDtSeconds: 5,
    earnedDtSeconds: 5,
    introductionShowCopySeconds: 10,
    introductionHiddenTargetSeconds: 10,
    expandedStartSeconds: 10,
    expandedMinimumSeconds: 5,
    expandedDecrementSeconds: 1,
    correctionShowCopySeconds: 10,
    correctionHiddenSeconds: 10,
  },
  dtObservationMode: 'collect',
  familiarDtTargets,
  introductionSequence: ['familiar-dt', 'familiar-dt', 'show-copy', 'target'],
  expandedSequence: ['target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
  correctionSequence: ['show-copy', 'show-copy', 'show-copy', 'target', 'familiar-dt', 'target'],
} as const satisfies AcquisitionStrategy

export const grade2AcquisitionStrategy = {
  id: 'grade2-acquisition-v4',
  version: 4,
  timers: {
    familiarDtSeconds: 10,
    earnedDtSeconds: 10,
    introductionShowCopySeconds: 20,
    introductionHiddenTargetSeconds: 20,
    expandedStartSeconds: 20,
    expandedMinimumSeconds: 10,
    expandedDecrementSeconds: 10,
    correctionShowCopySeconds: 20,
    correctionHiddenSeconds: 20,
  },
  dtObservationMode: 'collect',
  familiarDtTargets,
  introductionSequence: ['familiar-dt', 'familiar-dt', 'show-copy', 'target'],
  expandedSequence: ['target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
  correctionSequence: ['show-copy', 'show-copy', 'show-copy', 'target', 'familiar-dt', 'target'],
} as const satisfies AcquisitionStrategy
