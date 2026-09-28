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
  audio?: { storagePath?: string; voice?: string; generatedAt?: string }
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
}
