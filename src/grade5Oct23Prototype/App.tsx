import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  playAudioPlan,
  playCachedWordAudio,
  playCachedWordAudioOnce,
  promptAudioCompleted,
  stopActiveAudio,
} from '../audio/promptAudio.ts'
import { ProblemReporter } from '../familyBeta/ProblemReporter.tsx'
import { SpeedMatch } from '../learningModules/speed-match/Game.tsx'
import { SentenceScramble } from '../learningModules/sushi-scramble/Game.tsx'
import { Tier2ReadingPractice } from '../readingPractice/Tier2ReadingPractice.tsx'
import { DeferredTestReview } from '../testReview/DeferredTestReview.tsx'
import { grade5Tier2ReadingProfile } from '../tier2/profiles/grade5.ts'
import { enablePreviewSpeechFromTap } from '../writingAcquisition/previewSpeech.ts'
import {
  PROTOTYPE_TITLE,
  readingPathway,
  readingTargets,
  shurikenPairs,
  sushiRounds,
  TARGETS,
  writingTargets,
} from './content.ts'
import { WritingTrainer } from './WritingTrainer.tsx'
import '../styles.css'
import '../writingAcquisition/crossGradePreview.css'
import './styles.css'
import { grade5RepairPreview } from '../grade5RepairPreview/policy.ts'
import { openGrade5PreviewReading } from '../grade5RepairPreview/readingStore.ts'

type Activity = 'writing-test' | 'reading-test' | 'writing-dojo' | 'reading-dojo' | 'shuriken' | 'sushi'
type Section = 'Practice Your Ninja Skills' | 'Final Boss Test'
const build = import.meta.env.VITE_GIT_REVISION || 'local-uncommitted'
function App() {
  const [active, setActive] = useState<{ section: Section; activity: Activity } | null>(null)
  const [summary, setSummary] = useState('')
  const [mounted, setMounted] = useState(false)
  const [audioError, setAudioError] = useState('')
  useEffect(() => {
    setMounted(true)
    return () => stopActiveAudio()
  }, [])
  function leave() {
    stopActiveAudio()
    setActive(null)
    setAudioError('')
  }
  function begin(section: Section, activity: Activity) {
    stopActiveAudio()
    enablePreviewSpeechFromTap()
    setAudioError('')
    setSummary('')
    setActive({ section, activity })
  }
  const gameAudio = useCallback(async (text: string, language = 'zh-CN') => {
    try {
      setAudioError('')
      const voice = language === 'en-US' ? 'en-US' : 'zh-CN'
      await promptAudioCompleted(playAudioPlan([{ text, language: voice, rate: voice === 'zh-CN' ? 0.7 : 0.9 }]))
    } catch (error) {
      if (error instanceof Error && error.message === 'Audio playback was cancelled.') return
      setAudioError('Audio could not play. Tap the word or Hear again.')
    }
  }, [])
  const actions: { id: Activity; label: string }[] = [
    { id: 'writing-test', label: 'Writing Test · all 8 targets' },
    { id: 'reading-test', label: 'Reading Test · all 8 targets' },
    { id: 'writing-dojo', label: 'Return to Dojo · Writing' },
    { id: 'reading-dojo', label: 'Return to Dojo · Reading' },
    { id: 'shuriken', label: 'Shuriken Match' },
    { id: 'sushi', label: 'Sushi Scramble' },
  ]
  return (
    <div
      className="oct23-prototype cross-grade-writing-preview"
      data-report-grade="Grade 5"
      data-report-revision={build}
      data-report-screen={active ? `${active.section}: ${active.activity}` : PROTOTYPE_TITLE}
    >
      <header className="cross-grade-banner">
        <span>
          {PROTOTYPE_TITLE} · Prototype {grade5RepairPreview ? '2' : '1'} · {build.slice(0, 7)}
        </span>
        <div id="problem-reporter-controls" />
      </header>
      {!active ? (
        <main className="oct23-menu">
          <h1>{PROTOTYPE_TITLE}</h1>
          <p className="oct23-safety">Isolated test learners only · Not the regular app · October 23 test</p>
          {grade5RepairPreview && (
            <p>
              <a href="/family-beta-preview.html?grade=grade5">
                Grade 5 activity repair tests: Warmup, Shadow Strike and Memory Lanterns
              </a>
            </p>
          )}
          <p>One shared target list for both reading and writing:</p>
          <p className="oct23-targets" lang="zh-Hans">
            {TARGETS.map((t) => t.text).join(' · ')}
          </p>
          {summary && <p role="status">{summary}</p>}
          <div className="oct23-sections">
            {(['Practice Your Ninja Skills', 'Final Boss Test'] as const).map((section) => (
              <section
                key={section}
                id={section === 'Final Boss Test' ? 'final-boss' : 'ninja-skills'}
                aria-label={section}
              >
                <h2>{section}</h2>
                <p>The same eight targets—not a different week.</p>
                {actions.map((action) => (
                  <button type="button" key={action.id} onClick={() => begin(section, action.id)}>
                    {action.label}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <details>
            <summary>Source and prototype limitations</summary>
            <p>
              Transcribed from page 2, “10/23 Chinese Dictation to Review.” Teacher wording and meanings are preserved;
              word-tile boundaries are proposed.
            </p>
            <p>
              Writing teaching steps {grade5RepairPreview ? 'and reading acquisition' : ''} save only in this browser
              and are shared between both Return to Dojo buttons. Tests,{' '}
              {grade5RepairPreview ? '' : 'reading practice and '}games are session-only here and restart after
              exit/reload. Ink and recordings are temporary. No account, family scores, cloud sync, offline installation
              or live curriculum change.
            </p>
            <p>
              Existing Grade 5 acquisition rules—including familiar trials—remain. Tests contain only the eight listed
              targets, with review after all responses. Shuriken uses only these eight meanings; an error briefly
              highlights the correct match, then requires another try.
            </p>
          </details>
        </main>
      ) : active.activity === 'writing-dojo' ? (
        <WritingTrainer onExit={leave} />
      ) : active.activity === 'reading-dojo' ? (
        <Tier2ReadingPractice
          profile={grade5Tier2ReadingProfile}
          pathway={readingPathway}
          persistAcquisition={grade5RepairPreview}
          openSavedAcquisition={grade5RepairPreview ? openGrade5PreviewReading : undefined}
          label="Return to Dojo · Reading · October 23 shared targets"
          onExit={leave}
          onComplete={(result) => {
            if (grade5RepairPreview) openGrade5PreviewReading().finishSession()
            setSummary(
              `Reading practice: ${result.correct}/${result.attempted}. ${grade5RepairPreview ? 'Teaching position saved in this browser.' : 'Session-only prototype.'}`,
            )
            leave()
          }}
        />
      ) : active.activity === 'writing-test' || active.activity === 'reading-test' ? (
        <main className="oct23-test">
          <DeferredTestReview
            mode={active.activity === 'writing-test' ? 'writing' : 'reading'}
            targets={active.activity === 'writing-test' ? writingTargets : readingTargets}
            activityLabel={`${active.section} · October 23 · 8 shared targets`}
            onPlayReference={(target) => playCachedWordAudioOnce(target)}
            onPlayWritingPrompt={(target) => playCachedWordAudio(target)}
            onDiscard={leave}
            onComplete={(result) => {
              setSummary(
                `${result.mode === 'writing' ? 'Writing' : 'Reading'}: ${result.correct}/8. No family score was saved.`,
              )
              leave()
            }}
            exitLabel="Exit test"
            sessionNote="Prototype: collect all 8 responses, then review. Ink and audio stay temporary."
          />
        </main>
      ) : active.activity === 'shuriken' ? (
        <SpeedMatch
          pairs={shurikenPairs}
          correctionPolicy="prompt-correct"
          eyebrow="October 23 · eight shared targets"
          onExit={leave}
          playAudio={gameAudio}
          onAttempt={async () => undefined}
          onTimer={async () => undefined}
          onComplete={(result) => {
            setSummary(
              `Shuriken: ${result.correct} correct of ${result.attempted} attempts. Retries retain earlier errors.`,
            )
            leave()
          }}
        />
      ) : (
        <SentenceScramble
          rounds={sushiRounds}
          eyebrow="October 23 · teacher reference sentences"
          onExit={leave}
          playAudio={gameAudio}
          onAttempt={async () => undefined}
          onComplete={(result) => {
            setSummary(`Sushi: ${result.correct} correct of ${result.attempted} attempts.`)
            leave()
          }}
        />
      )}
      {audioError && (
        <p className="oct23-error" role="alert">
          {audioError}
        </p>
      )}
      {mounted && <ProblemReporter grade="Grade 5" />}
    </div>
  )
}
const root = document.getElementById('grade5-oct23-root')
if (!root) throw new Error('Missing Grade 5 prototype root.')
createRoot(root).render(<App />)
