export type Word = {
  id: string
  text: string
  sentence: string
  datasetId: string
  grade?: string
  sourceSlideId?: string
  language?: 'mandarin' | 'english'
  tier?: 'tier-1' | 'tier-2' | 'tier-3'
  activityType?: 'dictation' | 'reading' | 'spelling'
  learningModule?: AuthoritativeLearningModuleMetadata
  audio?: {
    storagePath?: string
    contextStoragePath?: string
    voice?: string
    contextVoice?: string
    generatedAt?: string
  }
}

export type AuthoritativeLearningModuleMetadata = {
  meaning?: string
  pinyinText?: string
  pinyinSteps?: { pinyin: string; candidates: string[] }[]
  context?: { sentence: string; tokens: string[] }
}

export type DatasetSourceMetadata = {
  sourceType: 'google-slides' | 'google-sheets'
  sourceDocumentId: string
  sourceUnitId: string
  adapterId: string
}

export type DatasetVocabulary = {
  tier1: Word[]
  tier2: Word[]
  tier3: Word[]
}

export type Dataset = {
  id: string
  dateRange: string
  startDate: string
  endDate: string
  grade: string
  schoolYear: string
  description: string
  words: Word[]
  sourceDeckId?: string
  sourceSlideId?: string
  importStatus?: 'valid' | 'writing-workshop' | 'error'
  isWritingWorkshop?: boolean
  importedAt?: string
  lifecycle?: { firstAvailableAt?: string; masteredAt?: string }
  /** Source-neutral provenance for datasets created through the canonical boundary. */
  source?: DatasetSourceMetadata
  contentFingerprint?: string
  instructionalRole?: 'weekly-acquisition' | 'current-confirmation' | 'next-week-preview' | 'unassigned'
  /** All normalized source tiers. `words` remains the Tier 1 compatibility view. */
  vocabulary?: DatasetVocabulary
}
