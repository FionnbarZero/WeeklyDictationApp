import type { Dataset } from '../domain/contracts.ts'
import type { BetaResult } from '../familyBeta/model.ts'
import type { ExtraLaunch } from '../familyBeta/PreviewLearningHub.tsx'
import type { LearningHubActivity, LearningHubSection } from '../learningHub/contracts.ts'
import { LEARNING_MODULE_CATALOG } from '../ninjaSkills/catalog.ts'
import { learningModuleCapability, learningModuleCohortFromDatasets } from '../ninjaSkills/content.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'

export function recognitionReviewGames(dataset: Dataset, completed: readonly BetaResult[], childId: string) {
  const cohort = learningModuleCohortFromDatasets(`recognition:${dataset.id}`, '50 cumulative reading words', [dataset])
  return LEARNING_MODULE_CATALOG.filter((entry) =>
    ['speed-match', 'target-blast', 'memory-flip'].includes(entry.id),
  ).map((entry) => {
    const visit = new Set(
      completed
        .filter(
          (result) =>
            result.childId === childId &&
            result.grade === 'Grade 5' &&
            result.channel === 'game' &&
            result.activity === entry.title &&
            result.datasetIds.length === 1 &&
            result.datasetIds[0] === dataset.id,
        )
        .map((result) => result.id),
    ).size
    return { entry, capability: learningModuleCapability(entry.id, cohort, NINJA_SKILLS_PROFILES['Grade 5'], visit) }
  })
}

export function recognitionReviewSection<Launch>(
  section: LearningHubSection<Launch | ExtraLaunch>,
  dataset: Dataset,
  completed: readonly BetaResult[] | null,
  childId: string,
): LearningHubSection<Launch | ExtraLaunch> {
  const dojo = section.id === 'homework'
  const ninja = section.id === 'test-review-1'
  const reading: LearningHubActivity<ExtraLaunch> = {
    id: dojo ? 'acquisition-reading' : 'review-reading-training',
    title: dojo ? 'Read the Words' : 'Return to Dojo · Reading',
    eyebrow: 'Reading · 50 words',
    description: 'Practise the cumulative recognition list. Your reading lesson resumes where you leave it.',
    icon: '🗣️',
    action: {
      kind: 'launch',
      label: dojo ? 'Read the Words' : 'Return to Dojo · Reading',
      launch: { previewAction: 'recognition-reading', channel: 'reading', datasets: [dataset] },
    },
  }
  const test: LearningHubActivity<ExtraLaunch> = {
    id: 'review-reading-test',
    title: 'Reading Test',
    eyebrow: 'November 2–6 · Recognition',
    description: 'Read all 50 words, then review your responses before submitting one final score.',
    icon: '🏆',
    action: {
      kind: 'launch',
      label: 'Reading Test',
      launch: { previewAction: 'test', channel: 'reading', datasets: [dataset] },
    },
  }
  const writing: LearningHubActivity<ExtraLaunch> = {
    id: 'acquisition-writing',
    title: 'Writing',
    eyebrow: 'Writing',
    description: 'Coming soon.',
    icon: '✍️',
    action: {
      kind: 'disabled',
      label: 'Coming soon',
      reason: 'Writing is not assigned for this cumulative recognition review.',
    },
  }
  const games: LearningHubActivity<ExtraLaunch>[] = dojo
    ? []
    : recognitionReviewGames(dataset, completed || [], childId).map(({ entry, capability }) => ({
        id: `preview-game-${entry.id}`,
        title: entry.title,
        eyebrow: 'Reading · Cumulative review',
        description: entry.description,
        icon: entry.icon,
        note: capability.status === 'ready' ? capability.pack.scopeNote : capability.reason,
        action:
          capability.status === 'ready' && completed !== null
            ? {
                kind: 'launch',
                label: entry.title,
                launch: {
                  previewAction: 'game',
                  pack: capability.pack,
                  channel: 'reading',
                  datasets: [dataset],
                  ...(!ninja ? { boss: true } : {}),
                },
              }
            : {
                kind: 'disabled',
                label: 'Temporarily unavailable',
                reason:
                  completed === null
                    ? 'Stored game history could not be checked. Keep your browser data and retry.'
                    : capability.status === 'unavailable'
                      ? capability.reason
                      : 'This game is unavailable.',
              },
      }))
  const activities: LearningHubActivity<Launch | ExtraLaunch>[] = dojo
    ? [reading, writing]
    : [...games, test, reading, writing]
  return {
    ...section,
    title: dojo ? 'Enter the Dojo' : ninja ? 'Practice Your Ninja Skills' : 'Final Boss Test',
    available: true,
    unavailableReason: undefined,
    subtitle: '50 cumulative reading words · November 2–6 recognition test',
    detailSubtitle: 'The same 50-word list in Dojo, Ninja Skills and Final Boss. Writing coming soon.',
    cohortPickerLabel: undefined,
    defaultCohortId: undefined,
    cohortSummaryLabel: 'Cumulative reading list',
    cohorts: [
      {
        id: dataset.id,
        label: dataset.dateRange,
        countLabel: '50 reading · Writing coming soon',
        groups: [{ label: 'Reading targets', words: dataset.vocabulary!.tier2.map((word) => word.text) }],
      },
    ],
    activities,
    showUngroupedActivities: true,
    activityGroups: dojo
      ? undefined
      : ninja
        ? [
            {
              id: 'ninja-more-activities',
              title: 'More activities',
              description: 'Reading practice and the full recognition test.',
              icon: '🥋',
              activityIds: [reading.id, test.id, writing.id],
            },
          ]
        : [
            {
              id: 'boss-test',
              title: 'Boss Test',
              description: 'Take the complete reading recognition test.',
              icon: '🏆',
              activityIds: [test.id, writing.id],
            },
            {
              id: 'boss-games',
              title: 'Boss Games',
              description: 'Play with the same 50 reading words.',
              icon: '🎮',
              activityIds: games.map((game) => game.id),
            },
            {
              id: 'boss-training',
              title: 'Need more training?',
              description: 'Return to reading practice.',
              icon: '🥋',
              activityIds: [reading.id],
            },
          ],
  }
}
