import { nativeWarmupStorage } from './nativeRuntime.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Word } from '../domain.ts'
import { activityClock } from '../activity/activityLifecycle.ts'
import type { PromptAudioAttempt } from '../audio/promptAudio.ts'
import { previewProfile } from '../familyBeta/runtime.ts'
import { withScrollsWrite } from '../familyBeta/scrollsCompletion.ts'
import { LearningGameShell } from '../strokeTeacherPrototype/original/GameShell.tsx'
import NativeWarmupTrial from './NativeWarmupTrial.tsx'
import {
  answerNativeWarmup,
  nativeVisitWords,
  newNativeWarmupVisit,
  readNativeWarmupVisit,
  writeNativeWarmup,
  type NativeWarmupVisit,
} from './nativeVisit.ts'

export default function NativeMasteryWarmup({
  words,
  pool,
  scope,
  grade = 'Kindergarten',
  onExit,
  onAnswer,
  onComplete,
  playWord,
}: {
  words: Word[]
  pool: Word[]
  scope: string
  grade?: string
  onExit: () => void
  onAnswer: (word: Word, correct: boolean, eventId: string) => void | Promise<void>
  onComplete: (id: string, correct: number, total: number) => boolean
  playWord: (word: Word) => PromptAudioAttempt
}) {
  const key = `native-writing-warmup-visit-v1:${grade}:${scope}`
  const [visit, setVisit] = useState<NativeWarmupVisit | null>(null)
  const [error, setError] = useState('')
  const raw = useRef<string | null>(null)
  const mounted = useRef(false)
  const busy = useRef(false)
  const owner = useRef(previewProfile()?.id)
  const selected = useMemo(() => (visit ? nativeVisitWords(visit, pool) : []), [visit, pool])
  function assertCurrent() {
    if (!mounted.current || activityClock.paused || previewProfile()?.id !== owner.current)
      throw new Error('Reopen this Warmup to continue. Your place is unchanged.')
  }
  useEffect(() => {
    mounted.current = true
    void withScrollsWrite(key, () => {
      assertCurrent()
      const storage = nativeWarmupStorage()
      raw.current = storage.getItem(key)
      let next = readNativeWarmupVisit(raw.current, pool)
      if (!next || next.closed) next = newNativeWarmupVisit(words, crypto.randomUUID())
      raw.current = writeNativeWarmup(storage, key, raw.current, next)
      return next
    })
      .then((next) => {
        if (mounted.current) setVisit(next)
      })
      .catch((e) => {
        if (mounted.current) setError(e.message)
      })
    return () => {
      mounted.current = false
    }
  }, [key, pool, words])
  async function answer(correct: boolean) {
    if (!visit) throw new Error('Warmup has not opened.')
    // Persist the grade-owned fact first. The event ID is stable across a crash
    // between that write and the visit advance, making the retry idempotent.
    assertCurrent()
    if (nativeWarmupStorage().getItem(key) !== raw.current) throw new Error('Warmup changed in another tab. Reopen it.')
    await onAnswer(selected[visit.answers.length], correct, `${visit.id}:${visit.answers.length}`)
    const next = await withScrollsWrite(key, () => {
      assertCurrent()
      const value = answerNativeWarmup(visit, visit.answers.length, correct)
      raw.current = writeNativeWarmup(nativeWarmupStorage(), key, raw.current, value)
      return value
    })
    setVisit(next)
  }
  async function finish() {
    if (!visit || busy.current) return
    busy.current = true
    try {
      await withScrollsWrite(key, () => {
        assertCurrent()
        if (nativeWarmupStorage().getItem(key) !== raw.current)
          throw new Error('Warmup changed in another tab. Reopen it.')
        if (!onComplete(visit.id, visit.answers.filter(Boolean).length, visit.answers.length))
          throw new Error('The result could not be saved. Please try again.')
        raw.current = writeNativeWarmup(nativeWarmupStorage(), key, raw.current, { ...visit, closed: true })
      })
      onExit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The result could not be saved.')
    } finally {
      busy.current = false
    }
  }
  if (visit && visit.answers.length < selected.length)
    return (
      <NativeWarmupTrial
        key={`${visit.id}:${visit.answers.length}`}
        word={selected[visit.answers.length]}
        grade={grade}
        visitId={visit.id}
        position={visit.answers.length}
        total={selected.length}
        onSpeakWord={playWord}
        onComplete={answer}
        onExit={onExit}
      />
    )
  return (
    <div id="slay-acquisition-root" className="warmup-design native-warmup">
      <LearningGameShell
        title="Writing Warmup"
        eyebrow="Mastery review"
        progress={`${visit?.answers.length || 0} / ${visit?.words.length || words.length}`}
        onExit={onExit}
      >
        <section className="warmup-complete">
          {visit ? (
            <>
              <h2>Warmup complete</h2>
              <p>
                {visit.answers.filter(Boolean).length} of {visit.answers.length} correct on the first try.
              </p>
              <button className="lg-primary" onClick={() => void finish()}>
                Done
              </button>
            </>
          ) : (
            <p>Opening your saved place…</p>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </LearningGameShell>
    </div>
  )
}
