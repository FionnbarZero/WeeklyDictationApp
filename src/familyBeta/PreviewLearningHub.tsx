import { lazy, Suspense, useEffect, useState } from 'react'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import type { Dataset } from '../domain/contracts.ts'
import { localDateKey } from '../domain.ts'
import { grade5AssessmentGames } from '../grade5PresentationPreview/games.ts'
import { grade5MasteredDatasets, grade5MasteredGames } from '../grade5PresentationPreview/masteredGames.ts'
import { grade5PresentationPreview } from '../grade5PresentationPreview/policy.ts'
import type { LearningHubActivity, LearningHubViewModel } from '../learningHub/contracts.ts'
import { LearningHub, type LearningHubProps } from '../learningHub/LearningHub.tsx'
import { standaloneGamesRetired } from '../learningHub/standaloneGameRetirement.ts'
import { learningModuleCatalogEntry } from '../ninjaSkills/catalog.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import { assertGamePack, reviewGameSummary } from '../ninjaSkills/review.ts'
import { SkyWriting } from '../skywriting/SkyWriting.tsx'
import { fetchCurriculum } from './curriculum.ts'
import {
  channelWords,
  latestEarlierTargets,
  type PracticeChannel,
  reinforcementGames,
  sectionDatasets,
} from './gamePools.ts'
import type { BetaGrade, BetaResult } from './model.ts'
import { ReentryPractice } from './ReentryPractice.tsx'
import { familyPreview, previewProfile, previewResults, savePreviewResult } from './runtime.ts'
import { SpiritRealmPractice } from './SpiritRealmPractice.tsx'
import { strokeOrderLesson } from './strokeOrderSlay.ts'

const ModuleHost = lazy(() =>
  import('./FamilyLearningModuleHost.tsx').then((m) => ({ default: m.FamilyLearningModuleHost })),
)
const WhisperingScrolls = lazy(() =>
  import('./WhisperingScrolls.tsx').then((module) => ({ default: module.WhisperingScrolls })),
)
const StrokeOrderSlay = lazy(() =>
  import('./StrokeOrderSlay.tsx').then((module) => ({ default: module.StrokeOrderSlay })),
)
const ListeningLilyPads = lazy(() =>
  import('../kindergartenLab/games.tsx').then((m) => ({ default: m.ListeningLilyPads })),
)
type ExtraLaunch =
  | {
      previewAction: 'game'
      pack: LearningModulePack
      channel: PracticeChannel | 'mixed'
      datasets: Dataset[]
      mastered?: boolean
    }
  | { previewAction: 'reenter' | 'stroke' | 'sky' | 'lily'; channel: PracticeChannel; datasets: Dataset[] }
  | { previewAction: 'spirit'; channel: PracticeChannel; datasets: Dataset[]; direct: boolean }
  | { previewAction: 'scrolls'; channel: 'reading'; datasets: Dataset[] }

const gameHistoryWarning =
  'Saved game history could not be checked. Keep this page open and report the problem. New game rounds are temporarily unavailable.'

export type StrokeWarmupLauncher = (dataset: Dataset, ready: () => void) => void
type PreviewHubProps<Launch> = LearningHubProps<Launch> & { onStrokeOrderWarmup?: StrokeWarmupLauncher }

export function PreviewLearningHub<Launch>(props: PreviewHubProps<Launch>) {
  return familyPreview ? <EnhancedHub {...props} /> : <LearningHub {...props} />
}

function EnhancedHub<Launch>(props: PreviewHubProps<Launch>) {
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
  try {
    completedGames = previewResults()
  } catch {
    /* Preserve stored records and the active game. */
  }
  const model: LearningHubViewModel<Launch | ExtraLaunch> = {
    ...props.model,
    sections: props.model.sections.map((section) => {
      if (!source) return section
      const scope = sectionDatasets(section, source.datasets, source.candidates, date)
      const assessment =
        grade5PresentationPreview &&
        grade === 'Grade 5' &&
        scope.length === 1 &&
        scope[0].source?.sourceType === 'owner-assessment'
      const ninja = section.id === 'ninja-skills' || section.id === 'test-review-1'
      const boss = section.id === 'final-boss' || section.id.startsWith('test-review-')
      const spirit = section.id === 'spirit-realm' || section.id === 'review'
      const masteredArcade = grade5PresentationPreview && grade === 'Grade 5' && spirit
      const masteredScope = masteredArcade ? grade5MasteredDatasets(scope, source.datasets, date) : []
      const activities: LearningHubActivity<Launch | ExtraLaunch>[] = section.activities.filter(
        (a) =>
          a.action.kind !== 'disabled' &&
          !a.id.includes('reenter') &&
          !a.id.includes('reteach') &&
          !a.id.includes('stroke-order') &&
          !(section.id === 'ninja-skills') &&
          !spirit,
      )
      if (['current-week', 'dojo', 'homework'].includes(section.id)) {
        let writingReady = false
        let writingNote = 'A current Tier 1 writing cohort with validated stroke guides is needed.'
        if (section.available) {
          try {
            const lesson = strokeOrderLesson(scope)
            writingReady = true
            writingNote = `${lesson.targetSet.targets.length} of ${lesson.total} writing targets have guides.${lesson.unsupported.length ? ` Not yet supported: ${lesson.unsupported.join('、')}.` : ''}`
          } catch (failure) {
            writingNote = failure instanceof Error ? failure.message : writingNote
          }
        }
        activities.push({
          id: 'dojo-stroke-order-slay',
          title: 'Stroke Order Slay',
          eyebrow: 'Tier 1 · Writing acquisition',
          description: 'Learn stroke order through your grade’s full writing sequence. Progress saves separately.',
          icon: '✍️',
          note: writingNote,
          action: writingReady
            ? {
                kind: 'launch',
                label: 'Stroke Order Slay',
                launch: { previewAction: 'stroke', channel: 'writing', datasets: scope },
              }
            : { kind: 'disabled', label: 'Coming soon', reason: writingNote },
        })
        const eligible = section.available && scope.length === 1 && channelWords(scope[0], 'reading').length > 0
        const reason = 'A current Tier 2 reading cohort is needed for this acquisition activity.'
        activities.push({
          id: 'dojo-whispering-scrolls',
          title: 'Whispering Scrolls',
          eyebrow: 'Tier 2 · Reading acquisition',
          description:
            'Read each scroll, compare your recording with the model, and learn through your grade’s teaching sequence. Progress saves separately.',
          icon: '📜',
          action: eligible
            ? {
                kind: 'launch',
                label: 'Whispering Scrolls',
                launch: { previewAction: 'scrolls', channel: 'reading', datasets: scope },
              }
            : { kind: 'disabled', label: 'Coming soon', reason },
        })
      }
      if (spirit && !masteredArcade)
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
      if (boss && !assessment)
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
      if (ninja || (assessment && boss) || masteredArcade) {
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
        const games = masteredArcade
          ? grade5MasteredGames(masteredScope, completedGames || [], previewProfile()?.id || '')
          : grade5PresentationPreview && assessment
            ? grade5AssessmentGames(scope, completedGames || [], previewProfile()?.id || '')
            : reinforcementGames(source.datasets, anchor, grade, completedGames || [], previewProfile()?.id)
        for (const { capability: availableCapability, channel, datasets } of games) {
          if (assessment && availableCapability.status !== 'ready') continue
          const capability =
            completedGames === null && availableCapability.status === 'ready'
              ? {
                  status: 'unavailable' as const,
                  moduleId: availableCapability.pack.moduleId,
                  reason: gameHistoryWarning,
                }
              : availableCapability
          const id = capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId
          const entry = learningModuleCatalogEntry(id)
          activities.push({
            id: `preview-game-${id}`,
            title: entry.title,
            eyebrow: masteredArcade
              ? 'Mastered words'
              : `${entry.eyebrow} · ${datasets.map((dataset) => dataset.dateRange).join(' / ') || 'No earlier targets'}`,
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
                      ...(masteredArcade ? { mastered: true } : {}),
                    },
                  }
                : {
                    kind: 'disabled',
                    label: capability.reason === gameHistoryWarning ? 'Temporarily unavailable' : 'Coming soon',
                    reason: capability.reason,
                  },
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
      if (masteredArcade) {
        const words = [
          ...new Set(
            masteredScope.flatMap((dataset) =>
              [...dataset.words, ...channelWords(dataset, 'reading')].map((word) => word.text.trim()),
            ),
          ),
        ]
        return {
          ...section,
          available: words.length > 0,
          unavailableReason: words.length
            ? undefined
            : 'Games open when mastered words are available. Current learning words are excluded.',
          subtitle: 'Choose a game and play with mastered words.',
          detailSubtitle: 'The same Ninja Skills games, using mastered words. No warm-up needed.',
          cohortPickerLabel: undefined,
          cohorts: words.length
            ? [
                {
                  id: `mastered:${masteredScope.map((dataset) => dataset.id).join(':')}`,
                  label: 'Mastered word sets',
                  countLabel: `${words.length} mastered words`,
                  groups: [{ label: 'Mastered words', words }],
                },
              ]
            : [],
          activities,
        }
      }
      return {
        ...section,
        activities,
        ...(grade5PresentationPreview && assessment && section.id === 'test-review-2'
          ? {
              activityGroups: [
                {
                  id: 'boss-test',
                  title: 'Boss Test',
                  description: 'Choose the writing test or the reading test.',
                  icon: '🏆',
                  activityIds: activities
                    .filter((activity) => ['Writing Test', 'Reading Test'].includes(activity.title))
                    .map((activity) => activity.id),
                },
                {
                  id: 'boss-games',
                  title: 'Boss Games',
                  description: 'Play games with this Final Boss word set.',
                  icon: '🎮',
                  activityIds: activities
                    .filter((activity) => activity.id.startsWith('preview-game-'))
                    .map((activity) => activity.id),
                },
                {
                  id: 'boss-training',
                  title: 'Need more training?',
                  description: 'Return to the Dojo for writing or reading practice.',
                  icon: '🥋',
                  activityIds: activities
                    .filter((activity) => activity.title.startsWith('Return to Dojo'))
                    .map((activity) => activity.id),
                },
              ],
            }
          : {}),
        ...(spirit ? { subtitle: 'Mastered words follow the adaptive warmup rules.' } : {}),
      }
    }),
  }
  const resumeChannel = (window.frameElement as HTMLIFrameElement | null)?.dataset.familyResumeChannel
  const resumeExperience = (window.frameElement as HTMLIFrameElement | null)?.dataset.familyResumeExperience
  if (resumeChannel === 'writing' || resumeChannel === 'reading') {
    // A retained source is a route to this unfinished Dojo only, never a menu
    // for starting unrelated games/tests from obsolete teacher content.
    model.sections = model.sections
      .map((section) => ({
        ...section,
        activities: section.activities.filter((activity) =>
          resumeExperience === 'whispering-scrolls'
            ? activity.id === 'dojo-whispering-scrolls'
            : resumeExperience === 'stroke-order-slay'
              ? activity.id === 'dojo-stroke-order-slay'
              : activity.id === `dojo-${resumeChannel}` || activity.id === `acquisition-${resumeChannel}`,
        ),
      }))
      .filter((section) => section.activities.length > 0)
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {completedGames === null && (
        <div role="alert">
          <p>{gameHistoryWarning}</p>
          <button
            onClick={() => {
              setError('')
              refreshHistory((value) => value + 1)
            }}
          >
            Check saved history again
          </button>
        </div>
      )}
      <div hidden={Boolean(active)}>
        <LearningHub
          {...props}
          model={model}
          hideUnavailable={false}
          onLaunch={(launch, context) => {
            if (launch && typeof launch === 'object' && 'previewAction' in launch) {
              if (standaloneGamesRetired && ['stroke', 'scrolls'].includes((launch as ExtraLaunch).previewAction)) {
                setError('This standalone game has been removed. Choose Writing or Reading in Enter the Dojo.')
                return
              }
              if ((launch as ExtraLaunch).previewAction === 'game') {
                try {
                  // History can change after the menu renders (for example in
                  // another tab). Check again before starting an unsaved round.
                  previewResults()
                  assertGamePack((launch as Extract<ExtraLaunch, { previewAction: 'game' }>).pack)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'This game is not ready.')
                  return
                }
              }
              setSessionId(crypto.randomUUID())
              const next = launch as ExtraLaunch
              if (next.previewAction === 'stroke' && grade !== 'Kindergarten') {
                if (!props.onStrokeOrderWarmup) {
                  setError('The grade’s Warmup could not be opened. No teaching progress has changed.')
                  return
                }
                props.onStrokeOrderWarmup(next.datasets[0], () => setActive(next))
              } else setActive(next)
            } else props.onLaunch(launch as Launch, context)
          }}
        />
      </div>
      {active?.previewAction === 'game' && (
        <Suspense fallback={<p>Loading game…</p>}>
          <ModuleHost
            pack={active.pack}
            destination={active.mastered ? 'Spirit Realm' : undefined}
            correctionPolicy={
              grade5PresentationPreview &&
              (active.mastered ||
                active.pack.cohort.provenance.some((source) => source.source.sourceType === 'owner-assessment'))
                ? 'prompt-correct'
                : undefined
            }
            onSavedComplete={exit}
            playAudio={audio}
            onExit={exit}
            onComplete={(summary) => {
              try {
                const reviewed = reviewGameSummary(active.pack, summary)
                complete(reviewed.correct, reviewed.attempted)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'The game result could not be verified.')
              }
            }}
          />
        </Suspense>
      )}
      {active?.previewAction === 'reenter' && (
        <ReentryPractice datasets={active.datasets} channel={active.channel} onExit={exit} />
      )}
      {active?.previewAction === 'scrolls' && (
        <Suspense fallback={<p>Opening Whispering Scrolls…</p>}>
          <WhisperingScrolls datasets={active.datasets} onExit={exit} />
        </Suspense>
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
        <Suspense fallback={<p>Opening Stroke Order Slay…</p>}>
          <StrokeOrderSlay datasets={active.datasets} onExit={exit} />
        </Suspense>
      )}
    </>
  )
}
