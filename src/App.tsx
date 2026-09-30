import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowLeft, BarChart3, Check, ChevronDown, Clock3, History, Home, Languages, LogOut,
  Sparkles, X,
} from 'lucide-react'
import {
  APP_STATE_KEY, AUDIO_PAUSE_MS, activePracticeWord, audioPartsForWord, type AppState, type Dataset, type DatasetLifecycle, type DatasetScore,
  commitCompletedSession, commitPartialSession, commitSkippedTestReview, createInitialState, createPracticeSessionForTarget, revealAcquisitionPrompt,
  filterDatasetsForChild, latestScore, loadState, localDateKey, createSessionId, requireDatasetLifecycle, resolveDatasetLifecycles, sortDatasetsNewestFirst, shouldSuggestGradePromotion, nextGrade, type LifecyclePhase,
  type PracticeSession, type PracticeTarget, type SessionAnswer, type Word, LEGACY_ATTEMPTS_KEY,
} from './domain'
import { acquisitionPersistenceContext, applyAcquisitionCheckpointToAppState, createAcquisitionAnswerCheckpoint, createAcquisitionResumeCheckpoint, markAcquisitionCheckpointCommitted, prepareAcquisitionProgress, recoverAcquisitionCheckpoints, sessionAnswerForCheckpoint } from './application/acquisitionPersistence.ts'
import { applyWarmupTransitionToAppState, cloudWarmupSeedForVisit, createWarmupAnswerCheckpoint, createWarmupFinalizationCheckpoint, markWarmupTransitionCommitted, prepareAdaptiveWarmupVisit, recoverWarmupTransitions, revalidateWarmupVisitBeforePresentation, synchronizeAdaptiveWarmupCloud, wordsForWarmupVisit, type WarmupGraphPoint } from './application/warmup/index.ts'
import { authErrorMessage, sendPasswordResetEmail, signIn, signOut, signUp, subscribeAuth, type AuthState } from './firebaseClient'
import { firebaseConfigReady, firebaseSetupMessage, DEFAULT_GRADE, DEFAULT_SCHOOL_YEAR, productionSourceIsActive } from './config'
import { abandonSession, cloudAcquisitionCheckpointAlreadyCommitted, cloudAdaptiveStateForSave, cloudDataToAppState, cloudWarmupTransitionAlreadyCommitted, commitCloudAcquisitionCheckpoint, commitCloudWarmupTransition, completeCloudSession, createChild, ensureCloudWarmupSeed, ensureParentFamily, finishCloudSession, getCloudAdaptiveState, listAcquisitionProgressions, listAttempts, listChildren, listDatasetWords, listDatasets, listDistractorTargetObservations, listScores, listSessions, listWarmupAttempts, listWarmupGraphPoints, listWarmupMastery, listWarmupQueueEntries, listWarmupRotations, listWarmupTransitions, listWarmupVisits, saveCloudAdaptiveState, saveCloudAttempt, skipCloudTestReview, startCloudSession, updateChild, updateCloudSession, type ChildProfile, type CloudAttempt, type CloudSession, type FamilyRecord } from './firestoreClient'
import { appendPendingAcquisitionCheckpoint, readPendingAcquisitionJournal, removePendingAcquisitionCheckpoint } from './persistence/acquisitionPendingJournal.ts'
import { appendPendingWarmupTransition, readPendingWarmupJournal, removePendingWarmupTransition } from './persistence/warmup/pendingJournal.ts'
import { hydrateLocalStateFromJson } from './localHydration'
import { PracticeView } from './practice/PracticeView'
import { WarmupProgressGraph } from './progress/WarmupProgressGraph.tsx'
import { practiceProfileForGrade } from './practice/profiles/registry'
import type { WritingPracticeProfile } from './practice/profiles/model'
import { practiceTargetsForLifecycle } from './practice/targets'
import { lifecycleStrategyForGradeAndSchoolYear } from './lifecycle/registry'
import { Tier2ReadingPractice, type Tier2ReadingPracticeSummary } from './readingPractice/Tier2ReadingPractice'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway } from './tier2/contracts'
import { resolveTier2ReadingLifecycle } from './tier2/lifecycle'
import { tier2ReadingPathwayTargets } from './tier2/pathway'
import { tier2ReadingProfileForScope } from './tier2/registry'

type View = 'home' | 'practice' | 'reading' | 'history'
type Child = ChildProfile & { name: string; color: string; initials: string }
type AppClock = () => Date

const demoChildren: Child[] = [
  { id: 'rhys', name: 'Rhys', nickname: 'Rhys', grade: 'Grade 2', schoolYear: '2026–2027', active: true, gradeEffectiveDate: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', color: 'coral', initials: 'R' },
  { id: 'eli', name: 'Eli', nickname: 'Eli', grade: 'Grade 2', schoolYear: '2026–2027', active: true, gradeEffectiveDate: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', color: 'blue', initials: 'E' },
]

const REVIEW_INSTRUCTION = 'If you cheat, you are just cheating yourself. Answer whether you got it right or wrong honestly, to improve your score.'

function localStorageGet(key: string) { try { return window.localStorage.getItem(key) } catch { return null } }
function localStorageSet(key: string, value: string) { try { window.localStorage.setItem(key, value); return true } catch { return false } }
function loadLocalApplicationState() {
  const loaded = loadState(localStorageGet(APP_STATE_KEY), localStorageGet(LEGACY_ATTEMPTS_KEY))
  const acquisitionJournal = readPendingAcquisitionJournal(window.localStorage)
  let recoveredState = loaded
  const recoveredAcquisitionTransitionIds: string[] = []
  const recoveredWarmupTransitionIds: string[] = []
  if (!acquisitionJournal.error && acquisitionJournal.entries.length > 0) {
    const recovered = recoverAcquisitionCheckpoints(recoveredState, acquisitionJournal.entries)
    if (recovered.status === 'recovered') {
      recoveredState = recovered.state
      recoveredAcquisitionTransitionIds.push(...recovered.recoveredTransitionIds)
    }
  }
  const warmupJournal = readPendingWarmupJournal(window.localStorage)
  if (!warmupJournal.error && warmupJournal.entries.length > 0) {
    const recovered = recoverWarmupTransitions(recoveredState, warmupJournal.entries)
    if (recovered.status === 'recovered') {
      recoveredState = recovered.state
      recoveredWarmupTransitionIds.push(...recovered.recoveredTransitionIds)
    }
  }
  const saved = localStorageSet(APP_STATE_KEY, JSON.stringify(recoveredState))
  if (saved) {
    for (const transitionId of recoveredAcquisitionTransitionIds) removePendingAcquisitionCheckpoint(window.localStorage, transitionId)
    for (const transitionId of recoveredWarmupTransitionIds) removePendingWarmupTransition(window.localStorage, transitionId)
  }
  return recoveredState
}
type SpeechPart = { text: string; rate: number; lang?: string }
let stopActiveSpeech: (() => void) | null = null

function playSpeechSequence(parts: SpeechPart[], pauseMs = AUDIO_PAUSE_MS) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
  stopActiveSpeech?.(); window.speechSynthesis.cancel(); window.speechSynthesis.resume()
  let partIndex = 0; let pauseTimer: number | undefined; let voiceTimer: number | undefined; let cancelled = false
  let waitingForVoices = false
  const speech = window.speechSynthesis
  const removeVoiceListener = () => {
    if (waitingForVoices) speech.removeEventListener('voiceschanged', startWhenReady)
    waitingForVoices = false
    if (voiceTimer) window.clearTimeout(voiceTimer)
  }
  const playNext = () => {
    if (cancelled || partIndex >= parts.length) return
    const part = parts[partIndex]; partIndex += 1
    const utterance = new SpeechSynthesisUtterance(part.text); const language = part.lang || 'zh-CN'
    utterance.lang = language; utterance.rate = part.rate; utterance.pitch = 1
    const voice = speech.getVoices().find((item) => item.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()))
    if (voice) utterance.voice = voice
    utterance.onend = () => { if (!cancelled && partIndex < parts.length) pauseTimer = window.setTimeout(playNext, pauseMs) }
    utterance.onerror = () => { if (!cancelled) playNext() }
    speech.resume(); speech.speak(utterance)
  }
  function startWhenReady() {
    if (cancelled) return
    removeVoiceListener()
    playNext()
  }
  if (speech.getVoices().length === 0) {
    waitingForVoices = true
    speech.addEventListener('voiceschanged', startWhenReady)
    voiceTimer = window.setTimeout(startWhenReady, 300)
  } else {
    playNext()
  }
  const stop = () => { cancelled = true; removeVoiceListener(); if (pauseTimer) window.clearTimeout(pauseTimer); speech.cancel(); if (stopActiveSpeech === stop) stopActiveSpeech = null }
  stopActiveSpeech = stop
  return stop
}

function speakWord(word: Word, warmup: boolean) { return playSpeechSequence(audioPartsForWord(word, warmup)) }
function speakReviewInstruction() { return playSpeechSequence([{ text: REVIEW_INSTRUCTION, rate: 0.9, lang: 'en-GB' }], 0) }
function lifecycleLabel(lifecycle: DatasetLifecycle) { return lifecycle === 'acquisition' ? 'Acquisition' : lifecycle === 'test-review' ? 'Test Review' : lifecycle === 'future' ? 'Future' : lifecycle === 'no-instruction' ? 'Writing Workshop' : 'Mastered' }
function phaseLabel(phase: LifecyclePhase) { return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition' }
function readingPathwayLabel(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'acquisition') return 'Learn to Read'
  if (pathway.kind === 'mastery') return 'Reading Mastery'
  return pathway.cycle && pathway.cycle > 1 ? `Reading Test Review ${pathway.cycle}` : 'Reading Test Review'
}

function unlockSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.resume()
}

export function App({ now = () => new Date(), manualTestDateLabel }: { now?: AppClock; manualTestDateLabel?: string }) {
  const [auth, setAuth] = useState<AuthState>(() => firebaseConfigReady ? { status: 'loading', user: null, error: null } : { status: 'unconfigured', user: null, error: null })
  useEffect(() => subscribeAuth(setAuth), [])
  const content = auth.status === 'loading'
    ? <div className="auth-shell"><div className="auth-card"><Sparkles size={28} /><h1>Loading Weekly Dictation</h1><p>Checking your secure family session…</p></div></div>
    : firebaseConfigReady && auth.status === 'signed-out'
      ? <AuthScreen />
      : <AuthenticatedApp auth={auth} now={now} />
  return <>{manualTestDateLabel && <div className="manual-test-date-banner" role="status">{manualTestDateLabel}<span>Development only</span></div>}{content}</>
}

function AuthenticatedApp({ auth, now }: { auth: AuthState; now: AppClock }) {
  const [view, setView] = useState<View>('home')
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [familyChildren, setFamilyChildren] = useState<Child[]>(firebaseConfigReady ? [] : demoChildren)
  const [selectedChildId, setSelectedChildId] = useState(() => localStorageGet('weekly-dictation-child') || demoChildren[0].id)
  const [state, setState] = useState<AppState>(() => firebaseConfigReady ? createInitialState() : loadLocalApplicationState())
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [readingPathway, setReadingPathway] = useState<Tier2ReadingPathway | null>(null)
  const completedSessionRef = useRef<string | null>(null)
  const cloudSessionsRef = useRef(new Map<string, CloudSession>())
  const [showChildMenu, setShowChildMenu] = useState(false); const [showProfiles, setShowProfiles] = useState(false); const [completedSummary, setCompletedSummary] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(Boolean(auth.user))
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [localImportMessage, setLocalImportMessage] = useState<string | null>(null)
  const [localImportError, setLocalImportError] = useState<string | null>(null)
  const selectedChild = familyChildren.find((child) => child.id === selectedChildId) || familyChildren.find((child) => child.active) || familyChildren[0]
  const practiceProfile = productionSourceIsActive(selectedChild?.grade, selectedChild?.schoolYear)
    ? practiceProfileForGrade(selectedChild?.grade)
    : null
  const lifecycleStrategy = lifecycleStrategyForGradeAndSchoolYear(selectedChild?.grade, selectedChild?.schoolYear)
  const readingProfile = productionSourceIsActive(selectedChild?.grade, selectedChild?.schoolYear)
    ? tier2ReadingProfileForScope(selectedChild?.grade, lifecycleStrategy?.schoolYearKey)
    : null
  const primaryDatasets = useMemo(() => selectedChild ? filterDatasetsForChild(state.datasets, selectedChild.grade, selectedChild.schoolYear) : [], [selectedChild, state.datasets])
  const currentDate = now(); const currentDateKey = localDateKey(currentDate)
  const lifecycleResolution = useMemo(() => lifecycleStrategy ? resolveDatasetLifecycles(primaryDatasets, currentDate) : null, [lifecycleStrategy, primaryDatasets, currentDateKey])
  const readingLifecycle = useMemo(() => selectedChild && readingProfile ? resolveTier2ReadingLifecycle(
    readingProfile,
    {
      scope: {
        grade: selectedChild.grade,
        schoolYearKey: readingProfile.schoolYearKey,
        currentDateKey,
      },
      sets: primaryDatasets.map((dataset) => ({
        datasetId: dataset.id,
        grade: dataset.grade,
        schoolYearKey: readingProfile.schoolYearKey,
        activationDate: dataset.startDate,
        instructionalEndDate: dataset.endDate,
        kind: dataset.isWritingWorkshop ? 'no-instruction' : 'vocabulary',
      })),
      progressionEvents: [],
    },
    primaryDatasets,
  ) : null, [selectedChild, readingProfile, primaryDatasets, currentDateKey])
  const primaryChoices = (lifecycleResolution ? practiceTargetsForLifecycle(lifecycleResolution) : [])
    .filter((choice) => Boolean(practiceProfile && choice.dataset.words.length > 0 && !choice.dataset.isWritingWorkshop))
  const warmupPreview = useMemo(() => selectedChild && practiceProfile && lifecycleResolution ? prepareAdaptiveWarmupVisit({ state, childId: selectedChild.id, grade: selectedChild.grade, schoolYear: selectedChild.schoolYear, datasets: primaryDatasets, lifecycleResolution, visitType: 'standalone', visitId: 'warmup-preview-only', createdAt: currentDate.toISOString(), random: () => 0.999 }) : null, [selectedChild, practiceProfile, primaryDatasets, state, currentDateKey, lifecycleResolution])
  const warmupWordCount = warmupPreview?.status === 'ready' ? warmupPreview.visit.assignedQueueSize : 0
  const promotionSuggested = Boolean(selectedChild && shouldSuggestGradePromotion(selectedChild, currentDate))

  useEffect(() => { localStorageSet('weekly-dictation-child', selectedChildId) }, [selectedChildId])
  useEffect(() => { if (!auth.user) localStorageSet(APP_STATE_KEY, JSON.stringify(state)) }, [state, auth.user])

  useEffect(() => {
    if (!auth.user) return
    let cancelled = false
    setDataLoading(true); setCloudError(null)
    void ensureParentFamily(auth.user).then(async ({ family: loadedFamily }) => {
      const rawChildren = await listChildren(loadedFamily.id)
      if (cancelled) return
      const mapped = rawChildren.map((child, index) => ({ ...child, name: child.nickname, color: index % 2 ? 'blue' : 'coral', initials: child.nickname.slice(0, 1).toUpperCase() }))
      setFamily(loadedFamily); setFamilyChildren(mapped); if (mapped.length && !mapped.some((child) => child.id === selectedChildId)) setSelectedChildId(mapped.find((child) => child.active)?.id || mapped[0].id)
    }).catch((error) => { if (!cancelled) setCloudError(authErrorMessage(error)) }).finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [auth.user?.uid])

  useEffect(() => {
    if (!auth.user || !family || !selectedChild) return
    let cancelled = false
    setDataLoading(true)
    void Promise.all([listDatasets(), listSessions(family.id, selectedChild.id), listScores(family.id, selectedChild.id), getCloudAdaptiveState(family.id, selectedChild.id), listAcquisitionProgressions(family.id, selectedChild.id), listDistractorTargetObservations(family.id, selectedChild.id), listWarmupVisits(family.id, selectedChild.id), listWarmupQueueEntries(family.id, selectedChild.id), listWarmupMastery(family.id, selectedChild.id), listWarmupTransitions(family.id, selectedChild.id), listWarmupAttempts(family.id, selectedChild.id), listWarmupGraphPoints(family.id, selectedChild.id), listWarmupRotations(family.id, selectedChild.id)]).then(async ([rawDatasets, sessions, scores, adaptiveState, progressions, dtObservations, cloudWarmupVisits, cloudWarmupQueueEntries, warmupMastery, warmupTransitions, warmupAttempts, warmupGraphPoints, warmupRotations]) => {
      const datasets = await Promise.all(rawDatasets.map(async (dataset) => dataset.words?.length ? dataset : { ...dataset, words: await listDatasetWords(dataset.id) }))
      const readableSessions = sessions.filter((item) => item.status !== 'abandoned')
      const attempts = (await Promise.all(readableSessions.map((item) => listAttempts(family.id, selectedChild.id, item.id)))).flat()
      await Promise.all(readableSessions.filter((item) => item.status === 'in_progress').map((item) => item.primaryPhase === 'acquisition' ? updateCloudSession(family.id, selectedChild.id, item, { status: 'partial' }) : abandonSession(family.id, selectedChild.id, item)))
      if (cancelled) return
      let hydrated: AppState = cloudDataToAppState(datasets, scores, readableSessions, attempts.filter((item) => item.completionStatus === 'complete'), selectedChild.id, selectedChild.grade, adaptiveState, progressions, dtObservations, selectedChild.schoolYear)
      const scopedDatasets = filterDatasetsForChild(datasets, selectedChild.grade, selectedChild.schoolYear)
      const pendingJournal = readPendingAcquisitionJournal(window.localStorage)
      if (pendingJournal.error) throw new Error(pendingJournal.error)
      const childPending = pendingJournal.entries
        .filter((entry) => entry.baseEnvelope.childId === selectedChild.id)
        .sort((left, right) => left.checkpoint.expectedRevision - right.checkpoint.expectedRevision || left.checkpoint.transitionId.localeCompare(right.checkpoint.transitionId))
      for (const entry of childPending) {
        const checkpoint = entry.checkpoint
        if (await cloudAcquisitionCheckpointAlreadyCommitted(family.id, selectedChild.id, checkpoint)) {
          removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
          hydrated = markAcquisitionCheckpointCommitted(hydrated, checkpoint.transitionId)
          continue
        }
        const recovered = recoverAcquisitionCheckpoints(hydrated, [entry])
        if (recovered.status === 'blocked') throw new Error(`Pending Acquisition transition could not be restored: ${recovered.reason}`)
        const envelope = (recovered.state.acquisitionProgressEnvelopes || []).find((item) => item.id === checkpoint.progressionId)
        if (!envelope) throw new Error(`Pending Acquisition transition ${checkpoint.transitionId} did not restore its progression.`)
        await commitCloudAcquisitionCheckpoint(family.id, selectedChild.id, envelope, checkpoint)
        removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
        hydrated = markAcquisitionCheckpointCommitted(recovered.state, checkpoint.transitionId)
      }
      if (lifecycleStrategyForGradeAndSchoolYear(selectedChild.grade, selectedChild.schoolYear)) {
        const pendingWarmupJournal = readPendingWarmupJournal(window.localStorage)
        if (pendingWarmupJournal.error) throw new Error(pendingWarmupJournal.error)
        hydrated = await synchronizeAdaptiveWarmupCloud({
          state: hydrated,
          childId: selectedChild.id,
          grade: selectedChild.grade,
          schoolYear: selectedChild.schoolYear,
          datasets: scopedDatasets,
          lifecycleResolution: resolveDatasetLifecycles(scopedDatasets, now()),
          records: { visits: cloudWarmupVisits, queueEntries: cloudWarmupQueueEntries, mastery: warmupMastery, receipts: warmupTransitions, attempts: warmupAttempts, graphPoints: warmupGraphPoints, rotations: warmupRotations },
          pending: pendingWarmupJournal.entries,
          hydratedAt: now().toISOString(),
          transport: {
            transitionAlreadyCommitted: (transition) => cloudWarmupTransitionAlreadyCommitted(family.id, selectedChild.id, transition),
            ensureSeed: (visit, mastery, rotations) => ensureCloudWarmupSeed(family.id, selectedChild.id, visit, mastery, rotations),
            commitTransition: (transition) => commitCloudWarmupTransition(family.id, selectedChild.id, transition),
            acknowledgeTransition: (transitionId) => removePendingWarmupTransition(window.localStorage, transitionId),
          },
        })
      }
      if (cancelled) return
      setState(hydrated)
    }).catch((error) => { if (!cancelled) setCloudError(authErrorMessage(error)) }).finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [auth.user?.uid, family?.id, selectedChild?.id, selectedChild?.grade, selectedChild?.schoolYear])

  const chooseChild = (childId: string) => { setSelectedChildId(childId); setShowChildMenu(false); setShowProfiles(false); setSession(null); setReadingPathway(null); setView('home') }
  const confirmPromotion = async () => {
    if (!selectedChild) return
    const promoted = nextGrade(selectedChild.grade); if (!promoted) return
    if (family) { const updated = await updateChild(family.id, selectedChild.id, { grade: promoted, schoolYear: DEFAULT_SCHOOL_YEAR, gradeEffectiveDate: currentDateKey }); setFamilyChildren((items) => items.map((item) => item.id === selectedChild.id ? { ...item, ...updated, name: updated.nickname, initials: updated.nickname.slice(0, 1).toUpperCase() } : item)) }
    else setFamilyChildren((items) => items.map((item) => item.id === selectedChild.id ? { ...item, grade: promoted, schoolYear: DEFAULT_SCHOOL_YEAR, gradeEffectiveDate: currentDateKey } : item))
  }
  const startPractice = useCallback(async (target: PracticeTarget | null) => {
    if (!selectedChild || !lifecycleResolution) return
    const id = createSessionId()
    const startedDate = now()
    const startedAt = startedDate.toISOString()
    const associatedPrimaryActivity = target ? { phase: target.phase, datasetId: target.dataset.id, ...(target.reviewGroupId ? { reviewGroupId: target.reviewGroupId } : {}) } : undefined
    const preparedWarmup = prepareAdaptiveWarmupVisit({
      state,
      childId: selectedChild.id,
      grade: selectedChild.grade,
      schoolYear: selectedChild.schoolYear,
      datasets: primaryDatasets,
      lifecycleResolution,
      visitType: target ? 'pre-activity' : 'standalone',
      visitId: `${id}-warmup`,
      createdAt: startedAt,
      associatedPrimaryActivity,
    })
    if (preparedWarmup.status === 'blocked') {
      setState(preparedWarmup.state)
      setCloudError(`Adaptive Warmup needs review before practice can continue: ${preparedWarmup.reason}`)
      return
    }
    if (auth.user && family) {
      try {
        const seed = cloudWarmupSeedForVisit(preparedWarmup.state, preparedWarmup.visit)
        await ensureCloudWarmupSeed(family.id, selectedChild.id, preparedWarmup.visit, seed.mastery, seed.rotations)
      } catch (error) {
        setCloudError(`Warmup could not start because its initial state was not saved safely: ${authErrorMessage(error)}`)
        return
      }
    }
    const revalidatedWarmup = revalidateWarmupVisitBeforePresentation(preparedWarmup.state, preparedWarmup.visit.id, startedAt, false)
    if (!revalidatedWarmup.visit || revalidatedWarmup.reason) {
      setCloudError(`Adaptive Warmup could not be safely opened: ${revalidatedWarmup.reason || 'The saved visit is unavailable.'}`)
      return
    }
    let revalidationBaseVisit = preparedWarmup.visit
    for (const transition of revalidatedWarmup.transitions) {
      try {
        appendPendingWarmupTransition(window.localStorage, transition, revalidationBaseVisit)
        if (auth.user && family) {
          await commitCloudWarmupTransition(family.id, selectedChild.id, transition)
          removePendingWarmupTransition(window.localStorage, transition.transitionId)
        } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(revalidatedWarmup.state))) {
          removePendingWarmupTransition(window.localStorage, transition.transitionId)
        } else {
          throw new Error('The browser could not save the eligibility update.')
        }
      } catch (error) {
        setCloudError(`Warmup cannot open until its eligibility update is saved: ${authErrorMessage(error)}`)
        return
      }
      revalidationBaseVisit = transition.nextVisit
    }
    const warmupVisit = revalidatedWarmup.visit
    let warmupWords
    try {
      warmupWords = wordsForWarmupVisit(revalidatedWarmup.state, warmupVisit)
    } catch (error) {
      setCloudError(`Adaptive Warmup could not safely load its saved queue: ${authErrorMessage(error)}`)
      return
    }
    if (!target && warmupVisit.assignedQueueSize === 0) return
    const primaryDatasetId = target?.dataset.id || warmupWords[0]?.datasetId || 'warmup-only'
    const primaryPhase = target?.phase || 'acquisition'
    const warmupOnly = !target
    let nextState = revalidatedWarmup.state
    let preparedAcquisition = target?.phase === 'acquisition'
      ? prepareAcquisitionProgress(nextState, selectedChild.id, target.dataset, startedAt)
      : null
    if (preparedAcquisition?.status === 'blocked') {
      setState(preparedAcquisition.state)
      setCloudError(`Saved Acquisition progress needs review before practice can continue: ${preparedAcquisition.reason}`)
      return
    }
    if (preparedAcquisition) nextState = preparedAcquisition.state
    if (!auth.user && preparedAcquisition && !localStorageSet(APP_STATE_KEY, JSON.stringify(nextState))) {
      setCloudError('Acquisition cannot start because this browser could not save its initial progress record.')
      return
    }
    if (auth.user && family) {
      try {
        const cloud = await startCloudSession(family.id, selectedChild.id, { id, childId: selectedChild.id, sessionDate: startedAt, localDate: localDateKey(startedDate), startedAt, primaryPhase, datasetId: primaryDatasetId, datasetIds: target?.reviewDatasets?.map((dataset) => dataset.id), reviewGroupId: target?.reviewGroupId, warmupOnly, warmupStatus: 'in_progress' })
        cloudSessionsRef.current.set(id, cloud)
      } catch (error) { setCloudError(`Practice could not be saved: ${authErrorMessage(error)}`); return }
    }
    if (preparedAcquisition?.status === 'ready'
      && preparedAcquisition.envelope.status === 'teaching-complete'
      && preparedAcquisition.envelope.flow.mode === 'teaching') {
      const checkpoint = createAcquisitionResumeCheckpoint({ envelope: preparedAcquisition.envelope, context: preparedAcquisition.context, sessionId: id, occurredAt: startedAt })
      try {
        appendPendingAcquisitionCheckpoint(window.localStorage, checkpoint, preparedAcquisition.envelope)
      } catch (error) {
        setCloudError(`Acquisition cannot resume until its recovery journal is available: ${authErrorMessage(error)}`)
        return
      }
      const applied = applyAcquisitionCheckpointToAppState(nextState, checkpoint, preparedAcquisition.context, Boolean(auth.user && family))
      if (applied.status === 'conflict') {
        removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
        setCloudError(`Acquisition could not resume safely: ${applied.reason}`)
        return
      }
      nextState = applied.state
      preparedAcquisition = { ...preparedAcquisition, state: applied.state, envelope: applied.envelope }
      if (auth.user && family) {
        try {
          await commitCloudAcquisitionCheckpoint(family.id, selectedChild.id, applied.envelope, checkpoint)
          removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
          nextState = markAcquisitionCheckpointCommitted(nextState, checkpoint.transitionId)
        } catch (error) {
          setCloudError(`Acquisition resume is saved on this device and will retry: ${authErrorMessage(error)}`)
        }
      } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(nextState))) {
        removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
      } else {
        setCloudError('Acquisition resume is preserved in the recovery journal and will retry when the app reopens.')
      }
    }
    setState(nextState)
    completedSessionRef.current = null
    setCompletedSummary(null)
    const warmupSelectionForSession = {
      words: warmupWords,
      randomRotationWordIds: warmupVisit.queue.filter((entry) => entry.sourceBucket === 'mastery-rotation').map((entry) => entry.prompt.wordId),
      recentReviewWordIds: warmupVisit.queue.filter((entry) => entry.sourceBucket === 'recent-entry').map((entry) => entry.prompt.wordId),
      erroredWordIds: warmupVisit.queue.filter((entry) => entry.sourceBucket === 'needs-attention').map((entry) => entry.prompt.wordId),
      rotationCycleId: warmupVisit.rotationCycle,
    }
    const practiceSession = createPracticeSessionForTarget({ id, childId: selectedChild.id, grade: selectedChild.grade, target, warmup: warmupSelectionForSession, startedAt, cloudSessionId: auth.user ? id : undefined, preparedAcquisitionProgress: preparedAcquisition?.status === 'ready' ? preparedAcquisition.envelope.flow : undefined })
    setSession({ ...practiceSession, adaptiveWarmupVisitId: warmupVisit.id, warmupResumePosition: warmupVisit.nextPosition, index: warmupVisit.nextPosition })
    setView('practice')
  }, [auth.user, family, lifecycleResolution, now, primaryDatasets, selectedChild, state])
  const leavePractice = (nextView: View) => {
    const current = session
    let nextState = state
    if (current?.adaptiveWarmupVisitId && current.segment === 'warmup') {
      const visit = (state.warmupVisitsV1 || []).find((candidate) => candidate.id === current.adaptiveWarmupVisitId)
      if (visit?.status === 'in-progress' && visit.attemptedCount > 0) {
        try {
          const checkpoint = createWarmupFinalizationCheckpoint({ state, visitId: visit.id, operation: 'finalize-partial', occurredAt: now().toISOString() })
          const { transition } = checkpoint
          appendPendingWarmupTransition(window.localStorage, transition, checkpoint.baseVisit)
          const applied = applyWarmupTransitionToAppState(state, transition, Boolean(auth.user && family))
          if (applied.status === 'applied') {
            nextState = applied.state
            if (auth.user && family && selectedChild) {
              void commitCloudWarmupTransition(family.id, selectedChild.id, transition).then(() => {
                removePendingWarmupTransition(window.localStorage, transition.transitionId)
                setState((existing) => markWarmupTransitionCommitted(existing, transition.transitionId))
              }).catch((error) => setCloudError(`Partial Warmup progress is saved on this device and will retry: ${authErrorMessage(error)}`))
            } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(nextState))) removePendingWarmupTransition(window.localStorage, transition.transitionId)
          }
        } catch (error) { setCloudError(`Partial Warmup progress is preserved for recovery: ${authErrorMessage(error)}`) }
      }
    }
    if (nextState !== state) setState(nextState)
    if (auth.user && family && current?.cloudSessionId && selectedChild) { const cloud = cloudSessionsRef.current.get(current.cloudSessionId); if (cloud) { const request = current.primaryPhase === 'acquisition' ? updateCloudSession(family.id, selectedChild.id, cloud, { status: 'partial' }) : abandonSession(family.id, selectedChild.id, cloud); void request.catch((error) => setCloudError(authErrorMessage(error))) } }
    setSession(null); setView(nextView)
  }
  const exitPractice = () => leavePractice('home')
  const startReading = (pathway: Tier2ReadingPathway) => {
    setCompletedSummary(null)
    setReadingPathway(pathway)
    setView('reading')
  }
  const finishReading = (summary: Tier2ReadingPracticeSummary) => {
    setCompletedSummary(`Reading practice complete: ${summary.correct}/${summary.attempted} assessed responses marked correct. This prototype reading visit was not saved.`)
    setReadingPathway(null)
    setView('home')
  }
  const primaryStartState = (current: PracticeSession): PracticeSession => current.primaryQueue.length === 0
    ? { ...current, segment: 'primary', stage: 'complete', queue: [], index: 0 }
    : current.acquisition?.prompt
      ? { ...current, segment: 'primary', stage: 'dictation', queue: [current.acquisition.prompt.word], index: 0 }
      : { ...current, segment: 'primary', stage: 'interstitial', queue: current.primaryQueue, index: 0 }
  const beginWarmup = () => { unlockSpeech(); setSession((current) => {
    if (!current || current.stage !== 'warmup-intro') return current
    if (current.queue.length === 0) return primaryStartState(current)
    return { ...current, stage: 'interstitial', index: current.warmupResumePosition || 0 }
  }) }
  const skipWarmup = () => setSession((current) => {
    if (!current || current.stage !== 'warmup-intro' || current.warmupOnly) return current
    if (current.adaptiveWarmupVisitId) {
      const visit = (state.warmupVisitsV1 || []).find((candidate) => candidate.id === current.adaptiveWarmupVisitId)
      if (!visit) return current
      try {
        const checkpoint = createWarmupFinalizationCheckpoint({ state, visitId: visit.id, operation: 'skip', occurredAt: now().toISOString() })
        const { transition } = checkpoint
        appendPendingWarmupTransition(window.localStorage, transition, checkpoint.baseVisit)
        const applied = applyWarmupTransitionToAppState(state, transition, Boolean(auth.user && family))
        if (applied.status !== 'applied') throw new Error(applied.status === 'conflict' ? applied.reason : 'Warmup skip was already applied.')
        setState(applied.state)
        if (auth.user && family && selectedChild) {
          void commitCloudWarmupTransition(family.id, selectedChild.id, transition).then(() => {
            removePendingWarmupTransition(window.localStorage, transition.transitionId)
            setState((existing) => markWarmupTransitionCommitted(existing, transition.transitionId))
          }).catch((error) => setCloudError(`Warmup skip is saved on this device and will retry: ${authErrorMessage(error)}`))
        } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(applied.state))) removePendingWarmupTransition(window.localStorage, transition.transitionId)
      } catch (error) {
        setCloudError(`Warmup could not be skipped safely: ${authErrorMessage(error)}`)
        return current
      }
    }
    if (auth.user && family && selectedChild && current.cloudSessionId) {
      const cloud = cloudSessionsRef.current.get(current.cloudSessionId)
      if (cloud) void updateCloudSession(family.id, selectedChild.id, cloud, { warmupStatus: 'skipped' }).then((updated) => { cloudSessionsRef.current.set(current.cloudSessionId!, updated) }).catch((error) => setCloudError(authErrorMessage(error)))
    }
    return primaryStartState({ ...current, warmupSkipped: true, warmupAnswers: [] })
  })
  const continueToPrimaryAfterPartialWarmup = () => {
    const current = session
    if (!current || current.segment !== 'warmup' || current.warmupOnly || current.warmupAnswers.length === 0 || !current.adaptiveWarmupVisitId) return
    const visit = (state.warmupVisitsV1 || []).find((candidate) => candidate.id === current.adaptiveWarmupVisitId)
    if (!visit || visit.status !== 'in-progress') return
    try {
      const checkpoint = createWarmupFinalizationCheckpoint({ state, visitId: visit.id, operation: 'finalize-partial', occurredAt: now().toISOString() })
      appendPendingWarmupTransition(window.localStorage, checkpoint.transition, checkpoint.baseVisit)
      const applied = applyWarmupTransitionToAppState(state, checkpoint.transition, Boolean(auth.user && family))
      if (applied.status !== 'applied') throw new Error(applied.status === 'conflict' ? applied.reason : 'The partial Warmup was already finalized.')
      setState(applied.state)
      if (auth.user && family && selectedChild) {
        void commitCloudWarmupTransition(family.id, selectedChild.id, checkpoint.transition).then(() => {
          removePendingWarmupTransition(window.localStorage, checkpoint.transition.transitionId)
          setState((existing) => markWarmupTransitionCommitted(existing, checkpoint.transition.transitionId))
        }).catch((error) => setCloudError(`Partial Warmup progress is saved on this device and will retry: ${authErrorMessage(error)}`))
        if (current.cloudSessionId) {
          const cloud = cloudSessionsRef.current.get(current.cloudSessionId)
          if (cloud) void updateCloudSession(family.id, selectedChild.id, cloud, { warmupStatus: 'partial' }).then((updated) => { cloudSessionsRef.current.set(current.cloudSessionId!, updated) }).catch((error) => setCloudError(authErrorMessage(error)))
        }
      } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(applied.state))) {
        removePendingWarmupTransition(window.localStorage, checkpoint.transition.transitionId)
      }
      setSession(primaryStartState(current))
    } catch (error) {
      setCloudError(`Warmup could not continue safely to the activity: ${authErrorMessage(error)}`)
    }
  }
  const completeInterstitial = async () => {
    const current = session
    if (!current || current.stage !== 'interstitial') return
    if (current.segment !== 'warmup' || !current.adaptiveWarmupVisitId || !selectedChild || !lifecycleResolution) {
      setSession({ ...current, stage: 'dictation' })
      return
    }
    const associatedPrimaryActivity = current.warmupOnly ? undefined : { phase: current.primaryPhase, datasetId: current.primaryDatasetId, ...(current.reviewGroupId ? { reviewGroupId: current.reviewGroupId } : {}) }
    const refreshed = prepareAdaptiveWarmupVisit({
      state,
      childId: selectedChild.id,
      grade: selectedChild.grade,
      schoolYear: selectedChild.schoolYear,
      datasets: primaryDatasets,
      lifecycleResolution,
      visitType: current.warmupOnly ? 'standalone' : 'pre-activity',
      visitId: current.adaptiveWarmupVisitId,
      createdAt: now().toISOString(),
      associatedPrimaryActivity,
    })
    if (refreshed.status === 'blocked') { setCloudError(`Warmup eligibility could not be refreshed: ${refreshed.reason}`); return }
    const revalidated = revalidateWarmupVisitBeforePresentation(refreshed.state, refreshed.visit.id, now().toISOString(), false)
    if (!revalidated.visit || revalidated.reason) { setCloudError(`Warmup eligibility could not be refreshed: ${revalidated.reason || 'The visit is unavailable.'}`); return }
    let baseVisit = refreshed.visit
    for (const transition of revalidated.transitions) {
      try {
        appendPendingWarmupTransition(window.localStorage, transition, baseVisit)
        if (auth.user && family) {
          await commitCloudWarmupTransition(family.id, selectedChild.id, transition)
          removePendingWarmupTransition(window.localStorage, transition.transitionId)
        } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(revalidated.state))) {
          removePendingWarmupTransition(window.localStorage, transition.transitionId)
        } else throw new Error('The browser could not save the eligibility update.')
      } catch (error) { setCloudError(`Warmup eligibility is preserved for recovery: ${authErrorMessage(error)}`); return }
      baseVisit = transition.nextVisit
    }
    setState(revalidated.state)
    if (revalidated.visit.status === 'completed') {
      if (current.primaryQueue.length === 0) completeSession({ ...current, segment: 'primary', stage: 'complete', queue: [], index: 0 }, revalidated.state)
      else setSession(primaryStartState(current))
      return
    }
    setSession({ ...current, index: revalidated.visit.nextPosition, stage: 'dictation' })
  }
  const completeDictationWord = (revealMethod: 'timer' | 'skip_timer' = 'timer') => setSession((current) => {
    if (!current || current.stage !== 'dictation') return current
    if (current.segment === 'primary' && current.acquisition) {
      const prompt = current.acquisition.prompt
      if (!prompt) return current
      return { ...current, acquisition: revealAcquisitionPrompt(current.acquisition), currentRevealMethod: revealMethod, stage: 'review' }
    }
    if (current.segment === 'warmup' && current.adaptiveWarmupVisitId) return { ...current, currentRevealMethod: revealMethod, stage: 'review' }
    if (current.index < current.queue.length - 1) return { ...current, stage: 'interstitial', index: current.index + 1 }
    if (current.segment === 'warmup') return { ...current, stage: 'review', index: 0 }
    return { ...current, stage: 'complete' }
  })
  const startPrimaryReview = () => {
    if (session?.stage === 'complete' && session.primaryQueue.length === 0) { completeSession({ ...session, segment: 'primary', queue: [], primaryAnswers: [] }); return }
    setSession((current) => current && current.stage === 'complete' ? { ...current, stage: 'review', index: 0 } : current)
  }
  const completeSession = (finished: PracticeSession, baseState: AppState = state) => {
    const completionDate = now()
    const committed = commitCompletedSession(baseState, finished, completionDate)
    setState(committed)
    if (auth.user && family && finished.cloudSessionId && selectedChild) {
      const cloud = cloudSessionsRef.current.get(finished.cloudSessionId)
      if (cloud) {
        // Acquisition attempts are already committed atomically with their
        // progression checkpoints. Session completion must not write them a
        // second time under a different ID.
        const answers = [...(finished.adaptiveWarmupVisitId ? [] : finished.warmupAnswers), ...(finished.primaryPhase === 'acquisition' ? [] : finished.primaryAnswers)]
        const attempts: CloudAttempt[] = answers.map((answer, index) => ({ id: `${finished.id}-${answer.word.id}-${index}`, sessionId: finished.id, wordId: answer.word.id, sourceDatasetId: answer.word.datasetId, phase: finished.warmupAnswers.includes(answer) ? 'warmup' : finished.primaryPhase, correct: answer.correct, reviewedAt: completionDate.toISOString(), completionStatus: 'complete' }))
        void Promise.all([
          completeCloudSession(family.id, selectedChild.id, cloud, attempts, committed.scores.filter((score) => score.sessionId === finished.id)),
          saveCloudAdaptiveState(family.id, selectedChild.id, cloudAdaptiveStateForSave(committed, selectedChild.id, completionDate.toISOString())),
        ]).catch((error) => setCloudError(`Your score or adaptive progress could not be confirmed in the cloud: ${authErrorMessage(error)}`))
      }
    }
    setCompletedSummary(finished.warmupOnly ? 'Mastery warmup complete. Your warmup results are saved.' : 'Practice complete. Your warmup and dataset results are saved.'); setSession(null); setView('home')
  }
  const finishAcquisitionForToday = () => {
    const current = session
    if (!current?.acquisition || current.primaryPhase !== 'acquisition') return
    const completionDate = now()
    const committed = commitPartialSession(state, current, completionDate)
    setState(committed)
    if (auth.user && family && selectedChild && current.cloudSessionId) {
      const cloud = cloudSessionsRef.current.get(current.cloudSessionId)
      if (cloud) {
        const attempts: CloudAttempt[] = current.adaptiveWarmupVisitId ? [] : current.warmupAnswers.map((answer, index) => ({ id: `${current.id}-warmup-${answer.word.id}-${index}`, sessionId: current.id, wordId: answer.word.id, sourceDatasetId: answer.word.datasetId, phase: 'warmup' as const, correct: answer.correct, reviewedAt: completionDate.toISOString(), completionStatus: 'complete' as const }))
        const warmupStatus = current.warmupSkipped ? 'skipped' as const : current.warmupAnswers.length === current.warmupQueue.length ? 'completed' as const : current.warmupAnswers.length > 0 ? 'partial' as const : 'in_progress' as const
        void Promise.all([
          finishCloudSession(family.id, selectedChild.id, { ...cloud, warmupStatus }, 'completed', attempts, committed.scores.filter((score) => score.sessionId === current.id)),
          saveCloudAdaptiveState(family.id, selectedChild.id, cloudAdaptiveStateForSave(committed, selectedChild.id, completionDate.toISOString())),
        ]).catch((error) => setCloudError(`Acquisition could not be finalized in the cloud: ${authErrorMessage(error)}`))
      }
    }
    const targetAttempts = current.primaryAnswers.filter((answer) => answer.countsTowardWeeklyScore).length
    setCompletedSummary(targetAttempts > 0 ? `Acquisition saved with ${targetAttempts} weekly-target response${targetAttempts === 1 ? '' : 's'} scored for today.` : 'Acquisition progress and DT practice were saved. No weekly-target score was created.')
    setSession(null)
    setView('home')
  }
  const skipTestReview = () => {
    const current = session
    if (!current || current.primaryPhase !== 'test-review') return
    const completionDate = now()
    const skippedSession = { ...current, primaryAnswers: [], testReviewSkipped: true }
    const committed = commitSkippedTestReview(state, skippedSession, completionDate)
    setState(committed)
    if (auth.user && family && selectedChild && current.cloudSessionId) {
      const cloud = cloudSessionsRef.current.get(current.cloudSessionId)
      if (cloud) {
        const attempts: CloudAttempt[] = current.adaptiveWarmupVisitId ? [] : current.warmupAnswers.map((answer, index) => ({ id: `${current.id}-warmup-${answer.word.id}-${index}`, sessionId: current.id, wordId: answer.word.id, sourceDatasetId: answer.word.datasetId, phase: 'warmup', correct: answer.correct, reviewedAt: completionDate.toISOString(), completionStatus: 'complete' }))
        const warmupStatus = current.warmupSkipped ? 'skipped' as const : current.warmupAnswers.length === current.warmupQueue.length ? 'completed' as const : current.warmupAnswers.length > 0 ? 'partial' as const : 'not_started' as const
        void Promise.all([
          skipCloudTestReview(family.id, selectedChild.id, { ...cloud, warmupStatus }, attempts),
          saveCloudAdaptiveState(family.id, selectedChild.id, cloudAdaptiveStateForSave(committed, selectedChild.id, completionDate.toISOString())),
        ]).catch((error) => setCloudError(`The skipped Test Review could not be confirmed in the cloud: ${authErrorMessage(error)}`))
      }
    }
    setCompletedSummary('Test Review was skipped. Any completed Warmup results were saved; no Test Review score was created.')
    setSession(null)
    setView('home')
  }
  const answer = (correct: boolean | 'skip-warmup' | 'continue-primary' | 'skip-test-review' | 'done') => {
    if (correct === 'skip-warmup') { skipWarmup(); return }
    if (correct === 'continue-primary') { continueToPrimaryAfterPartialWarmup(); return }
    if (correct === 'skip-test-review') { skipTestReview(); return }
    if (correct === 'done') { finishAcquisitionForToday(); return }
    const current = session
    if (!current || current.stage !== 'review') return
    if (current.segment === 'primary' && current.acquisition) {
      const dataset = state.datasets.find((item) => item.id === current.primaryDatasetId)
      if (!dataset || !current.acquisition.prompt?.revealed) return
      const context = acquisitionPersistenceContext(current.childId, dataset, current.grade)
      const envelope = (state.acquisitionProgressEnvelopes || []).find((item) => item.childId === current.childId && item.datasetId === dataset.id)
      if (!envelope) {
        setCloudError('Acquisition progress was not loaded. This answer was not recorded; reopen the activity and try again.')
        return
      }
      let checkpoint
      try {
        checkpoint = createAcquisitionAnswerCheckpoint({
          envelope,
          context,
          response: { correct, revealMethod: current.currentRevealMethod || 'timer' },
          answeredPromptId: current.acquisition.prompt.id,
          sessionId: current.id,
          occurredAt: now().toISOString(),
        })
        appendPendingAcquisitionCheckpoint(window.localStorage, checkpoint, envelope)
      } catch (error) {
        setCloudError(`This Acquisition answer was not advanced because it could not be checkpointed safely: ${authErrorMessage(error)}`)
        return
      }
      const applied = applyAcquisitionCheckpointToAppState(state, checkpoint, context, Boolean(auth.user && family))
      if (applied.status === 'conflict') {
        removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
        setCloudError(`This Acquisition answer was not advanced because saved progress changed: ${applied.reason}`)
        return
      }
      const nextFlow = checkpoint.nextFlow
      const response: SessionAnswer | undefined = sessionAnswerForCheckpoint(checkpoint)
      const primaryAnswers = response ? [...current.primaryAnswers, response] : current.primaryAnswers
      const nextSession: PracticeSession = { ...current, acquisition: nextFlow, primaryAnswers, currentRevealMethod: undefined, stage: nextFlow.complete ? 'complete' : 'dictation', queue: nextFlow.prompt ? [nextFlow.prompt.word] : [], index: 0 }
      setState(applied.state)
      if (auth.user && family && selectedChild) {
        void commitCloudAcquisitionCheckpoint(family.id, selectedChild.id, applied.envelope, checkpoint).then(() => {
          removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
          setState((existing) => markAcquisitionCheckpointCommitted(existing, checkpoint.transitionId))
        }).catch((error) => setCloudError(`Acquisition progress is saved on this device and will retry: ${authErrorMessage(error)}`))
      } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(applied.state))) {
        removePendingAcquisitionCheckpoint(window.localStorage, checkpoint.transitionId)
      } else {
        setCloudError('This Acquisition answer is preserved in the recovery journal and will retry when the app reopens.')
      }
      setSession(nextSession)
      return
    }
    const response: SessionAnswer = { word: current.queue[current.index], correct, revealMethod: current.currentRevealMethod || 'timer' }
    const isWarmup = current.segment === 'warmup'
    if (isWarmup && current.adaptiveWarmupVisitId) {
      let checkpoint
      try {
        checkpoint = createWarmupAnswerCheckpoint({ state, visitId: current.adaptiveWarmupVisitId, correct, revealMethod: response.revealMethod, occurredAt: now().toISOString() })
        appendPendingWarmupTransition(window.localStorage, checkpoint.transition, checkpoint.baseVisit, checkpoint.baseMastery)
      } catch (error) {
        setCloudError(`This Warmup answer was not advanced because it could not be checkpointed safely: ${authErrorMessage(error)}`)
        return
      }
      const { transition } = checkpoint
      const applied = applyWarmupTransitionToAppState(state, transition, Boolean(auth.user && family))
      if (applied.status !== 'applied') {
        removePendingWarmupTransition(window.localStorage, transition.transitionId)
        setCloudError(`This Warmup answer was not advanced because saved progress changed: ${applied.status === 'conflict' ? applied.reason : 'The answer was already applied.'}`)
        return
      }
      setState(applied.state)
      if (auth.user && family && selectedChild) {
        void commitCloudWarmupTransition(family.id, selectedChild.id, transition).then(() => {
          removePendingWarmupTransition(window.localStorage, transition.transitionId)
          setState((existing) => markWarmupTransitionCommitted(existing, transition.transitionId))
        }).catch((error) => setCloudError(`Warmup progress is saved on this device and will retry: ${authErrorMessage(error)}`))
      } else if (localStorageSet(APP_STATE_KEY, JSON.stringify(applied.state))) {
        removePendingWarmupTransition(window.localStorage, transition.transitionId)
      } else {
        setCloudError('This Warmup answer is preserved in the recovery journal and will retry when the app reopens.')
      }
      const answers = [...current.warmupAnswers, response]
      if (transition.nextVisit.status === 'completed') {
        if (current.primaryQueue.length === 0) { completeSession({ ...current, segment: 'primary', stage: 'complete', queue: [], index: 0, warmupAnswers: answers, primaryAnswers: [] }, applied.state); return }
        setSession({ ...current, segment: 'primary', stage: 'interstitial', queue: current.primaryQueue, index: 0, warmupAnswers: answers, currentRevealMethod: undefined })
      } else {
        setSession({ ...current, warmupAnswers: answers, index: transition.nextVisit.nextPosition, stage: 'interstitial', currentRevealMethod: undefined })
      }
      return
    }
    const answers = isWarmup ? [...current.warmupAnswers, response] : [...current.primaryAnswers, response]
    if (auth.user && family && current.cloudSessionId && selectedChild) {
      const cloud = cloudSessionsRef.current.get(current.cloudSessionId)
      if (cloud) {
        void saveCloudAttempt(family.id, selectedChild.id, current.cloudSessionId, { id: `${current.id}-${response.word.id}-${current.index}`, sessionId: current.id, wordId: response.word.id, sourceDatasetId: response.word.datasetId, phase: isWarmup ? 'warmup' : current.primaryPhase, correct, reviewedAt: now().toISOString(), completionStatus: isWarmup && current.index === current.queue.length - 1 ? 'complete' : 'temporary' }).catch((error) => setCloudError(`A practice result could not be saved: ${authErrorMessage(error)}`))
        if (isWarmup && current.index === current.queue.length - 1) void updateCloudSession(family.id, selectedChild.id, cloud, { warmupStatus: 'completed' }).catch((error) => setCloudError(authErrorMessage(error)))
      }
    }
    if (current.index < current.queue.length - 1) {
      setSession(isWarmup ? { ...current, warmupAnswers: answers, index: current.index + 1 } : { ...current, primaryAnswers: answers, index: current.index + 1 })
      return
    }
    if (isWarmup) {
      if (current.primaryQueue.length === 0) { completeSession({ ...current, segment: 'primary', stage: 'complete', queue: [], index: 0, warmupAnswers: answers, primaryAnswers: [] }); return }
      setSession({ ...current, segment: 'primary', stage: 'interstitial', queue: current.primaryQueue, index: 0, warmupAnswers: answers })
      return
    }
    if (completedSessionRef.current === current.id) return
    completedSessionRef.current = current.id
    completeSession({ ...current, primaryAnswers: answers })
  }
  const navigate = (nextView: View) => { if (view === 'practice' && nextView !== 'practice') { leavePractice(nextView); return }; if (view === 'reading' && nextView !== 'reading') setReadingPathway(null); setView(nextView) }
  const importLocalDeck = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const hydrated = hydrateLocalStateFromJson(state, await file.text())
      setState(hydrated.state)
      if (hydrated.batch.status === 'error') {
        setLocalImportMessage(null)
        setLocalImportError(hydrated.batch.message)
      } else {
        setLocalImportError(null)
        setLocalImportMessage(hydrated.batch.message)
      }
      setView('home')
    } catch (error) {
      setLocalImportMessage(null)
      setLocalImportError(error instanceof Error ? error.message : 'The presentation file could not be imported.')
    }
  }

  if (dataLoading && auth.user && familyChildren.length === 0) return <div className="auth-shell"><div className="auth-card"><Sparkles size={28} /><h1>Loading your family</h1><p>Securely loading children and weekly datasets…</p></div></div>
  if (!selectedChild) return <div className="auth-shell"><div className="auth-card"><h1>Add a child to begin</h1><p>{cloudError || 'Your family does not have an active child profile yet.'}</p><button className="primary-button" onClick={() => setShowProfiles(true)}>Add child</button></div>{showProfiles && family && <ProfileModal children={familyChildren} selectedChildId="" onSelect={() => undefined} onClose={() => setShowProfiles(false)} onAdd={async (input) => { const created = await createChild(family.id, input); setFamilyChildren([{ ...created, name: created.nickname, color: 'coral', initials: created.nickname.slice(0, 1).toUpperCase() }]); setSelectedChildId(created.id); setShowProfiles(false) }} onUpdate={async () => undefined} />}</div>
  const legacyCount = state.legacyRecords.filter((record) => record.childId === selectedChild.id).length
  return <div className="app-shell"><header className="topbar"><button className="brand" onClick={() => navigate('home')} aria-label="Go to home"><span className="brand-mark"><Sparkles size={17} strokeWidth={2.5} /></span><span>weekly<span className="brand-accent">dictation</span></span></button><div className="topbar-actions">{!firebaseConfigReady && <LocalImportControl disabled={view === 'practice' || view === 'reading'} onChange={importLocalDeck} />}{!firebaseConfigReady && localImportMessage && <span className="local-import-status">{localImportMessage}</span>}<button className="profile-switcher" onClick={() => setShowChildMenu((current) => !current)}><span className={`avatar avatar-${selectedChild.color}`}>{selectedChild.initials}</span><span className="profile-switcher-copy"><small>Practicing as</small>{selectedChild.name}</span><ChevronDown size={16} /></button>{showChildMenu && <div className="child-menu"><p>Switch child</p>{familyChildren.filter((child) => child.active).map((child) => <button key={child.id} className={child.id === selectedChild.id ? 'selected' : ''} onClick={() => chooseChild(child.id)}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span><strong>{child.name}</strong><small>{child.grade}</small></span>{child.id === selectedChild.id && <Check size={15} />}</button>)}<button className="manage-children" onClick={() => { setShowChildMenu(false); setShowProfiles(true) }}>Manage profiles <ArrowLeft size={14} /></button><button className="manage-children" onClick={() => signOut()}><LogOut size={14} /> Sign out</button></div>}</div></header><main className="main-content">{cloudError && auth.user && <div className="error-banner">{cloudError}</div>}{!firebaseConfigReady && localImportError && <div className="error-banner">{localImportError}</div>}{promotionSuggested && <div className="promotion-banner"><span>Your {selectedChild.grade} school year is ready to advance.</span><button onClick={() => void confirmPromotion()}>Move to {nextGrade(selectedChild.grade)}</button></div>}{view === 'home' && !practiceProfile && <UnsupportedPracticeView child={selectedChild} datasets={primaryDatasets} onHistory={() => setView('history')} onProfiles={() => setShowProfiles(true)} />}{view === 'home' && Boolean(practiceProfile) && primaryChoices.length > 0 && lifecycleResolution && <HomeView child={selectedChild} profile={practiceProfile!} datasets={primaryDatasets} scores={state.scores} acquisitionTarget={primaryChoices.find((choice) => choice.phase === 'acquisition') || null} testReviewTarget={primaryChoices.find((choice) => choice.phase === 'test-review') || null} readingLifecycle={readingLifecycle} warmupWords={warmupWordCount} completedSummary={completedSummary} currentDate={currentDate} lifecycleResolution={lifecycleResolution} onStart={(target) => void startPractice(target)} onStartWarmup={() => void startPractice(null)} onStartReading={startReading} onHistory={() => setView('history')} onProfiles={() => setShowProfiles(true)} />}{view === 'home' && Boolean(practiceProfile) && primaryChoices.length === 0 && <NoDatasetView child={selectedChild} datasets={primaryDatasets} warmupWords={warmupWordCount} localMode={!firebaseConfigReady} onStartWarmup={() => void startPractice(null)} onHistory={() => setView('history')} onProfiles={() => setShowProfiles(true)} />}{view === 'practice' && session && <PracticeView session={session} datasets={state.datasets} onExit={exitPractice} onReplay={() => { const word = activePracticeWord(session); if (session.stage === 'complete') return speakReviewInstruction(); return word ? speakWord(word, session.segment === 'warmup') : undefined }} onBeginWarmup={beginWarmup} onInterstitialComplete={completeInterstitial} onDictationComplete={completeDictationWord} onStartReview={startPrimaryReview} onAnswer={answer} onSpeakWord={speakWord} onSpeakReviewInstruction={speakReviewInstruction} reviewInstruction={REVIEW_INSTRUCTION} />}{view === 'reading' && readingPathway && readingProfile && <Tier2ReadingPractice key={`${readingPathway.kind}-${readingPathway.cycle || 0}-${readingPathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`} profile={readingProfile} pathway={readingPathway} label={readingPathwayLabel(readingPathway)} onExit={() => { setReadingPathway(null); setView('home') }} onComplete={finishReading} sessionNote="Prototype reading visit · recording and results are not saved yet" />}{view === 'history' && <HistoryView child={selectedChild} datasets={primaryDatasets} scores={state.scores} legacyCount={legacyCount} warmupGraphPoints={(state.warmupGraphPointsV1 || []).filter((point) => point.childId === selectedChild.id)} onBack={() => setView('home')} />}</main>{view !== 'practice' && view !== 'reading' && <nav className="bottom-nav" aria-label="Primary navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><Home size={19} /><span>Practice</span></button><button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><BarChart3 size={19} /><span>Progress</span></button><button onClick={() => setShowProfiles(true)}><Languages size={19} /><span>Profiles</span></button></nav>}{showProfiles && <ProfileModal children={familyChildren} selectedChildId={selectedChildId} onSelect={chooseChild} onClose={() => setShowProfiles(false)} onAdd={async (input) => { if (!family) return; const created = await createChild(family.id, input); setFamilyChildren((items) => [...items, { ...created, name: created.nickname, color: 'coral', initials: created.nickname.slice(0, 1).toUpperCase() }]); setSelectedChildId(created.id) }} onUpdate={async (childId, patch) => { if (!family) return; const updated = await updateChild(family.id, childId, patch); setFamilyChildren((items) => items.map((item) => item.id === childId ? { ...item, ...updated, name: updated.nickname, initials: updated.nickname.slice(0, 1).toUpperCase() } : item)) }} />}</div>
}

function LocalImportControl({ disabled, onChange }: { disabled: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className={`local-import-control${disabled ? ' disabled' : ''}`}>Import deck JSON<input type="file" accept="application/json,.json" disabled={disabled} onChange={onChange} /></label>
}

function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null)
    try {
      if (mode === 'reset') { await sendPasswordResetEmail(email); setMessage('Password reset instructions sent if the account exists.') }
      else if (mode === 'sign-up') { await signUp(email, password); setMessage('Account created. Your private family is ready.') }
      else await signIn(email, password)
    } catch (caught) { setError(authErrorMessage(caught)) } finally { setBusy(false) }
  }
  return <div className="auth-shell"><div className="auth-card"><div className="brand auth-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>weekly<span className="brand-accent">dictation</span></span></div><p className="eyebrow">Private family practice</p><h1>{mode === 'sign-up' ? 'Create your parent account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1><p className="auth-copy">Sign in to keep children, sessions, and progress safely separated by family.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>{mode !== 'reset' && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} /></label>}{error && <div className="error-banner">{error}</div>}{message && <div className="success-banner">{message}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'Working…' : mode === 'reset' ? 'Send reset email' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button></form><div className="auth-links">{mode !== 'sign-in' && <button onClick={() => { setMode('sign-in'); setMessage(null); setError(null) }}>Sign in</button>}{mode !== 'sign-up' && <button onClick={() => { setMode('sign-up'); setMessage(null); setError(null) }}>Create account</button>}{mode !== 'reset' && <button onClick={() => { setMode('reset'); setMessage(null); setError(null) }}>Forgot password?</button>}</div></div></div>
}

function HomeView({ child, profile, datasets, scores, acquisitionTarget, testReviewTarget, readingLifecycle, warmupWords, completedSummary, currentDate, lifecycleResolution, onStart, onStartWarmup, onStartReading, onHistory, onProfiles }: { child: Child; profile: WritingPracticeProfile; datasets: Dataset[]; scores: DatasetScore[]; acquisitionTarget: PracticeTarget | null; testReviewTarget: PracticeTarget | null; readingLifecycle: Tier2ReadingLifecycle | null; warmupWords: number; completedSummary: string | null; currentDate: Date; lifecycleResolution: ReturnType<typeof resolveDatasetLifecycles>; onStart: (target: PracticeTarget) => void; onStartWarmup: () => void; onStartReading: (pathway: Tier2ReadingPathway) => void; onHistory: () => void; onProfiles: () => void }) {
  const today = scores.filter((score) => score.childId === child.id && score.sessionDate === localDateKey(currentDate)).length
  const displayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(currentDate)
  const orderedDatasets = sortDatasetsNewestFirst(datasets)
  const presentation = profile.presentation
  const warmupOptional = profile.preActivityWarmupRequirement === 'optional'
  return <div className="page home-page"><section className="welcome-row"><div><p className="eyebrow">{presentation?.homeEyebrow || displayDate}</p><h1>{presentation?.homeHeading || 'Ready when you are'}, <em>{child.name}.</em></h1><p className="subhead">{presentation?.homeDescription || `Choose your activity. Warmup is offered first and ${warmupOptional ? 'may be skipped' : 'is required'}.`}</p></div><button className="mini-profile" onClick={onProfiles}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span>{child.grade}</span><ChevronDown size={15} /></button></section>{completedSummary && <div className="success-banner"><span className="success-icon"><Check size={17} /></span><span><strong>Practice complete.</strong> {completedSummary}</span><button onClick={onHistory}>See progress <ArrowLeft size={14} /></button></div>}<section className="practice-lane-grid" aria-label="Available practice activities"><article className="practice-lane lane-warmup"><div className="status-pill"><span className="status-dot" /> Independently available</div><h2>Adaptive Warmup</h2><p>{warmupWords > 0 ? `${warmupWords} unique mastery target${warmupWords === 1 ? '' : 's'} selected. ${warmupOptional ? 'A pre-activity Warmup may also be skipped.' : 'Pre-activity Warmup is required.'}` : 'No prior mastery targets are available yet.'}</p>{warmupWords > 0 && <button className="primary-button" onClick={onStartWarmup}>Start mastery Warmup <ArrowLeft size={17} /></button>}</article>{acquisitionTarget && <PracticeLaneCard target={acquisitionTarget} profile={profile} onStart={onStart} />}{testReviewTarget && <PracticeLaneCard target={testReviewTarget} profile={profile} onStart={onStart} resumeAcquisitionTarget={acquisitionTarget} />}</section>{readingLifecycle && <Tier2ReadingPathways lifecycle={readingLifecycle} onStart={onStartReading} />}<section className="section-heading"><div><p className="eyebrow">Weekly datasets</p><h2>Every week stays on record</h2></div><button className="text-button" onClick={onHistory}>View progress <ArrowLeft size={15} /></button></section><div className="set-grid">{orderedDatasets.map((dataset, index) => <SetCard key={dataset.id} dataset={dataset} lifecycle={requireDatasetLifecycle(lifecycleResolution, dataset.id)} score={latestScore(scores, child.id, dataset.id)} tone={index % 2 === 0 ? 'yellow' : 'lavender'} />)}</div><section className="today-strip"><div className="strip-icon"><Clock3 size={18} /></div><div><strong>{today ? `${today} dataset score${today === 1 ? '' : 's'} recorded today` : 'No dataset scores recorded today'}</strong><span>Acquisition scores appear when “Done for today” is selected; Test Review scores require the complete review.</span></div><div className="strip-arrow">→</div></section></div>
}

function PracticeLaneCard({ target, profile, onStart, resumeAcquisitionTarget }: { target: PracticeTarget; profile: WritingPracticeProfile; onStart: (target: PracticeTarget) => void; resumeAcquisitionTarget?: PracticeTarget | null }) {
  const groupedDatasets = target.reviewDatasets || [target.dataset]
  const wordCount = groupedDatasets.reduce((total, dataset) => total + dataset.words.length, 0)
  const label = target.phase === 'acquisition'
    ? profile.presentation?.acquisitionLabel || phaseLabel(target.phase)
    : profile.presentation?.testReviewLabel || phaseLabel(target.phase)
  const startLabel = target.phase === 'acquisition'
    ? profile.presentation?.acquisitionAction || 'Start Acquisition'
    : profile.presentation?.testReviewAction || 'Start Test Review'
  const detail = target.reviewDatasets
    ? `${groupedDatasets.length} teaching weeks · ${wordCount} writing target${wordCount === 1 ? '' : 's'}`
    : `${target.dataset.dateRange} · ${wordCount} word${wordCount === 1 ? '' : 's'}`
  return <article className={`practice-lane lane-${target.phase}`}><div className="status-pill"><span className="status-dot" /> {label}</div><h2>{label}</h2><p>{detail} · Warmup offered first</p><button className="primary-button" aria-label={`${startLabel} for ${target.dataset.dateRange}`} onClick={() => onStart(target)}>{startLabel} <ArrowLeft size={17} /></button>{resumeAcquisitionTarget && <button className="replay-button" onClick={() => onStart(resumeAcquisitionTarget)}>Return to {profile.presentation?.acquisitionLabel?.toLowerCase() || 'acquisition'}</button>}</article>
}

function Tier2ReadingPathways({ lifecycle, onStart }: { lifecycle: Tier2ReadingLifecycle; onStart: (pathway: Tier2ReadingPathway) => void }) {
  const pathways = [
    ...(lifecycle.acquisition ? [lifecycle.acquisition] : []),
    ...lifecycle.testReviews,
    lifecycle.mastery,
  ].filter((pathway) => pathway.available && tier2ReadingPathwayTargets(pathway).length > 0)
  if (pathways.length === 0) return null
  return <section className="tier2-teaching-card tier2-lifecycle-card" aria-label="Tier 2 reading pathways">
    <div className="tier2-copy">
      <p className="eyebrow">Tier 2 reading</p>
      <h2>Look, listen, record, and compare</h2>
      <p>Reading follows the same curriculum stages as writing while keeping its own targets and session-only results.</p>
    </div>
    <div className="tier2-pathway-list">
      {pathways.map((pathway) => {
        const targets = tier2ReadingPathwayTargets(pathway)
        const id = `${pathway.kind}-${pathway.cycle || 0}-${pathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`
        return <button className="tier2-pathway-button" type="button" key={id} onClick={() => onStart(pathway)}>
          <span>{readingPathwayLabel(pathway)}</span>
          <strong>{targets.length} target{targets.length === 1 ? '' : 's'}</strong>
          <small>{targets.map((target) => target.text).join('、')}</small>
        </button>
      })}
    </div>
  </section>
}

function UnsupportedPracticeView({ child, datasets, onHistory, onProfiles }: { child: Child; datasets: Dataset[]; onHistory: () => void; onProfiles: () => void }) {
  return <div className="page home-page"><section className="welcome-row"><div><p className="eyebrow">Setup in progress</p><h1>Hi, <em>{child.name}.</em></h1><p className="subhead">Practice for {child.grade} is not configured yet. Existing datasets and history remain available.</p></div><button className="mini-profile" onClick={onProfiles}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span>{child.grade}</span><ChevronDown size={15} /></button></section><section className="hero-card"><div className="hero-copy"><div className="status-pill"><span className="status-dot" /> Practice unavailable</div><h2>Your history<br /><span>is preserved</span></h2><p>{datasets.length} weekly dataset{datasets.length === 1 ? '' : 's'} remain on record.</p><button className="primary-button" onClick={onHistory}>View progress <ArrowLeft size={17} /></button></div><div className="hero-illustration" aria-hidden="true"><div className="sun-shape" /><div className="paper-shape"><span>字</span><span>词</span><span>好</span></div><div className="pencil-shape" /><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div></div></section></div>
}

function NoDatasetView({ child, datasets, warmupWords, localMode, onStartWarmup, onHistory, onProfiles }: { child: Child; datasets: Dataset[]; warmupWords: number; localMode: boolean; onStartWarmup: () => void; onHistory: () => void; onProfiles: () => void }) {
  const setupMessage = localMode ? 'No weekly vocabulary is seeded in local mode. Use “Import deck JSON” above to load a trusted presentation through the canonical importer.' : 'There is no active weekly dataset scheduled right now.'
  return <div className="page home-page"><section className="welcome-row"><div><p className="eyebrow">Ready when you are</p><h1>Hi, <em>{child.name}.</em></h1><p className="subhead">{warmupWords > 0 ? 'The current week has no primary word set. Your mastery warmup is still available.' : setupMessage}</p></div><button className="mini-profile" onClick={onProfiles}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span>{child.grade}</span><ChevronDown size={15} /></button></section><section className="hero-card"><div className="hero-copy"><div className="status-pill"><span className="status-dot" /> {warmupWords > 0 ? 'Mastery Warmup' : localMode ? 'Setup required' : 'No active dataset'}</div><h2>{warmupWords > 0 ? <>Keep your<br /><span>mastery growing</span></> : localMode ? <>Load your<br /><span>weekly deck</span></> : <>Your next<br /><span>practice set</span></>}</h2><p>{warmupWords > 0 ? `${warmupWords} mastery target${warmupWords === 1 ? '' : 's'} available` : localMode ? 'Import a trusted Google Slides JSON payload to begin. No placeholder or sample vocabulary is used.' : `${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'} remain on record.`}</p>{warmupWords > 0 && <button className="primary-button" onClick={onStartWarmup}>Start mastery warmup <ArrowLeft size={17} /></button>}{warmupWords === 0 && <button className="primary-button" onClick={onHistory}>View progress <ArrowLeft size={17} /></button>}</div><div className="hero-illustration" aria-hidden="true"><div className="sun-shape" /><div className="paper-shape"><span>字</span><span>词</span><span>好</span></div><div className="pencil-shape" /><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div></div></section></div>
}

function SetCard({ dataset, lifecycle, score, tone }: { dataset: Dataset; lifecycle: DatasetLifecycle; score: DatasetScore | null; tone: 'yellow' | 'lavender' }) { return <article className={`set-card set-${tone}`}><div className="set-card-top"><span className="set-label">{lifecycleLabel(lifecycle)}</span><span className="score-badge">{score ? `${score.percent}% · ${phaseLabel(score.phase)}` : 'Not scored'}</span></div><h3>{dataset.dateRange}</h3><p className="set-date">{dataset.description} · {dataset.words.length} words</p><div className="set-footer"><span>{dataset.grade}</span><div className="tiny-progress"><span style={{ width: `${score?.percent || 0}%` }} /></div></div></article> }

function HistoryView({ child, datasets, scores, legacyCount, warmupGraphPoints, onBack }: { child: Child; datasets: Dataset[]; scores: DatasetScore[]; legacyCount: number; warmupGraphPoints: WarmupGraphPoint[]; onBack: () => void }) { const ordered = sortDatasetsNewestFirst(datasets); return <div className="page history-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to practice</button><div className="history-heading"><div><p className="eyebrow">Progress for {child.name}</p><h1>Small steps,<br /><em>real progress.</em></h1></div><div className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</div></div>{legacyCount > 0 && <div className="history-note"><History size={17} /><span>{legacyCount} legacy result{legacyCount === 1 ? '' : 's'} preserved without an invented date range.</span></div>}<WarmupProgressGraph points={warmupGraphPoints} />{ordered.map((dataset) => <DatasetGraph key={dataset.id} dataset={dataset} scores={scores.filter((score) => score.childId === child.id && score.datasetId === dataset.id)} />)}</div> }

function DatasetGraph({ dataset, scores }: { dataset: Dataset; scores: DatasetScore[] }) {
  const orderedScores = [...scores].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
  return <section className="dataset-graph progress-card">
    <div className="progress-card-heading"><div><span className="eyebrow">{dataset.dateRange} · {dataset.grade}</span><h2>{dataset.description}</h2></div><BarChart3 size={22} /></div>
    {orderedScores.length === 0 ? <p className="empty-graph">No scores recorded yet.</p> : <div className="score-list">{orderedScores.map((score) => <div className="score-row" key={score.id}><div className={`score-dot dot-${score.phase}`} /><div className="score-row-copy"><strong>{score.sessionDate}</strong><span>{phaseLabel(score.phase)} · {score.correct}/{score.wordCount} correct</span></div><div className="score-bar"><span style={{ width: `${score.percent}%` }} /></div><strong className="score-number">{score.percent}%</strong></div>)}</div>}
  </section>
}
function ProfileModal({ children, selectedChildId, onSelect, onClose, onAdd, onUpdate }: { children: Child[]; selectedChildId: string; onSelect: (id: string) => void; onClose: () => void; onAdd: (input: Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear'>) => Promise<void>; onUpdate: (childId: string, patch: Partial<Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear' | 'active'>>) => Promise<void> }) {
  const [nickname, setNickname] = useState(''); const [grade, setGrade] = useState<string>(DEFAULT_GRADE); const [schoolYear, setSchoolYear] = useState(DEFAULT_SCHOOL_YEAR); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const add = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await onAdd({ nickname, grade, schoolYear }); setNickname('') } catch (caught) { setError(authErrorMessage(caught)) } finally { setSaving(false) } }
  return <div className="modal-backdrop" onClick={onClose}><div className="profile-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Family profiles</p><h2>Who is practicing?</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="profile-grid">{children.map((child) => <div key={child.id} className={`profile-card ${child.id === selectedChildId ? 'active' : ''} ${!child.active ? 'inactive' : ''}`}><button className="profile-select" disabled={!child.active} onClick={() => { onSelect(child.id); onClose() }}><span className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</span><strong>{child.name}</strong><span>{child.grade} · {child.active ? 'Active' : 'Inactive'}</span>{child.id === selectedChildId && <span className="profile-check"><Check size={14} /></span>}</button><div className="profile-actions"><button onClick={() => { const nextName = window.prompt('Child nickname', child.nickname); if (nextName && nextName !== child.nickname) void onUpdate(child.id, { nickname: nextName }) }}>Edit nickname</button><button onClick={() => void onUpdate(child.id, { active: !child.active })}>{child.active ? 'Mark inactive' : 'Reactivate'}</button></div></div>)}</div><form className="add-child-form" onSubmit={add}><h3>Add child</h3><input placeholder="Nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} required /><select value={grade} onChange={(event) => setGrade(event.target.value)}><option>Kindergarten</option><option>Grade 1</option><option>Grade 2</option><option>Grade 3</option><option>Grade 4</option><option>Grade 5</option></select><input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} aria-label="School year" /><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Add child'}</button>{error && <div className="error-banner">{error}</div>}</form></div></div>
}

export default App
