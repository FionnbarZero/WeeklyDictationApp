import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { revealAcquisition } from './acquisition/engine.ts'
import { activityClock } from './activity/activityLifecycle.ts'
import {
  createWritingCommand,
  createWritingProgress,
  teachingPosition,
  type WritingCommand,
  type WritingProgress,
} from './application/writingAcquisition/progress.ts'
import { gradeAudioProfileFor } from './audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from './audio/promptAudio.ts'
import type { PracticeSession, Word } from './domain.ts'
import { ProblemReporter } from './familyBeta/ProblemReporter.tsx'
import { withScrollsWrite } from './familyBeta/scrollsCompletion.ts'
import { openWritingStore } from './infrastructure/writingProgressStore.ts'
import type { PracticeAnswer } from './practice/PracticeView.tsx'
import {
  CROSS_GRADE_PREVIEW_OWNER,
  CROSS_GRADE_PREVIEW_VERSION,
  type CrossGrade,
  crossGradeLessons,
  crossGradePreviewKey,
} from './writingAcquisition/crossGradeLessons.ts'
import WritingPractice from './writingAcquisition/Grade2WritingPractice.tsx'
import { enablePreviewSpeechFromTap } from './writingAcquisition/previewSpeech.ts'
import './styles.css'
import './writingAcquisition/crossGradePreview.css'

const buildRevision = document.querySelector<HTMLMetaElement>('meta[name="build-revision"]')?.content || 'development'

function Preview() {
  const [grade, setGrade] = useState<CrossGrade>(() =>
    new URLSearchParams(location.search).get('grade') === 'grade5' ? 'Grade 5' : 'Kindergarten',
  )
  const [selectedWeek, setSelectedWeek] = useState(() => new URLSearchParams(location.search).get('week') || '')
  const [store, setStore] = useState<ReturnType<typeof openWritingStore> | null>(null)
  const [progress, setProgress] = useState<WritingProgress | null>(null)
  const [active, setActive] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [revealMethod, setRevealMethod] = useState('skip_timer')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [visit, setVisit] = useState(0)
  const [mounted, setMounted] = useState(false)
  const busy = useRef(false)
  let lessons: ReturnType<typeof crossGradeLessons> = []
  let sourceError = ''
  try {
    lessons = crossGradeLessons(grade)
  } catch (failure) {
    sourceError = failure instanceof Error ? failure.message : 'The source lesson is unavailable.'
  }
  const lesson = lessons.find((item) => item.dataset.id === selectedWeek) || lessons[0]
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('grade', grade === 'Grade 5' ? 'grade5' : 'kindergarten')
    if (selectedWeek) url.searchParams.set('week', selectedWeek)
    else url.searchParams.delete('week')
    history.replaceState(null, '', url)
  }, [grade, selectedWeek])
  useEffect(() => {
    setMounted(true)
    window.addEventListener('pagehide', stopActiveAudio)
    return () => {
      window.removeEventListener('pagehide', stopActiveAudio)
      stopActiveAudio()
    }
  }, [])
  async function begin() {
    if (busy.current || !lesson || activityClock.paused) return
    stopActiveAudio()
    enablePreviewSpeechFromTap()
    busy.current = true
    setSaving(true)
    try {
      const key = crossGradePreviewKey(grade, lesson.dataset.id)
      const opened = await withScrollsWrite(key, () =>
        openWritingStore(localStorage, key, CROSS_GRADE_PREVIEW_OWNER, () =>
          createWritingProgress(lesson, CROSS_GRADE_PREVIEW_OWNER, crypto.randomUUID(), new Date().toISOString()),
        ),
      )
      if (opened.current.lesson.dataset.grade !== grade || opened.current.lesson.dataset.id !== lesson.dataset.id)
        throw new Error('This saved preview belongs to another grade or lesson. Nothing was changed.')
      setStore(opened)
      setProgress(opened.current)
      setActive(true)
      setRevealed(false)
      setError('')
      setVisit((v) => v + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Writing could not be opened.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  function exit() {
    if (busy.current || activityClock.paused) return
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
      exit()
      return
    }
    if (!progress || !revealed || !progress.acquisition.flow.prompt || busy.current) return
    try {
      await commit(
        createWritingCommand({
          kind: 'answer',
          expectedRevision: progress.revision,
          promptId: progress.acquisition.flow.prompt.id,
          correct: value,
          revealMethod,
        }),
      )
      setRevealed(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The answer could not be saved.')
    }
  }
  function speak(word: Word) {
    const profile = gradeAudioProfileFor(grade)
    return playCachedWordAudio(word, false, {
      playbackRate: profile.dictationRate,
      sentenceRate: profile.dictationRate,
      pauseMs: profile.segmentGapMs,
    })
  }
  const position = progress && teachingPosition(progress)
  const flow = progress?.acquisition.flow
  const session: PracticeSession | null =
    progress && flow
      ? {
          id: progress.attemptId,
          childId: progress.owner,
          grade: progress.lesson.dataset.grade,
          primaryDatasetId: progress.lesson.dataset.id,
          primaryPhase: 'acquisition',
          segment: 'primary',
          stage: flow.complete ? 'complete' : revealed ? 'review' : 'dictation',
          queue: flow.prompt ? [flow.prompt.word] : [],
          warmupQueue: [],
          primaryQueue: progress.lesson.dataset.words,
          index: flow.targetIndex,
          startedAt: progress.createdAt,
          warmupAnswers: [],
          primaryAnswers: [],
          warmupCategoryByWordId: {},
          warmupRandomRotationWordIds: [],
          warmupRotationCycleId: 1,
          acquisition: revealed ? revealAcquisition(flow) : flow,
        }
      : null
  return (
    <div
      className="cross-grade-writing-preview"
      data-report-grade={grade}
      data-report-revision={buildRevision}
      data-report-screen={active ? 'Cross-grade writing prototype' : 'Cross-grade prototype menu'}
    >
      <header className="cross-grade-banner">
        <span>
          {grade} · Prototype 1 · {buildRevision.slice(0, 7)} · This browser only
        </span>
        <div id="problem-reporter-controls" />
      </header>
      {!active ? (
        <main className="cross-grade-menu">
          <h1>{CROSS_GRADE_PREVIEW_VERSION}</h1>
          <p>The approved Slay teacher and writing boxes, with each grade’s existing acquisition rules.</p>
          <label>
            Grade{' '}
            <select
              aria-label="Grade"
              disabled={saving}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value as CrossGrade)
                setSelectedWeek('')
                setError('')
              }}
            >
              <option>Kindergarten</option>
              <option>Grade 5</option>
            </select>
          </label>
          <label>
            Teacher-source lesson{' '}
            <select
              aria-label="Teacher-source lesson"
              disabled={saving}
              value={lesson?.dataset.id || ''}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              {lessons.map((item) => (
                <option key={item.dataset.id} value={item.dataset.id}>
                  {item.dataset.dateRange} · {item.targets.map((t) => t.text).join('、')}
                </option>
              ))}
            </select>
          </label>
          <p>
            Five teaching steps for every character, followed by the grade’s original whole-word acquisition sequence.
            Every new word starts its teacher.
          </p>
          <p>
            {grade === 'Kindergarten'
              ? 'Kinder keeps its wider tracing tolerance, slower demonstration and final-step numbered guide.'
              : 'Grade 5 keeps its more precise tracing tolerance and hidden final-step guide.'}
          </p>
          <button
            className="primary-button"
            disabled={saving || !lesson || Boolean(sourceError)}
            onClick={() => void begin()}
          >
            Start or resume writing
          </button>
          <p>
            Isolated teacher-source samples, not today’s live lesson. Completed steps and reviewed answers save only in
            this browser. Unfinished ink is temporary.
          </p>
          <p>
            Warmup, family score history, parent accounts and cloud sync are not connected here. Done for today returns
            to this menu and preserves your place; it does not publish a family result.
          </p>
        </main>
      ) : (
        progress &&
        session && (
          <WritingPractice
            key={`${grade}:${visit}`}
            progress={progress}
            session={session}
            datasets={[progress.lesson.dataset]}
            onExit={exit}
            onReplay={() => speak(flow!.prompt!.word)}
            onBeginWarmup={() => undefined}
            onInterstitialComplete={() => undefined}
            onStartReview={() => undefined}
            onDictationComplete={(method = 'timer') => {
              if (!activityClock.paused) {
                setRevealMethod(method)
                setRevealed(true)
              }
            }}
            onAnswer={(value) => {
              void answer(value)
            }}
            onSpeakWord={speak}
            onSpeakReviewInstruction={() => undefined}
            reviewInstruction="Compare the whole word."
            onTeachingStep={async (step) => {
              if (!position || step !== position.step)
                throw new Error('Reopen the lesson to resume its confirmed step.')
              await commit(
                createWritingCommand({ kind: 'complete-teaching-step', expectedRevision: progress.revision, position }),
              )
            }}
          />
        )
      )}
      {(error || sourceError) && (
        <p className="cross-grade-error" role="alert">
          {error || sourceError}
        </p>
      )}
      {saving && (
        <span role="status" className="cross-grade-save">
          Saving your place…
        </span>
      )}
      {mounted && <ProblemReporter grade={grade} />}
    </div>
  )
}
const root = document.getElementById('cross-grade-writing-preview-root')
if (!root) throw new Error('Missing cross-grade prototype root.')
createRoot(root).render(<Preview />)
