import { lazy, Suspense, useRef, useState } from 'react'
import type { Dataset } from '../domain/contracts.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import { learningModuleCapabilities } from '../ninjaSkills/content.ts'
import { learningModuleCatalogEntry } from '../ninjaSkills/catalog.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
import { channelCohort, channelWords, type PracticeChannel } from './gamePools.ts'
import { masteryStorageKey, persistMasteryAssessment, prepareMastery, readMasteryRecord } from './previewMastery.ts'
import { previewProfile, savePreviewResult } from './runtime.ts'
import type { BetaGrade } from './model.ts'
import { SkyWriting } from '../skywriting/SkyWriting.tsx'
import { ReadAloudBossRush } from '../learningGames/ProductionGames.tsx'
import { ReadingResponsePanel } from '../readingPractice/ReadingResponsePanel.tsx'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import './previewActivities.css'

const ModuleHost = lazy(() =>
  import('../ninjaSkills/LearningModuleHost.tsx').then((m) => ({ default: m.LearningModuleHost })),
)
export function SpiritRealmPractice({
  datasets,
  mastered,
  channel,
  date,
  direct = false,
  onExit,
}: {
  datasets: Dataset[]
  mastered: Dataset[]
  channel: PracticeChannel
  date: string
  direct?: boolean
  onExit: () => void
}) {
  const child = previewProfile()!
  const [initial] = useState(() => {
    try {
      return {
        prepared: prepareMastery(
          readMasteryRecord(localStorage, child.id, child.grade, channel),
          datasets,
          mastered,
          date,
        ),
        error: '',
      }
    } catch {
      return { prepared: null, error: 'Mastery history could not be loaded safely. It has not been reset.' }
    }
  })
  const prepared = useRef(initial.prepared)
  const pending = useRef<{ targetId: string; correct: boolean; id: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(initial.error)
  const [game, setGame] = useState<LearningModulePack | 'writing' | 'reading' | null>(
    direct && initial.prepared?.words.length ? channel : null,
  )
  const sessionId = useRef(crypto.randomUUID()).current
  const eventIndex = useRef(0)
  const [saveError, setSaveError] = useState('')
  const audio = (text: string, language = 'zh-CN', rate = 0.65) =>
    promptAudioCompleted(
      playAudioPlan([
        { text, language: language as 'zh-CN', rate, storagePath: kindergartenAudioForText(text)?.storagePath },
      ]),
    )
  async function flush() {
    if (!pending.current || !prepared.current) return
    setSaving(true)
    try {
      if (!navigator.locks) throw new Error('This browser cannot safely coordinate mastery saving.')
      await navigator.locks.request(masteryStorageKey(child.id, child.grade, channel), () => {
        const event = pending.current!
        prepared.current!.record = persistMasteryAssessment(
          localStorage,
          prepared.current!,
          event.targetId,
          event.correct,
          event.id,
        )
        pending.current = null
      })
      setError('')
    } catch {
      setError('Mastery could not be saved. The activity is paused; retry saving before continuing.')
    } finally {
      setSaving(false)
    }
  }
  function assess(targetId: string, correct: boolean) {
    if (!prepared.current || pending.current) return
    pending.current = { targetId, correct, id: `${sessionId}:${eventIndex.current++}` }
    void flush()
  }
  function complete(correct: number, attempted: number) {
    if (pending.current || !prepared.current) return
    try {
      savePreviewResult({
        id: sessionId,
        activity: `Spirit Realm · ${channel} · ${typeof game === 'object' && game ? game.title : 'warmup'}`,
        channel,
        datasetIds: [...new Set(prepared.current.words.map((w) => w.datasetId))],
        correct,
        attempted,
      })
      stopActiveAudio()
      onExit()
    } catch {
      setSaveError('The completed score could not be saved. Keep this page open and retry finishing.')
    }
  }
  const words = prepared.current?.words || []
  const selected = new Set(words.map((w) => w.id))
  const scoped = mastered.map((d) => ({
    ...d,
    words: channel === 'writing' ? channelWords(d, channel).filter((w) => selected.has(w.id)) : [],
    vocabulary: {
      tier1: channel === 'writing' ? channelWords(d, channel).filter((w) => selected.has(w.id)) : [],
      tier2: channel === 'reading' ? channelWords(d, channel).filter((w) => selected.has(w.id)) : [],
      tier3: [],
    },
  }))
  const capabilities = learningModuleCapabilities(
    channelCohort(scoped, channel, 'Adaptive mastered-word queue'),
    NINJA_SKILLS_PROFILES[child.grade as BetaGrade],
  )
  return (
    <section
      className={!game ? 'lg-shell family-spirit-menu' : undefined}
      data-report-activity={`Spirit Realm · ${channel}`}
    >
      {error && (
        <div role="alert">
          {error}
          {pending.current && <button onClick={flush}>Retry mastery saving</button>}
        </div>
      )}
      {saveError && <p role="alert">{saveError}</p>}
      {saving && <p role="status">Saving mastery…</p>}
      <div inert={Boolean(error) || saving}>
        {!game && (
          <>
            <div className="lg-topbar">
              <button className="lg-exit" onClick={onExit}>
                Back to Spirit Realm
              </button>
            </div>
            <header className="lg-heading">
              <h1>Spirit Realm · {channel}</h1>
            </header>
            <p>
              {words.length} unique mastered targets selected by the warmup rules. Missed targets need three consecutive
              correct assessments; recent entries need two. Progress stays on this preview device.
            </p>
            {words.length > 0 ? (
              <>
                <button className="lg-primary" onClick={() => setGame(channel)}>
                  {channel === 'writing' ? 'Writing mastery warmup' : 'Reading mastery'}
                </button>
                {capabilities.map((capability) => {
                  const entry = learningModuleCatalogEntry(
                    capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId,
                  )
                  if (
                    (channel === 'reading' && entry.id === 'dictation-streak') ||
                    (channel === 'writing' && ['context-gap-dash', 'sentence-scramble'].includes(entry.id))
                  )
                    return null
                  return (
                    <article className="lg-card" key={entry.id}>
                      <h2>{entry.title}</h2>
                      {capability.status === 'ready' ? (
                        <button className="lg-primary" onClick={() => setGame(capability.pack)}>
                          Start {entry.title}
                        </button>
                      ) : (
                        <>
                          <p>{capability.reason}</p>
                          <button className="lg-primary" disabled>
                            Needs teacher-approved content
                          </button>
                        </>
                      )}
                    </article>
                  )
                })}
              </>
            ) : (
              <p>No eligible mastered targets are available for this channel. Active words are excluded.</p>
            )}
          </>
        )}
        {game === 'writing' && (
          <SkyWriting
            words={words.map((w) => w.text)}
            maxRounds={words.length}
            speak={audio}
            onExit={onExit}
            onAssess={(_word, index, correct) => assess(words[index].id, correct)}
            onComplete={(summary) => complete(summary.correct, summary.total)}
          />
        )}
        {game === 'reading' && (
          <ReadAloudBossRush
            title="Reading mastery"
            rounds={words.map((w) => ({ id: w.id, targetId: w.id, targetText: w.text, audioText: w.text }))}
            playAudio={audio}
            onExit={onExit}
            onAttempt={(attempt) => assess(attempt.targetId, attempt.correct)}
            onComplete={(summary) => complete(summary.correct, summary.attempted)}
            renderResponse={(round, controls) => (
              <ReadingResponsePanel
                key={round.id}
                promptId={round.id}
                targetText={round.targetText}
                assessed
                onPlayReference={() => audio(round.targetText)}
                onAnswer={controls.onAssess}
                onContinue={() => undefined}
              />
            )}
          />
        )}
        {game && typeof game === 'object' && (
          <Suspense fallback={<p>Loading mastery game…</p>}>
            <ModuleHost
              pack={game}
              playAudio={audio}
              onExit={onExit}
              onAttempt={(attempt) => assess(attempt.targetId, attempt.correct)}
              onComplete={(summary) => complete(summary.correct, summary.attempted)}
            />
          </Suspense>
        )}
      </div>
      {initial.error && <button onClick={onExit}>Return without changing history</button>}
    </section>
  )
}
