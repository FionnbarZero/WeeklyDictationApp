import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { answerAcquisition, revealAcquisition, startAcquisition } from '../acquisition/engine.ts'
import { activityClock } from '../activity/activityLifecycle.ts'
import { writingContext } from '../application/writingAcquisition/progress.ts'
import { gradeAudioProfileFor } from '../audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from '../audio/promptAudio.ts'
import type { PracticeSession, Word } from '../domain.ts'
import { ProblemReporter } from '../familyBeta/ProblemReporter.tsx'
import { type PracticeAnswer, PracticeView } from '../practice/PracticeView.tsx'
import { LearningGameShell } from '../strokeTeacherPrototype/original/GameShell.tsx'
import { REFINEMENT_PREVIEW_POLICY, writingPreviewLesson } from './previewLesson.ts'
import { enablePreviewSpeechFromTap } from './previewSpeech.ts'
import '../styles.css'
import './slayAcquisitionMockup.css'

const lesson = writingPreviewLesson(REFINEMENT_PREVIEW_POLICY)
const context = writingContext(lesson, 'slay-layout-synthetic')
function newFlow() {
  return startAcquisition(context.targetSet, context.strategy, Math.random)
}
function speak(word: Word) {
  const profile = gradeAudioProfileFor('Grade 2')
  return playCachedWordAudio(word, false, {
    playbackRate: profile.dictationRate,
    sentenceRate: profile.dictationRate,
    pauseMs: profile.segmentGapMs,
  })
}
function SlayAcquisitionMockup() {
  const [flow, setFlow] = useState(newFlow)
  const [active, setActive] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    return () => stopActiveAudio()
  }, [])
  const session: PracticeSession = {
    id: 'slay-acquisition-layout',
    childId: 'slay-layout-synthetic',
    grade: 'Grade 2',
    primaryDatasetId: lesson.dataset.id,
    primaryPhase: 'acquisition',
    segment: 'primary',
    stage: flow.complete ? 'complete' : flow.prompt?.revealed ? 'review' : 'dictation',
    queue: flow.prompt ? [flow.prompt.word] : [],
    warmupQueue: [],
    primaryQueue: lesson.dataset.words,
    index: flow.targetIndex,
    startedAt: '2026-10-15T00:00:00.000Z',
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    acquisition: flow,
  }
  function exit() {
    stopActiveAudio()
    setActive(false)
  }
  function answer(value: PracticeAnswer) {
    if (typeof value !== 'boolean') {
      exit()
      return
    }
    if (activityClock.paused) return
    setFlow((current) =>
      current.prompt?.revealed
        ? answerAcquisition(current, context.targetSet, context.strategy, value, Math.random)
        : current,
    )
  }
  return (
    <div
      className="slay-acquisition-comparison"
      data-report-grade="Grade 2"
      data-report-revision="slay-acquisition-comparison-v1"
      data-report-activity="Slay-style acquisition mockup"
    >
      <header className="slay-comparison-banner">
        <strong>Comparison B · Acquisition only · Not saved</strong>
        <div id="problem-reporter-controls" />
      </header>
      <LearningGameShell
        gameId="stroke-order-slay-grade-2"
        title="Writing Dojo · Slay style"
        eyebrow="Grade 2 acquisition comparison"
        progress={`${flow.targetIndex + 1}/${lesson.dataset.words.length} words`}
        onExit={exit}
      >
        {!active ? (
          <section className="lg-card lg-stroke-order-card slay-comparison-start">
            <h2>Same Slay look. Writing acquisition.</h2>
            <p>One whole-word trace → one independent trial → distractors.</p>
            <p>Session-only comparison. Stroke-order teaching is omitted so you can test this screen directly.</p>
            <button
              className="lg-primary"
              onClick={() => {
                enablePreviewSpeechFromTap()
                setActive(true)
              }}
            >
              Start or resume comparison
            </button>
            <button className="lg-secondary" onClick={() => setFlow(newFlow())}>
              Restart this sample
            </button>
          </section>
        ) : (
          <PracticeView
            session={session}
            datasets={[lesson.dataset]}
            onExit={exit}
            onReplay={() => speak(flow.prompt!.word)}
            onBeginWarmup={() => undefined}
            onInterstitialComplete={() => undefined}
            onDictationComplete={() => {
              if (!activityClock.paused) setFlow(revealAcquisition)
            }}
            onStartReview={() => undefined}
            onAnswer={answer}
            onSpeakWord={speak}
            onSpeakReviewInstruction={() => undefined}
            reviewInstruction="Compare the whole word."
          />
        )}
      </LearningGameShell>
      {mounted && <ProblemReporter grade="Grade 2" />}
    </div>
  )
}
const root = document.getElementById('slay-acquisition-root')
if (!root) throw new Error('Missing Slay comparison root')
createRoot(root).render(<SlayAcquisitionMockup />)
