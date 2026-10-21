import type { AppState } from '../../domain.ts'
import { startPractice, type StartPracticeResult } from '../practice/startPractice.ts'
import { leavePractice, primaryStartState, skipWarmup } from '../practice/warmupTransitions.ts'

type Input = Parameters<typeof startPractice>[0]
type Started = Extract<StartPracticeResult, { status: 'started' }>

/** Local pilot startup is one atomic candidate, including Warmup and DT resume.
 * Retain its session, timestamps and random choices until confirmation succeeds. */
export function createConfirmedWritingLaunch() {
  let candidate: { key: string; before: AppState; result: Started } | null = null
  let preparing = false
  return {
    get pending() {
      return preparing || candidate !== null
    },
    async start(
      key: string,
      input: Input,
      save: (before: AppState, next: AppState) => boolean | Promise<boolean>,
      resumeReviewedWriting = false,
    ): Promise<StartPracticeResult> {
      if (preparing) return { status: 'blocked', message: 'This writing lesson is already being prepared.' }
      preparing = true
      try {
        if (
          !input.writingPilot ||
          input.persistence.cloud ||
          input.externalPrimary ||
          input.target?.phase !== 'acquisition'
        )
          throw new Error('Confirmed writing launch is available only for the local writing pilot.')
        if (candidate && (candidate.key !== key || candidate.before !== input.state))
          throw new Error('Retry the unsaved writing lesson before starting another activity. Nothing was overwritten.')
        if (!candidate) {
          let result = await startPractice({
            ...input,
            persistence: {
              ...input.persistence,
              // Preparation is not an acknowledgement. The final candidate
              // contains all eligibility updates and any DT resume checkpoint;
              // none is presented until the combined workspace write confirms.
              saveLocalState: () => true,
              journalWarmup: () => {},
              acknowledgeWarmup: () => {},
            },
          })
          if (result.status !== 'started') return result
          const progressionId = result.session.acquisitionProgressionId
          if (
            resumeReviewedWriting &&
            result.session.stage === 'warmup-intro' &&
            input.state.writingAcquisitionProgress?.some((p) => p.acquisition.id === progressionId && p.revision > 0)
          ) {
            const transitionInput = {
              state: result.state,
              session: result.session,
              occurredAt: input.writingTimestamp ? new Date(input.writingTimestamp) : input.startedAt,
              persistence: {
                cloud: false,
                saveLocalState: () => true,
                journalWarmup: () => {},
                acknowledgeWarmup: () => {},
              },
            }
            const visitId = result.session.adaptiveWarmupVisitId
            const visit = result.state.warmupVisitsV1?.find((v) => v.id === visitId)
            if (visit && visit.attemptedCount > 0) {
              // An older build may have started another Warmup before this
              // unfinished lesson. Preserve its real attempts as a partial visit.
              const resumed = leavePractice(transitionInput)
              if (resumed.message) throw new Error(resumed.message)
              result = { ...result, state: resumed.state, session: primaryStartState(result.session) }
            } else {
              const resumed = skipWarmup(transitionInput)
              if (resumed.status !== 'applied')
                throw new Error('The saved writing lesson could not resume safely. Nothing was changed.')
              result = { ...result, state: resumed.state, session: resumed.session }
            }
          }
          candidate = { key, before: input.state, result }
        }
        const pending = candidate
        if (!(await save(pending.before, pending.result.state)))
          throw new Error('This writing lesson could not be saved. Keep this page open and try Learn to Write again.')
        candidate = null
        return pending.result
      } catch (error) {
        return { status: 'blocked', message: error instanceof Error ? error.message : String(error) }
      } finally {
        preparing = false
      }
    },
  }
}
