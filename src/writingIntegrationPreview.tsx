import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { revealAcquisition } from './acquisition/engine.ts'
import { acquisitionDigest } from './acquisition/persistence/identity.ts'
import { activityClock } from './activity/activityLifecycle.ts'
import { gradeAudioProfileFor } from './audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from './audio/promptAudio.ts'
import type { PracticeSession, Word } from './domain.ts'
import { ProblemReporter } from './familyBeta/ProblemReporter.tsx'
import { withScrollsWrite } from './familyBeta/scrollsCompletion.ts'
import { PracticeView, type PracticeAnswer } from './practice/PracticeView.tsx'
import { StrokeTeacher } from './strokeTeacherPrototype/StrokeTeacher.tsx'
import { writingCharacterGuides } from './writingAcquisition/lesson.ts'
import {
  createWritingProgress,
  teachingPosition,
  type WritingCommand,
  type WritingProgress,
} from './writingAcquisition/progress.ts'
import { openWritingStore } from './writingAcquisition/store.ts'
import {
  writingPreviewLesson,
  WRITING_PREVIEW_KEY,
  WRITING_PREVIEW_OWNER,
  WRITING_PREVIEW_VERSION,
} from './writingAcquisition/previewLesson.ts'
import './styles.css'
import './strokeTeacherPrototype/preview.css'

type PreviewStore = ReturnType<typeof openWritingStore>
function openPreview() {
  return openWritingStore(localStorage, WRITING_PREVIEW_KEY, WRITING_PREVIEW_OWNER, () =>
    createWritingProgress(writingPreviewLesson(), WRITING_PREVIEW_OWNER, crypto.randomUUID(), new Date().toISOString()),
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
  useEffect(() => {
    const closed = () => stopActiveAudio()
    window.addEventListener('pagehide', closed)
    return () => {
      window.removeEventListener('pagehide', closed)
      stopActiveAudio()
    }
  }, [])
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'writing-integration-preview')
    return <main>This integration preview is unavailable in the regular app.</main>

  async function begin() {
    if (busy.current) return
    busy.current = true
    try {
      const opened = await withScrollsWrite(WRITING_PREVIEW_KEY, openPreview)
      setStore(opened)
      setProgress(opened.current)
      setActive(true)
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
    if (!progress || !revealed || !progress.acquisition.flow.prompt || busy.current) return
    const promptId = progress.acquisition.flow.prompt.id
    try {
      await commit({
        id: `answer-${acquisitionDigest({ revision: progress.revision, promptId, value, revealMethod })}`,
        kind: 'answer',
        expectedRevision: progress.revision,
        promptId,
        correct: value,
        revealMethod,
      })
      setRevealed(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This answer could not be saved.')
    }
  }
  const position = progress ? teachingPosition(progress) : null
  const target = position && progress ? progress.lesson.targets[position.targetIndex] : null
  const teaching = active && target && position && progress
  return (
    <div
      className={teaching ? 'st-original-stage' : 'app-shell'}
      data-report-grade="Grade 2"
      data-report-screen="Writing integration preview"
      data-report-revision="writing-preview-v5"
      data-report-week={progress?.lesson.dataset.dateRange}
    >
      <header className="st-preview-banner">
        <span>
          <strong>{WRITING_PREVIEW_VERSION}</strong> · Saved on this browser · Cloud sync not connected
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
              Each word receives six steps for every character before its usual scroll acquisition. Completed steps save
              on this browser; unfinished handwriting stays temporary.
            </p>
            <button className="primary-button" onClick={() => void begin()}>
              Start or resume writing
            </button>
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
            onStepComplete={async (step) => {
              if (step !== position.step) throw new Error('Reopen the lesson to resume its confirmed step.')
              await commit({
                id: `teacher-${acquisitionDigest({ revision: progress.revision, position })}`,
                kind: 'complete-teaching-step',
                expectedRevision: progress.revision,
                position,
              })
            }}
            onComplete={() => undefined}
            onExit={exit}
          />
        ) : (
          progress && (
            <PracticeView
              session={sessionFor(progress, revealed)}
              datasets={[progress.lesson.dataset]}
              onExit={exit}
              onReplay={() => speakWord(progress.acquisition.flow.prompt!.word)}
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
