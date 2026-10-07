import type { AcquisitionProgressEnvelope } from '../acquisition/persistence/contracts.ts'
import { resolveAcquisitionLesson } from '../acquisition/persistence/lessonSnapshot.ts'
import { type CurriculumSnapshot, inspectSnapshot, validateCurriculum } from './curriculum.ts'
import type { BetaProfile } from './model.ts'

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>
export type LessonLaunch = {
  schema: 1
  childId: string
  grade: BetaProfile['grade']
  progressionId: string
  lessonFingerprint: string
  sourceHash: string
  sourceMetadata: Pick<CurriculumSnapshot, 'retrievedAt' | 'sourceModifiedAt'>
  week: string
  channel: 'writing' | 'reading'
}
export type SavedLessonLaunch = LessonLaunch & { source: CurriculumSnapshot }
const prefix = (childId: string) => `family-beta-activity:${childId}:lesson-launch-v1:`
const sourceKey = (childId: string, hash: string) => `family-beta-activity:${childId}:lesson-source-v1:${hash}`
const launchKey = (launch: LessonLaunch) =>
  `${prefix(launch.childId)}${launch.progressionId}:${launch.lessonFingerprint}`
const failure =
  'The saved lesson route could not be verified. Your progress has not been erased. Please report this problem.'

function confirmedWrite(storage: Store, key: string, raw: string) {
  const old = storage.getItem(key)
  if (old !== null && old !== raw) throw new Error(failure)
  if (old === null) storage.setItem(key, raw)
  if (storage.getItem(key) !== raw)
    throw new Error('The browser could not retain the lesson for reopening. Keep this browser’s data and retry.')
}

/** Called only with a checksum-validated source, before mounting its owned frame. */
export function cacheLessonSource(storage: Store, childId: string, snapshot: CurriculumSnapshot) {
  if (!/^[\w-]{1,160}$/.test(childId)) throw new Error(failure)
  // Stay below the existing opaque-sync record budget. Never truncate a source.
  // Retrieval metadata belongs to the lesson route, not the shared content
  // object: two devices fetching identical words at different times must write
  // identical source records, otherwise they create a false sync conflict.
  const key = sourceKey(childId, snapshot.contentSha256)
  const raw = JSON.stringify({
    schema: snapshot.schema,
    grade: snapshot.grade,
    sourceId: snapshot.sourceId,
    contentSha256: snapshot.contentSha256,
    payload: snapshot.payload,
  })
  if (new TextEncoder().encode(raw).byteLength > 650_000)
    throw new Error('This teacher source is too large to retain safely for reopening. No lesson was started.')
  confirmedWrite(storage, key, raw)
}

function verifyEnvelope(envelope: AcquisitionProgressEnvelope, profile: BetaProfile) {
  const snapshot = envelope.lessonSnapshot
  if (envelope.childId !== profile.id || envelope.grade !== profile.grade || !snapshot) throw new Error(failure)
  resolveAcquisitionLesson(envelope, {
    identity: {
      childId: envelope.childId,
      grade: envelope.grade,
      datasetId: envelope.datasetId,
      schoolYear: envelope.schoolYear,
      activityModule: envelope.activityModule,
      tier: envelope.tier,
    },
    lifecycleStage: { kind: 'acquisition' },
    applicationVersion: snapshot.applicationVersion,
    targetSet: snapshot.targetSet,
    strategy: snapshot.strategy,
  })
}

function sourceMatches(envelope: AcquisitionProgressEnvelope, source: CurriculumSnapshot, week: string) {
  const id = envelope.datasetId.replace(/^__kindergarten-lab__/, '')
  const candidate = inspectSnapshot(source).candidates.find(
    (c) => c.datasetId === id && c.normalizedStartDate === week && c.status === 'valid',
  )
  const words = envelope.tier === 'tier-1' ? candidate?.tier1 : candidate?.tier2
  const targets = envelope.lessonSnapshot!.targetSet.targets
  return (
    words?.length === targets.length &&
    words.every(
      (word, index) =>
        word.targetOccurrenceId === targets[index].id.replace(/^__kindergarten-lab__/, '') &&
        word.text === targets[index].text,
    )
  )
}

/** Additive navigation metadata; checkpoints and scores remain the authority. */
export function rememberLessonLaunch(
  storage: Store,
  profile: BetaProfile,
  envelope: AcquisitionProgressEnvelope,
  source: CurriculumSnapshot,
  week: string,
) {
  verifyEnvelope(envelope, profile)
  if (!['tier-1', 'tier-2'].includes(envelope.tier)) throw new Error(failure)
  // A calendar week can repeat an earlier cohort (notably Grade 5). Route by
  // the checkpoint's actual curriculum identity, not the wrapper's date label.
  const actualWeek =
    inspectSnapshot(source).candidates.find(
      (c) => c.datasetId === envelope.datasetId.replace(/^__kindergarten-lab__/, ''),
    )?.normalizedStartDate || week
  const launch: LessonLaunch = {
    schema: 1,
    childId: profile.id,
    grade: profile.grade,
    progressionId: envelope.id,
    lessonFingerprint: envelope.lessonSnapshot!.fingerprint,
    sourceHash: source.contentSha256,
    sourceMetadata: { retrievedAt: source.retrievedAt, sourceModifiedAt: source.sourceModifiedAt },
    week: actualWeek,
    channel: envelope.tier === 'tier-1' ? 'writing' : 'reading',
  }
  const old = storage.getItem(launchKey(launch))
  // Never replace an original route with a later teacher document. Its complete
  // source and live checkpoint are revalidated before it can be reopened.
  if (old !== null) return
  if (source.grade !== profile.grade || !sourceMatches(envelope, source, actualWeek)) throw new Error(failure)
  cacheLessonSource(storage, profile.id, source)
  confirmedWrite(storage, launchKey(launch), JSON.stringify(launch))
}

function currentEnvelope(storage: Store, launch: LessonLaunch): AcquisitionProgressEnvelope | undefined {
  const shared = storage.getItem(`family-beta-acquisition-v1:${launch.progressionId}`)
  if (shared) {
    const envelope = JSON.parse(shared).envelope
    if (!envelope) throw new Error(failure)
    return envelope
  }
  if (launch.grade !== 'Grade 2' || launch.channel !== 'writing') return undefined
  const raw = storage.getItem(`family-beta-activity:${launch.childId}:weekly-dictation-state-v2`)
  if (!raw) return undefined
  const matches =
    JSON.parse(raw).acquisitionProgressEnvelopes?.filter(
      (e: AcquisitionProgressEnvelope) => e.id === launch.progressionId,
    ) || []
  if (matches.length > 1) throw new Error(failure)
  return matches[0]
}

export async function readSavedLesson(
  storage: Store,
  profile: BetaProfile,
  launch: LessonLaunch,
): Promise<SavedLessonLaunch | null> {
  if (
    !launch ||
    launch.schema !== 1 ||
    launch.childId !== profile.id ||
    launch.grade !== profile.grade ||
    !/^[\w-]{1,200}$/.test(launch.progressionId) ||
    !/^[a-f0-9]{16}$/.test(launch.lessonFingerprint) ||
    !/^[a-f0-9]{64}$/.test(launch.sourceHash) ||
    !launch.sourceMetadata ||
    !Number.isFinite(Date.parse(launch.sourceMetadata.retrievedAt)) ||
    typeof launch.sourceMetadata.sourceModifiedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(launch.week) ||
    !['writing', 'reading'].includes(launch.channel)
  )
    throw new Error(failure)
  const envelope = currentEnvelope(storage, launch)
  if (!envelope) return null
  verifyEnvelope(envelope, profile)
  if (envelope.id !== launch.progressionId || launch.channel !== (envelope.tier === 'tier-1' ? 'writing' : 'reading'))
    throw new Error(failure)
  if (envelope.lessonSnapshot!.fingerprint !== launch.lessonFingerprint) return null
  const raw = storage.getItem(sourceKey(profile.id, launch.sourceHash))
  if (!raw) throw new Error(failure)
  const { snapshot } = await validateCurriculum(
    JSON.stringify({
      ...JSON.parse(raw),
      retrievedAt: launch.sourceMetadata.retrievedAt,
      sourceModifiedAt: launch.sourceMetadata.sourceModifiedAt,
    }),
    profile.grade,
  )
  if (snapshot.contentSha256 !== launch.sourceHash || !sourceMatches(envelope, snapshot, launch.week))
    throw new Error(failure)
  // Validation is asynchronous. A concurrent replacement must not turn
  // an obsolete launch button into a new lesson using the old source.
  const current = currentEnvelope(storage, launch)
  if (!current || current.lessonSnapshot?.fingerprint !== launch.lessonFingerprint) return null
  verifyEnvelope(current, profile)
  return { ...launch, source: snapshot }
}

export async function listSavedLessons(storage: Store, profile: BetaProfile) {
  const lessons: SavedLessonLaunch[] = []
  const warnings: string[] = []
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (key): key is string => !!key?.startsWith(prefix(profile.id)),
  )
  for (const key of keys) {
    try {
      const launch = JSON.parse(storage.getItem(key) || 'null') as LessonLaunch
      if (!launch || key !== launchKey(launch)) throw new Error(failure)
      const saved = await readSavedLesson(storage, profile, launch)
      if (saved) lessons.push(saved)
    } catch {
      warnings.push(failure)
    }
  }
  return { lessons: lessons.sort((a, b) => b.week.localeCompare(a.week)), warnings: [...new Set(warnings)] }
}
