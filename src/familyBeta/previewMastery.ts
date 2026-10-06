import type { Dataset, Word } from '../domain/contracts.ts'
import { createMasteryOccurrence } from '../warmup/adaptive/identity.ts'
import { integrateMasteryOccurrenceForChild } from '../warmup/adaptive/eligibility.ts'
import { materializeAdaptiveWarmupSelection } from '../warmup/adaptive/scheduler.ts'
import { applyAdaptiveWarmupAssessment } from '../warmup/adaptive/transitions.ts'
import { grade2Tier1WritingAdaptiveWarmupProfile } from '../warmup/adaptive/profiles/grade2.ts'
import type {
  AdaptiveWarmupProfile,
  ChildMasteryState,
  MasteryLifecycleAssignment,
  MasteryTermDefinition,
} from '../warmup/adaptive/contracts.ts'
import { channelWords, type PracticeChannel } from './gamePools.ts'

export type PreviewMasteryRecord = {
  schema: 1
  childId: string
  grade: string
  channel: PracticeChannel
  cycle: number
  states: ChildMasteryState[]
  applied: string[]
}
export function masteryStorageKey(childId: string, grade: string, channel: PracticeChannel) {
  return `family-beta-mastery-v1:${childId}:${grade}:${channel}`
}
export function previewMasteryProfile(grade: string, channel: PracticeChannel): AdaptiveWarmupProfile {
  // Explicit preview policy: use the established 16/6 allocation, 2-correct
  // Recent Entry, 3-correct recovery, and unique/exhaust-before-reuse rules.
  // This does not register a production policy or modify production state.
  return {
    ...grade2Tier1WritingAdaptiveWarmupProfile,
    id: `family-preview-${grade}-${channel}-warmup-v1`,
    grade,
    activityModule: channel === 'writing' ? 'mandarin-tier1-writing' : 'mandarin-tier2-reading',
  }
}
export function readMasteryRecord(
  storage: Storage,
  childId: string,
  grade: string,
  channel: PracticeChannel,
): PreviewMasteryRecord {
  const raw = storage.getItem(masteryStorageKey(childId, grade, channel))
  if (!raw) return { schema: 1, childId, grade, channel, cycle: 1, states: [], applied: [] }
  const value = JSON.parse(raw) as PreviewMasteryRecord
  const profile = previewMasteryProfile(grade, channel)
  if (
    value.schema !== 1 ||
    value.childId !== childId ||
    value.grade !== grade ||
    value.channel !== channel ||
    !Number.isInteger(value.cycle) ||
    value.cycle < 1 ||
    !Array.isArray(value.states) ||
    !Array.isArray(value.applied) ||
    !value.applied.every((id) => typeof id === 'string') ||
    !value.states.every(
      (state) =>
        state.version === 1 &&
        state.childId === childId &&
        typeof state.masteryTermId === 'string' &&
        ['recent-entry', 'needs-attention', 'mastery-rotation'].includes(state.bucket) &&
        Number.isInteger(state.consecutiveCorrect) &&
        state.consecutiveCorrect >= 0 &&
        state.schedulingProfile?.id === profile.id &&
        state.schedulingProfile.version === profile.version &&
        Array.isArray(state.integratedOccurrences),
    )
  )
    throw new Error('Mastery history could not be validated. It has not been reset.')
  return value
}
export function prepareMastery(
  record: PreviewMasteryRecord,
  datasets: Dataset[],
  mastered: Dataset[],
  date: string,
  random = Math.random,
) {
  const profile = previewMasteryProfile(record.grade, record.channel)
  const masteredIds = new Set(mastered.map((d) => d.id))
  const terms = new Map<string, MasteryTermDefinition>()
  const assignments: MasteryLifecycleAssignment[] = []
  const states = new Map(record.states.map((state) => [state.masteryTermId, state]))
  const words = new Map<string, Word>()
  for (const dataset of [...datasets].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    for (const word of channelWords(dataset, record.channel)) {
      const occurrence = createMasteryOccurrence({
        occurrenceId: word.id,
        wordId: word.id,
        datasetId: dataset.id,
        grade: dataset.grade,
        schoolYear: dataset.schoolYear,
        text: word.text,
        activityModule: profile.activityModule,
        tier: record.channel === 'writing' ? 'tier-1' : 'tier-2',
        language: 'mandarin',
      })
      const term = terms.get(occurrence.masteryTermId) || {
        id: occurrence.masteryTermId,
        identity: occurrence.identity,
        occurrences: [],
      }
      term.occurrences.push(occurrence)
      terms.set(term.id, term)
      words.set(word.id, word)
      const assignment: MasteryLifecycleAssignment = {
        occurrenceId: occurrence.occurrenceId,
        status: 'resolved',
        profileId: `preview-${record.grade}-source-lifecycle`,
        finalTestReviewCycle: record.grade === 'Grade 5' ? 2 : 1,
        stage:
          dataset.startDate > date
            ? { kind: 'future' }
            : masteredIds.has(dataset.id)
              ? { kind: 'mastery' }
              : { kind: 'acquisition' },
      }
      assignments.push(assignment)
      const integrated = integrateMasteryOccurrenceForChild({
        childId: record.childId,
        occurrence,
        profile,
        lifecycleAssignment: assignment,
        currentState: states.get(term.id),
      })
      if (integrated.state) states.set(term.id, integrated.state)
    }
  }
  const selection = materializeAdaptiveWarmupSelection({
    childId: record.childId,
    schoolYear: datasets[0]?.schoolYear || '2026–2027',
    visitType: 'standalone',
    profile,
    profileRegistry: {
      definitions: [profile],
      activeProfiles: [{ grade: record.grade, activityModule: profile.activityModule, profile }],
      upgrades: [],
    },
    terms: [...terms.values()],
    lifecycleAssignments: assignments,
    childStates: [...states.values()],
    rotationState: {
      version: 1,
      id: `preview:${record.childId}:${record.channel}`,
      childId: record.childId,
      activityModule: profile.activityModule,
      cycle: record.cycle,
    },
    random,
  })
  const selectedWords = selection.entries
    .map((entry) =>
      entry.occurrenceIds
        .map((id) => words.get(id))
        .find((word): word is Word => Boolean(word && masteredIds.has(word.datasetId))),
    )
    .filter((word): word is Word => Boolean(word))
  return {
    record: { ...record, cycle: selection.rotationCycle, states: [...states.values()] },
    profile,
    selection,
    words: selectedWords,
    terms: [...terms.values()],
    datasets,
    mastered,
    date,
  }
}
export function assessMastery(
  prepared: ReturnType<typeof prepareMastery>,
  targetId: string,
  correct: boolean,
  eventId: string,
  at = new Date().toISOString(),
) {
  if (prepared.record.applied.includes(eventId)) return prepared.record
  const entry = prepared.selection.entries.find((item) => item.occurrenceIds.includes(targetId))
  if (!entry) throw new Error('This word is outside the selected mastery queue.')
  return {
    ...prepared.record,
    applied: [...prepared.record.applied, eventId],
    states: prepared.record.states.map((state) =>
      state.masteryTermId === entry.masteryTermId
        ? applyAdaptiveWarmupAssessment(
            state,
            { outcome: correct ? 'correct' : 'incorrect', reviewedAt: at },
            prepared.record.cycle,
            prepared.profile,
          )
        : state,
    ),
  }
}
export function writeMasteryRecord(storage: Storage, record: PreviewMasteryRecord) {
  const key = masteryStorageKey(record.childId, record.grade, record.channel)
  const serialized = JSON.stringify(record)
  storage.setItem(key, serialized)
  if (storage.getItem(key) !== serialized) throw new Error('Mastery saving could not be confirmed.')
}

// Call under the per-child/channel Web Lock in the preview UI. Re-read inside
// the lock so another tab's assessments cannot be overwritten by an old visit.
export function persistMasteryAssessment(
  storage: Storage,
  prepared: ReturnType<typeof prepareMastery>,
  targetId: string,
  correct: boolean,
  eventId: string,
) {
  const current = readMasteryRecord(storage, prepared.record.childId, prepared.record.grade, prepared.record.channel)
  if (current.applied.includes(eventId)) return current
  const refreshed = prepareMastery(current, prepared.datasets, prepared.mastered, prepared.date)
  const record = assessMastery(
    { ...prepared, record: { ...refreshed.record, cycle: Math.max(current.cycle, prepared.record.cycle) } },
    targetId,
    correct,
    eventId,
  )
  writeMasteryRecord(storage, record)
  return record
}
