import type { AcquisitionStrategy, AcquisitionTarget } from '../contracts.ts'

const establishedDtTargets: AcquisitionTarget[] = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '大', '小', '上', '下', '人', '水',
].map((text, index) => ({
  id: `established-dt-${index + 1}`,
  text,
  sentence: '',
  datasetId: '__established-dt__',
  language: 'mandarin',
  tier: 'tier-1',
  activityType: 'dictation',
}))

export const grade2AcquisitionStrategy = {
  id: 'grade2-acquisition-v2',
  version: 2,
  timers: {
    establishedDtSeconds: 5,
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
  establishedDtTargets,
  introductionSequence: ['established-dt', 'established-dt', 'show-copy', 'target'],
  expandedSequence: ['target', 'target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
  correctionSequence: ['show-copy', 'show-copy', 'target', 'established-dt', 'target'],
} as const satisfies AcquisitionStrategy
