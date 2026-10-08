import type { AcquisitionAssessment, AcquisitionTarget } from '../acquisition/contracts.ts'
import { startAcquisition } from '../acquisition/engine.ts'
import type {
  AcquisitionPersistenceContext,
  AcquisitionProgressEnvelope,
} from '../acquisition/persistence/contracts.ts'
import { acquisitionDigest, acquisitionProgressionId } from '../acquisition/persistence/identity.ts'
import { createAcquisitionProgressEnvelope } from '../acquisition/persistence/migration.ts'
import {
  applyAcquisitionCheckpoint,
  buildAcquisitionCheckpoint,
  buildAcquisitionResumeCheckpoint,
} from '../acquisition/persistence/reducer.ts'
import { validateAcquisitionProgressEnvelope } from '../acquisition/persistence/validation.ts'
import { pinAcquisitionLesson, resolveAcquisitionLesson } from '../acquisition/persistence/lessonSnapshot.ts'
import { currentAcquisitionContext, isAcquisitionRetired } from './acquisitionRetirement.ts'
import { validWriter } from './deviceWriter.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
export type SavedAcquisition<T extends AcquisitionTarget, R extends string> = {
  schema: 1
  sessionId: string
  writerId?: string
  envelope: AcquisitionProgressEnvelope<T>
  assessments: AcquisitionAssessment<T, R>[]
  reviewedTrials: { sessionId: string; reviewedAt: string; assessment: AcquisitionAssessment<T, R> }[]
}

// One atomic browser record holds the next prompt AND the reviewed responses.
// Audio, handwriting images, credentials and provisional answers never enter it.
export function openAcquisitionStore<T extends AcquisitionTarget, R extends string>(
  storage: Store,
  latestContext: AcquisitionPersistenceContext<T>,
  options: { random?: () => number; now?: () => string; uuid?: () => string; writerId?: string } = {},
) {
  if (options.writerId !== undefined && !validWriter(options.writerId)) throw new Error('Invalid practice writer identity.')
  latestContext = currentAcquisitionContext(storage, latestContext)
  const random = options.random || Math.random
  const now = options.now || (() => new Date().toISOString())
  const uuid = options.uuid || (() => crypto.randomUUID())
  const key = `family-beta-acquisition-v1:${acquisitionProgressionId(latestContext.identity)}`
  let context = latestContext
  let raw = storage.getItem(key)
  let current: SavedAcquisition<T, R>

  function validate(value: unknown, validationContext = context): SavedAcquisition<T, R> {
    const saved = value as SavedAcquisition<T, R> | null
    if (
      !saved ||
      saved.schema !== 1 ||
      typeof saved.sessionId !== 'string' ||
      !/^[\w-]{1,160}$/.test(saved.sessionId) ||
      ('writerId' in saved && !validWriter(saved.writerId)) ||
      !Array.isArray(saved.assessments) ||
      !Array.isArray(saved.reviewedTrials) ||
      !validateAcquisitionProgressEnvelope(saved.envelope, validationContext).valid ||
      saved.assessments.some(
        (a) =>
          !a ||
          typeof a.correct !== 'boolean' ||
          typeof a.countsTowardWeeklyScore !== 'boolean' ||
          typeof a.promptId !== 'string' ||
          typeof a.revealMethod !== 'string' ||
          !a.target ||
          typeof a.target.id !== 'string',
      )
    ) {
      throw new Error(
        'Saved acquisition does not match this curriculum or teaching sequence. Nothing was erased. Please report this problem.',
      )
    }
    return saved
  }

  function assertActive() {
    if (isAcquisitionRetired(storage, context.identity))
      throw new Error('This attempt was discarded. Its reviewed history is preserved; reopen the lesson to start again.')
  }

  function commit(next: SavedAcquisition<T, R>, nextContext = context) {
    assertActive()
    if (storage.getItem(key) !== raw)
      throw new Error(
        'This activity changed in another tab. Reload to resume the saved response; nothing was overwritten.',
      )
    const resolvedContext = resolveAcquisitionLesson(next.envelope, nextContext)
    const encoded = JSON.stringify(validate(next, resolvedContext))
    storage.setItem(key, encoded)
    if (storage.getItem(key) !== encoded)
      throw new Error('Saving could not be confirmed. Keep this activity open and retry.')
    raw = encoded
    current = next
    context = resolvedContext
    return current
  }

  function fresh(nextContext: AcquisitionPersistenceContext<T>): SavedAcquisition<T, R> {
    return {
      schema: 1, sessionId: uuid(),
      ...(options.writerId ? { writerId: options.writerId } : {}),
      envelope: pinAcquisitionLesson(createAcquisitionProgressEnvelope(nextContext,
        startAcquisition(nextContext.targetSet, nextContext.strategy, random), now()), nextContext),
      assessments: [], reviewedTrials: [],
    }
  }

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.envelope && typeof parsed.envelope === 'object') context = resolveAcquisitionLesson(parsed.envelope, latestContext)
      current = validate(parsed)
      if (!current.envelope.lessonSnapshot) commit({ ...current, envelope: pinAcquisitionLesson(current.envelope, context) })
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error('Saved acquisition could not be read. Nothing was erased. Please report this problem.')
      throw error
    }
  } else {
    commit(fresh(context))
  }

  return {
    key,
    assertActive,
    get context() { return context },
    get current() {
      return current
    },
    answer(correct: boolean, revealMethod: R) {
      // Reading/resuming never forks. The first successfully reviewed answer
      // from a different installation claims its own score identity atomically
      // with that checkpoint. Inherited teaching progress remains unchanged.
      const sessionId = options.writerId && current.writerId !== options.writerId ? uuid() : current.sessionId
      const checkpoint = buildAcquisitionCheckpoint({
        envelope: current.envelope,
        context,
        answeredPromptId: current.envelope.flow.prompt?.id || '',
        sessionId,
        occurredAt: now(),
        response: { correct, revealMethod },
        random,
      })
      const applied = applyAcquisitionCheckpoint(current.envelope, checkpoint, context)
      if (applied.status === 'conflict') throw new Error(applied.reason)
      return commit({
        ...current,
        sessionId,
        ...(options.writerId ? { writerId: options.writerId } : {}),
        envelope: applied.envelope,
        reviewedTrials: checkpoint.assessment
          ? [
              ...current.reviewedTrials,
              {
                sessionId,
                reviewedAt: checkpoint.occurredAt,
                assessment: checkpoint.assessment as AcquisitionAssessment<T, R>,
              },
            ]
          : current.reviewedTrials,
        assessments: checkpoint.assessment
          ? [...current.assessments, checkpoint.assessment as AcquisitionAssessment<T, R>]
          : current.assessments,
      })
    },
    // Call only after the immutable completed result is confirmed. The teaching
    // checkpoint remains across partial score sessions. Changed lessons replace
    // it only after teaching completion, with the previous record archived first.
    finishSession() {
      const lessonChanged = acquisitionDigest({ targetSet: context.targetSet, strategy: context.strategy })
        !== acquisitionDigest({ targetSet: latestContext.targetSet, strategy: latestContext.strategy })
      if (current.envelope.flow.teachingComplete && lessonChanged) {
        // Archive first, read back, then replace the active record with the same
        // compare-and-swap guard used for answers. A retry may find this archive.
        const next = fresh(latestContext)
        if (storage.getItem(key) !== raw) throw new Error('This activity changed in another tab. Nothing was overwritten.')
        const archiveKey = `${key}:completed:${acquisitionDigest({ sessionId: current.sessionId, envelope: current.envelope })}`
        const existing = storage.getItem(archiveKey)
        if (existing !== null && existing !== raw) throw new Error('The earlier lesson archive conflicts. Nothing was erased.')
        if (existing === null) storage.setItem(archiveKey, raw!)
        if (storage.getItem(archiveKey) !== raw) throw new Error('The earlier lesson could not be safely archived. Please retry.')
        return commit(next, latestContext)
      }
      const sessionId = uuid()
      let envelope = current.envelope
      if (envelope.flow.complete && envelope.flow.teachingComplete) {
        const checkpoint = buildAcquisitionResumeCheckpoint({ envelope, context, sessionId, occurredAt: now(), random })
        const applied = applyAcquisitionCheckpoint(envelope, checkpoint, context)
        if (applied.status === 'conflict') throw new Error(applied.reason)
        envelope = applied.envelope
      }
      return commit({ ...current, envelope, sessionId, assessments: [] })
    },
  }
}
