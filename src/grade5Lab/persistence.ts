import type { PracticeSession } from '../domain.ts'
import type { Grade5AcquisitionLabState, Grade5LabRevealMethod } from './acquisitionLab.ts'
import type { Grade5ActivityLaunchRequest } from './learningHub.ts'

export const GRADE5_LAB_STORAGE_KEY = 'weekly-dictation-grade5-progress-v1'
export const GRADE5_LAB_PROGRESS_SCHEMA = 'weekly-dictation-grade5-progress-v1' as const

export type Grade5LabAnswerResult = {
  wordId: string
  correct: boolean
  phase: 'warmup' | 'primary'
}

export type Grade5LabResult = {
  id: string
  channel: Grade5ActivityLaunchRequest['learningChannel']
  activityKind: Grade5ActivityLaunchRequest['activityKind']
  stage: Grade5ActivityLaunchRequest['stage']
  cohortId: string | null
  reviewCycle?: 1 | 2
  correct: number
  total: number
  answers: Grade5LabAnswerResult[]
  completedAt: string
}

export type Grade5SavedWritingRun = {
  requestKey: string
  request: Grade5ActivityLaunchRequest
  session: PracticeSession
  acquisition: Grade5AcquisitionLabState | null
  currentRevealMethod: Grade5LabRevealMethod
  updatedAt: string
}

export type Grade5LabProgress = {
  schema: typeof GRADE5_LAB_PROGRESS_SCHEMA
  activeWriting?: Grade5SavedWritingRun
  results: Grade5LabResult[]
}

export function grade5RequestKey(request: Grade5ActivityLaunchRequest) {
  return [
    request.learningChannel,
    request.activityKind,
    request.stage,
    request.cohortId || request.eligibleCohortIds.join(','),
  ].join(':')
}

export function emptyGrade5LabProgress(): Grade5LabProgress {
  return { schema: GRADE5_LAB_PROGRESS_SCHEMA, results: [] }
}

export function readGrade5LabProgress(storage: Storage): Grade5LabProgress {
  try {
    const value: unknown = JSON.parse(storage.getItem(GRADE5_LAB_STORAGE_KEY) || 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyGrade5LabProgress()
    const record = value as Record<string, unknown>
    if (record.schema !== GRADE5_LAB_PROGRESS_SCHEMA || !Array.isArray(record.results)) {
      return emptyGrade5LabProgress()
    }
    return value as Grade5LabProgress
  } catch {
    return emptyGrade5LabProgress()
  }
}

export function writeGrade5LabProgress(storage: Storage, progress: Grade5LabProgress) {
  try {
    storage.setItem(GRADE5_LAB_STORAGE_KEY, JSON.stringify(progress))
    return true
  } catch {
    return false
  }
}

export function saveGrade5WritingRun(
  progress: Grade5LabProgress,
  request: Grade5ActivityLaunchRequest,
  session: PracticeSession,
  acquisition: Grade5AcquisitionLabState | null,
  currentRevealMethod: Grade5LabRevealMethod,
  updatedAt = new Date().toISOString(),
): Grade5LabProgress {
  return {
    ...progress,
    activeWriting: {
      requestKey: grade5RequestKey(request),
      request,
      session,
      acquisition,
      currentRevealMethod,
      updatedAt,
    },
  }
}

export function appendGrade5LabResult(progress: Grade5LabProgress, result: Grade5LabResult): Grade5LabProgress {
  return {
    ...progress,
    ...(result.channel === 'tier-1-writing' ? { activeWriting: undefined } : {}),
    results: [...progress.results.filter((item) => item.id !== result.id), result],
  }
}
