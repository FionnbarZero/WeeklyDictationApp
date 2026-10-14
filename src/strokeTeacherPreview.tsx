import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { grade2AcquisitionStrategy } from './acquisition/strategies/grade2.ts'
import { revealAcquisition, startAcquisition } from './acquisition/engine.ts'
import { transitionAcquisition } from './acquisition/transition.ts'
import { gradeAudioProfileFor } from './audio/gradeAudioProfile.ts'
import { playCachedWordAudio, stopActiveAudio } from './audio/promptAudio.ts'
import type { Dataset, PracticeSession, Word } from './domain.ts'
import { strokeOrderGuide } from './familyBeta/strokeOrderSlay.ts'
import { PracticeView, type PracticeAnswer } from './practice/PracticeView.tsx'
import { StrokeTeacher } from './strokeTeacherPrototype/StrokeTeacher.tsx'
import './styles.css'
import './strokeTeacherPrototype/preview.css'

const word: Word = {
  id: 'stroke-preview-hero',
  text: '英雄',
  sentence: '',
  datasetId: 'stroke-preview-grade2',
  grade: 'Grade 2',
  tier: 'tier-1',
  activityType: 'dictation',
  language: 'mandarin',
}
const dataset: Dataset = {
  id: word.datasetId,
  grade: 'Grade 2',
  schoolYear: '2026–2027',
  startDate: '2026-09-29',
  endDate: '2026-10-02',
  dateRange: 'Grade 2 · Unit 1.5 tryout',
  description: 'One-target stroke teacher tryout',
  words: [word],
}
const targetSet = { id: dataset.id, targets: [word] }
const characters = [...word.text]
const guides = characters.map((character, index) =>
  strokeOrderGuide({ id: `${word.id}-character-${index}`, text: character }),
)

function sessionForTryout(): PracticeSession {
  return {
    id: 'stroke-teacher-local-tryout',
    childId: 'local-tester',
    grade: 'Grade 2',
    primaryDatasetId: dataset.id,
    primaryPhase: 'acquisition',
    segment: 'primary',
    stage: 'dictation',
    queue: [word],
    warmupQueue: [],
    primaryQueue: [word],
    index: 0,
    startedAt: new Date().toISOString(),
    warmupAnswers: [],
    primaryAnswers: [],
    warmupCategoryByWordId: {},
    warmupRandomRotationWordIds: [],
    warmupRotationCycleId: 1,
    acquisition: startAcquisition(targetSet, grade2AcquisitionStrategy, () => 0.25),
  }
}
function speakWord(target: Word) {
  const profile = gradeAudioProfileFor('Grade 2')
  return playCachedWordAudio(target, false, {
    playbackRate: profile.dictationRate,
    sentenceRate: profile.dictationRate,
    pauseMs: profile.segmentGapMs,
  })
}

function Preview() {
  const [stage, setStage] = useState<'teacher' | 'dojo' | 'done'>('teacher')
  const [run, setRun] = useState(0)
  const [characterIndex, setCharacterIndex] = useState(0)
  const [session, setSession] = useState(sessionForTryout)
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'stroke-teacher-preview')
    return <main>This prototype is unavailable in the regular application build.</main>
  function restart() {
    stopActiveAudio()
    setSession(sessionForTryout())
    setRun((value) => value + 1)
    setCharacterIndex(0)
    setStage('teacher')
  }
  function completeCharacter() {
    if (characterIndex + 1 < characters.length) setCharacterIndex(characterIndex + 1)
    else setStage('dojo')
  }
  function answer(value: PracticeAnswer) {
    if (typeof value !== 'boolean') {
      stopActiveAudio()
      setStage('done')
      return
    }
    setSession((current) => {
      if (!current.acquisition) return current
      const transition = transitionAcquisition(
        current.acquisition,
        targetSet,
        grade2AcquisitionStrategy,
        { correct: value, revealMethod: current.currentRevealMethod || 'skip_timer' },
        () => 0.25,
      )
      return {
        ...current,
        acquisition: transition.nextFlow,
        stage: transition.nextFlow.complete ? 'complete' : 'dictation',
        currentRevealMethod: undefined,
      }
    })
  }
  return (
    <div className={stage === 'teacher' ? 'st-original-stage' : 'app-shell'}>
      <header className="st-preview-banner">
        <span>
          <strong>Grade 2 · {import.meta.env.DEV ? 'Local test model' : 'Hosted test model'} v4</strong> · Whole-word
          stroke teaching · Nothing saved
        </span>
        <button onClick={restart}>Restart test</button>
      </header>
      <main className={stage === 'teacher' ? 'st-original-content' : 'main-content'}>
        {stage === 'teacher' ? (
          <StrokeTeacher
            key={`${run}:${characterIndex}`}
            character={characters[characterIndex]}
            characterIndex={characterIndex}
            word={word.text}
            strokes={guides[characterIndex].strokes}
            onComplete={completeCharacter}
            onExit={() => {
              stopActiveAudio()
              setStage('done')
            }}
          />
        ) : stage === 'dojo' ? (
          <PracticeView
            session={session}
            datasets={[dataset]}
            onExit={() => {
              stopActiveAudio()
              setStage('done')
            }}
            onReplay={() => speakWord(session.acquisition?.prompt?.word || word)}
            onBeginWarmup={() => undefined}
            onInterstitialComplete={() => undefined}
            onDictationComplete={(method = 'timer') =>
              setSession((current) => ({
                ...current,
                stage: 'review',
                currentRevealMethod: method,
                acquisition: current.acquisition ? revealAcquisition(current.acquisition) : undefined,
              }))
            }
            onStartReview={() => undefined}
            onAnswer={answer}
            onSpeakWord={speakWord}
            onSpeakReviewInstruction={() => undefined}
            reviewInstruction="Compare the whole word."
          />
        ) : (
          <section className="prompt-card">
            <h1>Test finished</h1>
            <p>Your feedback will guide the next version.</p>
            <button className="primary-button" onClick={restart}>
              Try again
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
const root = document.getElementById('stroke-teacher-preview-root')
if (!root) throw new Error('Missing stroke teacher preview root.')
createRoot(root).render(<Preview />)
