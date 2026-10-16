import { acquisitionDigest } from '../../acquisition/persistence/identity.ts'
import type { Dataset } from '../../domain/contracts.ts'
import { strokeOrderGuide } from '../../familyBeta/strokeOrderSlay.ts'
import { learningModuleCohortFromDatasets } from '../../ninjaSkills/content.ts'
import { withDictationContent } from '../../ninjaSkills/dictationContent.ts'
import { withSupplementalContent } from '../../ninjaSkills/supplemental.ts'

export const WRITING_TEACHER_POLICY = 'grade2-six-step-v4' as const
// Keep the approved preview's exact pinned identity when integrating its sequence.
export const FIVE_STEP_WRITING_POLICY = 'grade2-five-step-preview-v6' as const
export const TRACE_INDEPENDENT_PREVIEW_POLICY = 'grade2-trace-independent-preview-v7' as const
export const KINDERGARTEN_WRITING_POLICY = 'kindergarten-five-step-preview-v1' as const
export const GRADE5_WRITING_POLICY = 'grade5-five-step-preview-v1' as const

import type { WritingLesson } from './contracts.ts'

export type { WritingLesson } from './contracts.ts'

export function writingPolicyGrade(policy: WritingLesson['policy']) {
  if (policy === KINDERGARTEN_WRITING_POLICY) return 'Kindergarten'
  if (policy === GRADE5_WRITING_POLICY) return 'Grade 5'
  if ([WRITING_TEACHER_POLICY, FIVE_STEP_WRITING_POLICY, TRACE_INDEPENDENT_PREVIEW_POLICY].some((p) => p === policy))
    return 'Grade 2'
  throw new Error('The writing teaching policy is unsupported. Your progress was preserved.')
}

/** Existing saved lessons retain their pinned sequence; new pilot lessons opt into five steps. */
export function writingTeacherStepCount(lesson: Pick<WritingLesson, 'policy'>) {
  if (lesson.policy === KINDERGARTEN_WRITING_POLICY || lesson.policy === GRADE5_WRITING_POLICY) return 5
  if (lesson.policy === FIVE_STEP_WRITING_POLICY || lesson.policy === TRACE_INDEPENDENT_PREVIEW_POLICY) return 5
  if (lesson.policy === WRITING_TEACHER_POLICY) return 6
  throw new Error('The writing teaching policy is unsupported. Your progress was preserved.')
}

export function writingCharacterGuides(text: string) {
  const characters = [...text]
  if (!/^[\p{Script=Han}]{1,4}$/u.test(text))
    throw new Error(`Writing target “${text}” must contain one to four Chinese characters. Nothing was skipped.`)
  return characters.map((character, index) => {
    try {
      return strokeOrderGuide({ id: `character-${index}`, text: character }).strokes
    } catch {
      throw new Error(`The stroke guide for “${character}” in “${text}” is unavailable. Nothing was skipped.`)
    }
  })
}

export function createWritingLesson(
  source: Dataset,
  policy: WritingLesson['policy'] = WRITING_TEACHER_POLICY,
): WritingLesson {
  writingTeacherStepCount({ policy })
  const grade = writingPolicyGrade(policy)
  if (source.grade !== grade || !source.words.length || source.words.length > 100)
    throw new Error(`Choose a validated ${grade} writing lesson matching its teaching policy.`)
  const dataset = JSON.parse(JSON.stringify(source)) as Dataset
  if (
    new Set(dataset.words.map((w) => w.id)).size !== dataset.words.length ||
    dataset.words.some(
      (w) =>
        w.datasetId !== dataset.id ||
        w.tier !== 'tier-1' ||
        w.activityType !== 'dictation' ||
        w.language !== 'mandarin',
    )
  )
    throw new Error('The writing lesson has invalid target identities. No progress was changed.')
  const cohort = learningModuleCohortFromDatasets(dataset.id, dataset.dateRange, [dataset])
  const supported = cohort ? withDictationContent(withSupplementalContent(cohort)) : null
  const targets = dataset.words.map((word) => {
    const metadata = supported?.terms.find((t) => t.occurrenceId === word.id)
    return {
      id: word.id,
      text: word.text,
      pinyin: metadata?.pinyinText || word.learningModule?.pinyinText || '',
      meaning: metadata?.meaning || word.learningModule?.meaning || '',
      guideFingerprint: acquisitionDigest(writingCharacterGuides(word.text)),
    }
  })
  const payload = { schema: 1 as const, policy, dataset, targets }
  return { ...payload, fingerprint: acquisitionDigest(payload) }
}

export function validateWritingLesson(lesson: WritingLesson) {
  const { fingerprint, ...payload } = lesson
  writingTeacherStepCount(lesson)
  if (lesson.schema !== 1 || fingerprint !== acquisitionDigest(payload))
    throw new Error('The saved writing lesson does not match its approved version. It was preserved.')
  const checked = createWritingLesson(lesson.dataset, lesson.policy)
  // Pinned pronunciation/meaning remain authoritative even after a catalog update.
  if (
    lesson.targets.length !== checked.targets.length ||
    lesson.targets.some(
      (t, i) =>
        t.id !== checked.targets[i].id ||
        t.text !== checked.targets[i].text ||
        t.guideFingerprint !== checked.targets[i].guideFingerprint ||
        typeof t.pinyin !== 'string' ||
        t.pinyin.length > 200 ||
        typeof t.meaning !== 'string' ||
        t.meaning.length > 500,
    )
  )
    throw new Error('The saved character guides changed or are unavailable. Your progress was preserved.')
}
