import type { AcquisitionAssessment, AcquisitionTarget } from '../acquisition/contracts.ts'
import { startAcquisition } from '../acquisition/engine.ts'
import type {
  AcquisitionPersistenceContext,
  AcquisitionProgressEnvelope,
} from '../acquisition/persistence/contracts.ts'
import { acquisitionProgressionId } from '../acquisition/persistence/identity.ts'
import { createAcquisitionProgressEnvelope } from '../acquisition/persistence/migration.ts'
import {
  applyAcquisitionCheckpoint,
  buildAcquisitionCheckpoint,
  buildAcquisitionResumeCheckpoint,
} from '../acquisition/persistence/reducer.ts'
import { validateAcquisitionProgressEnvelope } from '../acquisition/persistence/validation.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
export type SavedAcquisition<T extends AcquisitionTarget, R extends string> = {
  schema: 1
  sessionId: string
  envelope: AcquisitionProgressEnvelope<T>
  assessments: AcquisitionAssessment<T, R>[]
  reviewedTrials: { sessionId: string; reviewedAt: string; assessment: AcquisitionAssessment<T, R> }[]
}

// One atomic browser record holds the next prompt AND the reviewed responses.
// Audio, handwriting images, credentials and provisional answers never enter it.
export function openAcquisitionStore<T extends AcquisitionTarget, R extends string>(
  storage: Store,
  context: AcquisitionPersistenceContext<T>,
  options: { random?: () => number; now?: () => string; uuid?: () => string } = {},
) {
  const random = options.random || Math.random
  const now = options.now || (() => new Date().toISOString())
  const uuid = options.uuid || (() => crypto.randomUUID())
  const key = `family-beta-acquisition-v1:${acquisitionProgressionId(context.identity)}`
  let raw = storage.getItem(key)
  let current: SavedAcquisition<T, R>

  function validate(value: unknown): SavedAcquisition<T, R> {
    const saved = value as SavedAcquisition<T, R> | null
    if (
      !saved ||
      saved.schema !== 1 ||
      typeof saved.sessionId !== 'string' ||
      !/^[\w-]{1,160}$/.test(saved.sessionId) ||
      !Array.isArray(saved.assessments) ||
      !Array.isArray(saved.reviewedTrials) ||
      !validateAcquisitionProgressEnvelope(saved.envelope, context).valid ||
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

  function commit(next: SavedAcquisition<T, R>) {
    if (storage.getItem(key) !== raw)
      throw new Error(
        'This activity changed in another tab. Reload to resume the saved response; nothing was overwritten.',
      )
    const encoded = JSON.stringify(validate(next))
    storage.setItem(key, encoded)
    if (storage.getItem(key) !== encoded)
      throw new Error('Saving could not be confirmed. Keep this activity open and retry.')
    raw = encoded
    current = next
    return current
  }

  if (raw !== null) {
    try {
      current = validate(JSON.parse(raw))
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error('Saved acquisition could not be read. Nothing was erased. Please report this problem.')
      throw error
    }
  } else {
    current = {
      schema: 1,
      sessionId: uuid(),
      envelope: createAcquisitionProgressEnvelope(
        context,
        startAcquisition(context.targetSet, context.strategy, random),
        now(),
      ),
      assessments: [],
      reviewedTrials: [],
    }
    commit(current)
  }

  return {
    key,
    get current() {
      return current
    },
    answer(correct: boolean, revealMethod: R) {
      const checkpoint = buildAcquisitionCheckpoint({
        envelope: current.envelope,
        context,
        answeredPromptId: current.envelope.flow.prompt?.id || '',
        sessionId: current.sessionId,
        occurredAt: now(),
        response: { correct, revealMethod },
        random,
      })
      const applied = applyAcquisitionCheckpoint(current.envelope, checkpoint, context)
      if (applied.status === 'conflict') throw new Error(applied.reason)
      return commit({
        ...current,
        envelope: applied.envelope,
        reviewedTrials: checkpoint.assessment
          ? [
              ...current.reviewedTrials,
              {
                sessionId: current.sessionId,
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
    // checkpoint remains; the next visit starts a new score, not a new word set.
    finishSession() {
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
