import type { AcquisitionStrategy, AcquisitionTarget } from '../contracts.ts'

const kindergartenFamiliarDtTargets: AcquisitionTarget[] = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '大', '小', '上', '下', '人', '水',
].map((text, index) => ({
  id: `kindergarten-familiar-dt-${index + 1}`,
  text,
  sentence: '',
  datasetId: '__kindergarten-familiar-dt__',
  language: 'mandarin',
  tier: 'tier-1',
  activityType: 'dictation',
}))

// Kindergarten deliberately owns this definition. Its current values match the
// approved Acquisition v3 teaching behavior, but no Grade 2 object is imported
// or shared, so a later Grade 2 calibration cannot silently change Kindergarten.
export const kindergartenAcquisitionStrategy = {
  id: 'kindergarten-acquisition-v1',
  version: 1,
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
  familiarDtTargets: kindergartenFamiliarDtTargets,
  introductionSequence: ['familiar-dt', 'familiar-dt', 'show-copy', 'target'],
  expandedSequence: ['target', 'dt', 'target', 'dt', 'dt', 'target', 'dt', 'dt', 'dt', 'target'],
  correctionSequence: ['show-copy', 'show-copy', 'show-copy', 'target', 'familiar-dt', 'target'],
} as const satisfies AcquisitionStrategy
