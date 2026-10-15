import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { revealAcquisition } from './acquisition/engine.ts'
import { activityClock } from './activity/activityLifecycle.ts'
import { gradeAudioProfileFor } from './audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from './audio/promptAudio.ts'
import type { PracticeSession, Word } from './domain.ts'
import { ProblemReporter } from './familyBeta/ProblemReporter.tsx'
import { withScrollsWrite } from './familyBeta/scrollsCompletion.ts'
import { PracticeView, type PracticeAnswer } from './practice/PracticeView.tsx'
import { StrokeTeacher } from './strokeTeacherPrototype/StrokeTeacher.tsx'
import { FIVE_STEP_SEQUENCE } from './strokeTeacherPrototype/model.ts'
import { writingCharacterGuides } from './application/writingAcquisition/lesson.ts'
import {
  createWritingProgress,
  createWritingCommand,
  teachingPosition,
  type WritingCommand,
  type WritingProgress,
} from './application/writingAcquisition/progress.ts'
import { openWritingStore } from './infrastructure/writingProgressStore.ts'
import {
  writingPreviewLesson,
  WRITING_PREVIEW_KEY,
  WRITING_PREVIEW_OWNER,
  WRITING_PREVIEW_VERSION,
  WRITING_PREVIEW_POLICY,
  REFINEMENT_PREVIEW_KEY,
  REFINEMENT_PREVIEW_POLICY,
  REFINEMENT_PREVIEW_VERSION,
} from './writingAcquisition/previewLesson.ts'
import './styles.css'
import './strokeTeacherPrototype/preview.css'
import './writingAcquisition/refinementPreview.css'

const refinement = import.meta.env.MODE === 'writing-refinement-preview'
const previewKey = refinement ? REFINEMENT_PREVIEW_KEY : WRITING_PREVIEW_KEY
const previewPolicy = refinement ? REFINEMENT_PREVIEW_POLICY : WRITING_PREVIEW_POLICY
const previewVersion = refinement ? REFINEMENT_PREVIEW_VERSION : WRITING_PREVIEW_VERSION

type PreviewStore = ReturnType<typeof openWritingStore>
function openPreview() {
  return openWritingStore(localStorage, previewKey, WRITING_PREVIEW_OWNER, () =>
    createWritingProgress(
      writingPreviewLesson(previewPolicy),
      WRITING_PREVIEW_OWNER,
      crypto.randomUUID(),
      new Date().toISOString(),
    ),
  )
}
function sessionFor(progress: WritingProgress, revealed: boolean): PracticeSession {
  const dataset = progress.lesson.dataset
  const flow = progress.acquisition.flow
  return {
    id: progress.attemptId,
    childId: progress.owner,
    grade: 'Grade 2',
    primaryDatasetId: dataset.id,
    primaryPhase: 'acquisition',
    segment: 'primary',
    stage: flow.complete ? 'complete' : revealed ? 'review' : 'dictation',
    queue: flow.prompt ? [flow.prompt.word] : [],
    warmupQueue: [],
    primaryQueue: dataset.words,
    index: flow.targetIndex,
    startedAt: progress.createdAt,
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    acquisition: revealed ? revealAcquisition(flow) : flow,
  }
}
function speakWord(word: Word) {
  const profile = gradeAudioProfileFor('Grade 2')
  return playCachedWordAudio(word, false, {
    playbackRate: profile.dictationRate,
    sentenceRate: profile.dictationRate,
    pauseMs: profile.segmentGapMs,
  })
}

function Preview() {
  const [store, setStore] = useState<PreviewStore | null>(null)
  const [progress, setProgress] = useState<WritingProgress | null>(null)
  const [active, setActive] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [revealMethod, setRevealMethod] = useState('skip_timer')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const [resumeVisit, setResumeVisit] = useState(0)
  const [warmupSample, setWarmupSample] = useState(false)
  const [warmupIndex, setWarmupIndex] = useState(0)
  useEffect(() => {
    const closed = () => stopActiveAudio()
    window.addEventListener('pagehide', closed)
    return () => {
      window.removeEventListener('pagehide', closed)
      stopActiveAudio()
    }
  }, [])
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'writing-integration-preview' && !refinement)
    return <main>This integration preview is unavailable in the regular app.</main>

  async function begin(sample = false) {
    if (busy.current) return
    busy.current = true
    try {
      const opened = await withScrollsWrite(previewKey, openPreview)
      setStore(opened)
      setProgress(opened.current)
      setActive(true)
      setWarmupSample(sample)
      setWarmupIndex(0)
      setRevealed(false)
      setError('')
      setResumeVisit((value) => value + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The saved lesson could not be opened.')
    } finally {
      busy.current = false
    }
  }
  function exit() {
    stopActiveAudio()
    setActive(false)
    setRevealed(false)
  }
  async function commit(command: WritingCommand) {
    if (!store || busy.current) throw new Error('A writing save is already in progress.')
    busy.current = true
    setSaving(true)
    try {
      const next = await withScrollsWrite(store.key, () => {
        if (activityClock.paused) throw new Error('Close the report before continuing.')
        return store.apply(command, new Date().toISOString())
      })
      setProgress(next)
      setError('')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  async function answer(value: PracticeAnswer) {
    if (typeof value !== 'boolean') {
      if (!busy.current) exit()
      return
    }
    if (warmupSample) {
      setWarmupIndex((index) => index + 1)
      setRevealed(false)
      return
    }
    if (!progress || !revealed || !progress.acquisition.flow.prompt || busy.current) return
    const promptId = progress.acquisition.flow.prompt.id
    try {
      await commit(
        createWritingCommand({
          kind: 'answer',
          expectedRevision: progress.revision,
          promptId,
          correct: value,
          revealMethod,
        }),
      )
      setRevealed(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This answer could not be saved.')
    }
  }
  const position = progress ? teachingPosition(progress) : null
  const target = position && progress ? progress.lesson.targets[position.targetIndex] : null
  const teaching = active && !warmupSample && target && position && progress
  const sampleWord = progress?.lesson.dataset.words[warmupIndex % progress.lesson.dataset.words.length]
  const previewSession = progress ? sessionFor(progress, revealed) : null
  // A labelled, non-scoring layout sample; it never advances the saved teaching/acquisition lesson.
  const displayedSession: PracticeSession | null =
    warmupSample && previewSession && sampleWord
      ? {
          ...previewSession,
          id: `${previewSession.id}:layout-sample:${warmupIndex}`,
          segment: 'warmup',
          stage: revealed ? 'review' : 'dictation',
          index: 0,
          queue: [sampleWord],
          warmupQueue: [sampleWord],
          acquisition: undefined,
        }
      : previewSession
  return (
    <div
      className={`${teaching ? 'st-original-stage' : 'app-shell'}${refinement ? ' writing-refinement-preview' : ''}`}
      data-report-grade="Grade 2"
      data-report-screen="Writing integration preview"
      data-report-revision={refinement ? 'writing-preview-v7-trace-independent' : 'writing-preview-v6-five-step'}
      data-report-week={progress?.lesson.dataset.dateRange}
    >
      <header className="st-preview-banner">
        <span>
          <strong>{previewVersion}</strong> · Saved on this browser · Cloud sync not connected
          {warmupSample && ' · Warmup layout sample only — no scores saved'}
        </span>
        {active && (
          <button disabled={saving} onClick={exit}>
            Exit to preview menu
          </button>
        )}
      </header>
      <main className={teaching ? 'st-original-content' : 'main-content'}>
        {!active ? (
          <section className="prompt-card">
            <p className="eyebrow">Approved v4 appearance · Grade 2 integration test</p>
            <h1>Stroke teacher → Writing Dojo</h1>
            <p>Practice the September 29–October 2 teacher-source lesson, starting with 英雄 and 每个.</p>
            <p>
              Each word receives five steps for every character before{' '}
              {refinement
                ? 'one whole-word tracing trial, one independent trial, then distractors'
                : 'its usual scroll acquisition'}
              . Completed steps save on this browser; unfinished handwriting stays temporary.
            </p>
            <button className="primary-button" onClick={() => void begin()}>
              Start or resume writing
            </button>
            {refinement && (
              <button className="replay-button" onClick={() => void begin(true)}>
                Check Warmup scroll size
              </button>
            )}
            <p>
              This separate preview uses a test profile. Warmup, parent accounts and cloud resume will be connected
              during app integration.
            </p>
          </section>
        ) : teaching ? (
          <StrokeTeacher
            key={`${progress.attemptId}:${position.targetId}:${position.characterIndex}:${resumeVisit}`}
            targetId={target.id}
            character={[...target.text][position.characterIndex]}
            characterIndex={position.characterIndex}
            word={target.text}
            pinyin={target.pinyin}
            meaning={target.meaning}
            strokes={writingCharacterGuides(target.text)[position.characterIndex]}
            initialStep={position.step}
            sequence={FIVE_STEP_SEQUENCE}
            onStepComplete={async (step) => {
              if (step !== position.step) throw new Error('Reopen the lesson to resume its confirmed step.')
              await commit(
                createWritingCommand({
                  kind: 'complete-teaching-step',
                  expectedRevision: progress.revision,
                  position,
                }),
              )
            }}
            onComplete={() => undefined}
            onExit={exit}
          />
        ) : (
          progress &&
          displayedSession && (
            <PracticeView
              key={`${warmupSample}:${resumeVisit}`}
              session={displayedSession}
              datasets={[progress.lesson.dataset]}
              onExit={exit}
              onReplay={() => speakWord(warmupSample ? sampleWord! : progress.acquisition.flow.prompt!.word)}
              onBeginWarmup={() => undefined}
              onInterstitialComplete={() => undefined}
              onDictationComplete={(method = 'timer') => {
                setRevealMethod(method)
                setRevealed(true)
              }}
              onStartReview={() => undefined}
              onAnswer={(value) => {
                void answer(value)
              }}
              onSpeakWord={speakWord}
              onSpeakReviewInstruction={() => undefined}
              reviewInstruction="Compare the whole word."
            />
          )
        )}
        {saving && !teaching && <p role="status">Saving your place…</p>}
        {error && <p role="alert">{error}</p>}
      </main>
      <ProblemReporter grade="Grade 2" />
    </div>
  )
}
const root = document.getElementById('writing-integration-preview-root')
if (!root) throw new Error('Missing writing preview root.')
createRoot(root).render(<Preview />)
