import { lazy, Suspense, useEffect, useState } from 'react'
import { LearningHub, type LearningHubProps } from '../learningHub/LearningHub.tsx'
import type { LearningHubActivity, LearningHubViewModel } from '../learningHub/contracts.ts'
import type { Dataset } from '../domain/contracts.ts'
import { familyPreview, previewProfile, previewResults, savePreviewResult } from './runtime.ts'
import { fetchCurriculum } from './curriculum.ts'
import type { BetaGrade, BetaResult } from './model.ts'
import { localDateKey } from '../domain.ts'
import { learningModuleCatalogEntry } from '../ninjaSkills/catalog.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import { assertGamePack, reviewGameSummary } from '../ninjaSkills/review.ts'
import {
  reinforcementGames,
  channelWords,
  latestEarlierTargets,
  sectionDatasets,
  type PracticeChannel,
} from './gamePools.ts'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import { buildStrokeOrderRounds } from '../learningGames/strokeOrder/rounds.ts'
import { StrokeOrderActivity } from '../learningGames/strokeOrder/StrokeOrderActivity.tsx'
import { ReentryPractice } from './ReentryPractice.tsx'
import { SpiritRealmPractice } from './SpiritRealmPractice.tsx'
import { SkyWriting } from '../skywriting/SkyWriting.tsx'

const ModuleHost = lazy(() =>
  import('../ninjaSkills/LearningModuleHost.tsx').then((m) => ({ default: m.LearningModuleHost })),
)
const ListeningLilyPads = lazy(() =>
  import('../kindergartenLab/games.tsx').then((m) => ({ default: m.ListeningLilyPads })),
)
type ExtraLaunch =
  | { previewAction: 'game'; pack: LearningModulePack; channel: PracticeChannel | 'mixed'; datasets: Dataset[] }
  | { previewAction: 'reenter' | 'stroke' | 'sky' | 'lily'; channel: PracticeChannel; datasets: Dataset[] }
  | { previewAction: 'spirit'; channel: PracticeChannel; datasets: Dataset[]; direct: boolean }

const gameHistoryWarning = 'Saved game history could not be checked. Keep this page open and report the problem. New game rounds are temporarily unavailable.'

export function PreviewLearningHub<Launch>(props: LearningHubProps<Launch>) {
  return familyPreview ? <EnhancedHub {...props} /> : <LearningHub {...props} />
}

function EnhancedHub<Launch>(props: LearningHubProps<Launch>) {
  const grade = props.model.profileLabel as BetaGrade
  const [source, setSource] = useState<Awaited<ReturnType<typeof fetchCurriculum>> | null>(null)
  const [active, setActive] = useState<ExtraLaunch | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [, refreshHistory] = useState(0)
  useEffect(() => {
    if (active) window.scrollTo(0, 0)
  }, [active])
  useEffect(() => {
    const controller = new AbortController()
    void fetchCurriculum(grade, controller.signal)
      .then(setSource)
      .catch((e) => !controller.signal.aborted && setError(String(e)))
    return () => {
      controller.abort()
      stopActiveAudio()
    }
  }, [grade, retry])
  function exit() {
    stopActiveAudio()
    setActive(null)
  }
  function complete(correct: number, attempted: number) {
    if (!active) return
    try {
      const saved = savePreviewResult({
        id: sessionId,
        activity:
          active.previewAction === 'game'
            ? active.pack.title
            : active.previewAction === 'lily'
              ? 'Listening Lily Pads'
              : active.previewAction === 'sky'
                ? 'Sky Writing'
                : 'Stroke Order',
        channel: 'game',
        datasetIds: active.datasets.map((d) => d.id),
        schoolYear: active.datasets[0].schoolYear,
        correct,
        attempted,
      })
      if (!saved) throw new Error('The completed game could not be saved for this child.')
      setError('')
      exit()
    } catch {
      setError('This game result could not be saved. Keep the activity open and retry completion.')
    }
  }
  const audio = (text: string, language = 'zh-CN', rate = 0.65) =>
    promptAudioCompleted(
      playAudioPlan([
        { text, language: language as 'zh-CN', rate, storagePath: kindergartenAudioForText(text)?.storagePath },
      ]),
    )
  const date = new URLSearchParams(location.search).get('week') || localDateKey(new Date())
  // The legacy model uses different warmup/scoring rules. Never expose its launch
  // buttons while the authoritative curriculum request is still pending or failed.
  if (!source)
    return (
      <section className="lg-shell" data-report-activity="Loading teacher activities">
        <p role={error ? 'alert' : 'status'}>
          {error
            ? 'Teacher activities could not load. No substitute activities have been started.'
            : 'Loading teacher activities…'}
        </p>
        {error && (
          <button
            onClick={() => {
              setError('')
              setRetry((value) => value + 1)
            }}
          >
            Retry activities
          </button>
        )}
      </section>
    )
  // A history read must not unmount an active game or its completion retry.
  // Unverified history also cannot become a fresh round's rotation cursor.
  let completedGames: BetaResult[] | null = null
  try { completedGames = previewResults() } catch { /* Preserve stored records and the active game. */ }
  const model: LearningHubViewModel<Launch | ExtraLaunch> = {
    ...props.model,
    sections: props.model.sections.map((section) => {
      if (!source) return section
      const scope = sectionDatasets(section, source.datasets, source.candidates, date)
      const ninja = section.id === 'ninja-skills' || section.id === 'test-review-1'
      const boss = section.id === 'final-boss' || section.id.startsWith('test-review-')
      const spirit = section.id === 'spirit-realm' || section.id === 'review'
      const activities: LearningHubActivity<Launch | ExtraLaunch>[] = section.activities.filter(
        (a) =>
          a.action.kind !== 'disabled' &&
          !a.id.includes('reenter') &&
          !a.id.includes('reteach') &&
          !(section.id === 'ninja-skills') &&
          !spirit,
      )
      if (spirit)
        for (const channel of ['writing', 'reading'] as const) {
          if (!scope.some((d) => channelWords(d, channel).length)) continue
          for (const direct of [true, false]) {
            const title = `${channel === 'writing' ? 'Writing' : 'Reading'} ${direct ? 'mastery warmup' : 'mastered-word games'}`
            activities.push({
              id: `spirit-${channel}-${direct ? 'warmup' : 'games'}`,
              title,
              eyebrow: 'Mastered targets',
              description: 'Uses adaptive warmup selection and mastery updates, including recovery after mistakes.',
              icon: '✨',
              action: {
                kind: 'launch',
                label: title,
                launch: { previewAction: 'spirit', channel, datasets: scope, direct },
              },
            })
          }
        }
      if (boss)
        for (const channel of ['writing', 'reading'] as const) {
          if (!scope.some((d) => channelWords(d, channel).length)) continue
          activities.push({
            id: `reenter-${channel}`,
            title: `Reenter the Dojo · ${channel}`,
            eyebrow: 'Learn the full set again',
            description: 'Restart acquisition from the beginning. Completed scores remain unchanged.',
            icon: '🥋',
            action: {
              kind: 'launch',
              label: `Reenter the Dojo · ${channel}`,
              launch: { previewAction: 'reenter', channel, datasets: scope },
            },
          })
        }
      if (grade === 'Grade 5' && section.id === 'homework' && scope.length) {
        const built = buildStrokeOrderRounds(scope.flatMap((d) => d.words))
        const reason = `Stroke guides are unavailable for: ${built.unsupportedTargets.join('、')}. No substitute targets will be used.`
        activities.push({
          id: 'preview-stroke-order',
          title: 'Stroke Order',
          eyebrow: 'Writing targets',
          description: 'Watch, copy, then write each current writing target from memory.',
          icon: '✍️',
          ...(built.unsupportedTargets.length ? { note: reason } : {}),
          action:
            built.rounds.length && !built.unsupportedTargets.length
              ? {
                  kind: 'launch',
                  label: 'Stroke Order',
                  launch: { previewAction: 'stroke', channel: 'writing', datasets: scope },
                }
              : { kind: 'disabled', label: 'Needs stroke guides', reason },
        })
      }
      if (ninja) {
        const anchor =
          new URLSearchParams(location.search).get('week') ||
          [...source.datasets]
            .filter((d) => d.startDate <= date)
            .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.startDate ||
          date
        const writing = latestEarlierTargets(source.datasets, anchor, 'writing')
        const reading = latestEarlierTargets(source.datasets, anchor, 'reading')
        if (grade === 'Kindergarten' && reading.some((d) => channelWords(d, 'reading').length >= 2))
          activities.push({
            id: 'preview-lily-pads',
            title: 'Listening Lily Pads',
            eyebrow: `Reading · ${reading[0].dateRange}`,
            description: 'Hear and choose from the most recent earlier reading targets.',
            icon: '🐸',
            action: {
              kind: 'launch',
              label: 'Listening Lily Pads',
              launch: { previewAction: 'lily', channel: 'reading', datasets: reading },
            },
          })
        if (writing.length)
          activities.push({
            id: 'preview-sky-writing',
            title: 'Sky Writing',
            eyebrow: `Writing · ${writing[0].dateRange}`,
            description: 'Practise the most recent earlier writing targets.',
            icon: '✍️',
            action: {
              kind: 'launch',
              label: 'Sky Writing',
              launch: { previewAction: 'sky', channel: 'writing', datasets: writing },
            },
          })
        for (const { capability: availableCapability, channel, datasets } of reinforcementGames(source.datasets, anchor, grade, completedGames || [], previewProfile()?.id)) {
          const capability = completedGames === null && availableCapability.status === 'ready'
            ? { status: 'unavailable' as const, moduleId: availableCapability.pack.moduleId, reason: gameHistoryWarning }
            : availableCapability
          const id = capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId
          const entry = learningModuleCatalogEntry(id)
          activities.push({
            id: `preview-game-${id}`,
            title: entry.title,
            eyebrow: `${entry.eyebrow} · ${datasets.map(dataset => dataset.dateRange).join(' / ') || 'No earlier targets'}`,
            description: entry.description,
            icon: entry.icon,
            note: capability.status === 'unavailable' ? capability.reason : capability.pack.scopeNote,
            action:
              capability.status === 'ready'
                ? {
                    kind: 'launch',
                    label: entry.title,
                    launch: {
                      previewAction: 'game',
                      pack: capability.pack,
                      channel,
                      datasets,
                    },
                  }
                : { kind: 'disabled', label: capability.reason === gameHistoryWarning ? 'Temporarily unavailable' : 'Coming soon', reason: capability.reason },
          })
        }
        if (section.id === 'ninja-skills')
          return {
            ...section,
            available: activities.length > 0,
            cohortPickerLabel: undefined,
            cohortSummaryLabel: 'Most recent earlier writing and reading targets',
            subtitle: 'Games use the most recent earlier week with targets for their own channel.',
            cohorts: [
              ...writing.map((d) => ({
                id: `${d.id}:writing`,
                label: `${d.dateRange} · Writing`,
                countLabel: `${d.words.length} writing`,
                groups: [{ label: 'Writing targets', words: d.words.map((w) => w.text) }],
              })),
              ...reading.map((d) => ({
                id: `${d.id}:reading`,
                label: `${d.dateRange} · Reading`,
                countLabel: `${channelWords(d, 'reading').length} reading`,
                groups: [{ label: 'Reading targets', words: channelWords(d, 'reading').map((w) => w.text) }],
              })),
            ],
            activities,
          }
      }
      return {
        ...section,
        activities,
        ...(spirit ? { subtitle: 'Mastered words follow the adaptive warmup rules.' } : {}),
      }
    }),
  }
  const resumeChannel = (window.frameElement as HTMLIFrameElement | null)?.dataset.familyResumeChannel
  if (resumeChannel === 'writing' || resumeChannel === 'reading') {
    // A retained source is a route to this unfinished Dojo only, never a menu
    // for starting unrelated games/tests from obsolete teacher content.
    model.sections = model.sections.map(section => ({ ...section,
      activities: section.activities.filter(activity => activity.id === `dojo-${resumeChannel}` || activity.id === `acquisition-${resumeChannel}`),
    })).filter(section => section.activities.length > 0)
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {completedGames === null && <div role="alert">
        <p>{gameHistoryWarning}</p>
        <button onClick={() => { setError(''); refreshHistory(value => value + 1) }}>Check saved history again</button>
      </div>}
      <div hidden={Boolean(active)}>
        <LearningHub
          {...props}
          model={model}
          hideUnavailable={false}
          onLaunch={(launch, context) => {
            if (launch && typeof launch === 'object' && 'previewAction' in launch) {
              if ((launch as ExtraLaunch).previewAction === 'game') {
                try {
                  // History can change after the menu renders (for example in
                  // another tab). Check again before starting an unsaved round.
                  previewResults()
                  assertGamePack((launch as Extract<ExtraLaunch, { previewAction: 'game' }>).pack)
                }
                catch (e) { setError(e instanceof Error ? e.message : 'This game is not ready.'); return }
              }
              setSessionId(crypto.randomUUID())
              setActive(launch as ExtraLaunch)
            } else props.onLaunch(launch as Launch, context)
          }}
        />
      </div>
      {active?.previewAction === 'game' && (
        <Suspense fallback={<p>Loading game…</p>}>
          <ModuleHost
            pack={active.pack}
            playAudio={audio}
            onExit={exit}
            onComplete={(summary) => {
              try {
                const reviewed = reviewGameSummary(active.pack, summary)
                complete(reviewed.correct, reviewed.attempted)
              } catch (e) { setError(e instanceof Error ? e.message : 'The game result could not be verified.') }
            }}
          />
        </Suspense>
      )}
      {active?.previewAction === 'reenter' && (
        <ReentryPractice datasets={active.datasets} channel={active.channel} onExit={exit} />
      )}
      {active?.previewAction === 'lily' && (
        <Suspense fallback={<p>Loading game…</p>}>
          <ListeningLilyPads
            targets={active.datasets.flatMap((d) => channelWords(d, 'reading').map((w) => w.text))}
            choicePool={active.datasets.flatMap((d) => channelWords(d, 'reading').map((w) => w.text))}
            speak={audio}
            onExit={exit}
            onComplete={(summary) => complete(summary.correct, summary.total)}
          />
        </Suspense>
      )}
      {active?.previewAction === 'spirit' && source && (
        <SpiritRealmPractice
          datasets={source.datasets}
          mastered={active.datasets}
          channel={active.channel}
          date={date}
          direct={active.direct}
          onExit={exit}
        />
      )}
      {active?.previewAction === 'sky' && (
        <SkyWriting
          words={active.datasets.flatMap((d) => channelWords(d, 'writing').map((w) => w.text))}
          speak={audio}
          onExit={exit}
          onComplete={(summary) => complete(summary.correct, summary.total)}
        />
      )}
      {active?.previewAction === 'stroke' && (
        <StrokeOrderActivity
          activityId="stroke-order-grade5"
          grade="Grade 5"
          title="Stroke Order"
          eyebrow="Grade 5 · Enter the Dojo"
          sourceId={active.datasets[0].id}
          sourceLabel={active.datasets[0].dateRange}
          {...buildStrokeOrderRounds(active.datasets.flatMap((d) => d.words))}
          timing={{ copySeconds: 20, memorySeconds: 20, correctionSeconds: 20 }}
          playAudio={audio}
          onExit={exit}
          onComplete={(summary) => complete(summary.correct, summary.attempted)}
        />
      )}
    </>
  )
}
