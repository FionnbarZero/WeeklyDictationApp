import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  Home,
  Languages,
  LogOut,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import {
  APP_STATE_KEY,
  type AppState,
  type Dataset,
  type DatasetLifecycle,
  type DatasetScore,
  createInitialState,
  revealAcquisitionPrompt,
  filterDatasetsForChild,
  latestScore,
  localDateKey,
  createSessionId,
  requireDatasetLifecycle,
  resolveDatasetLifecycles,
  sortDatasetsNewestFirst,
  shouldSuggestGradePromotion,
  nextGrade,
  type LifecyclePhase,
  type PracticeSession,
  type PracticeTarget,
  type Word,
} from './domain'
import { writingSessionAnswers } from './application/testReview.ts'
import {
  advancePracticeInterstitial,
  completeAcquisitionForToday as completeAcquisitionForTodayOperation,
  completePractice as completePracticeOperation,
  continueAfterPartialWarmup as continueAfterPartialWarmupOperation,
  discardTestReview as discardTestReviewOperation,
  leavePractice as leavePracticeOperation,
  prepareCloudCompletionAttempt,
  primaryStartState,
  recordPracticeAnswer as recordPracticeAnswerOperation,
  skipWarmup as skipWarmupOperation,
  startPractice as startPracticeOperation,
  type PracticeAnswerBackgroundTask,
} from './application/practice/index.ts'
import { prepareAdaptiveWarmupVisit } from './application/warmup/index.ts'
import {
  activeTier2ReadingProgress,
  checkpointTier2ReadingProgress,
  completedTier2ReadingProgress,
  completeTier2ReadingProgress,
  mergeTier2ReadingProgress,
} from './application/readingPersistence.ts'
import {
  isWorkspaceSynchronizationAborted,
  loadLocalWorkspace,
  readFamilyWorkspace,
  synchronizeChildWorkspace,
} from './application/workspace/index.ts'
import { authErrorMessage, signOut, subscribeAuth, type AuthState } from './firebaseClient'
import { firebaseConfigReady, DEFAULT_SCHOOL_YEAR, productionSourceIsActive } from './config'
import type { ChildProfile, CloudSession, FamilyRecord } from './persistence/cloudRecords.ts'
import { createFirestoreWorkspaceCapabilities } from './infrastructure/firestoreWorkspace.ts'
import { createBrowserPracticePersistence } from './infrastructure/browserPracticePersistence.ts'
import type { PracticeAnswer } from './practice/PracticeView'
import { practiceProfileForGrade } from './practice/profiles/registry'
import type { WritingPracticeProfile } from './practice/profiles/model'
import { practiceTargetsForLifecycle } from './practice/targets'
import { lifecycleStrategyForGradeAndSchoolYear } from './lifecycle/registry'
import type { Tier2ReadingPracticeSummary } from './readingPractice/Tier2ReadingPractice'
import type { Tier2ReadingProgressRecord } from './readingPractice/contracts.ts'
import type { TestReviewCompletion } from './testReview/contracts.ts'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway } from './tier2/contracts'
import { resolveTier2ReadingLifecycle } from './tier2/lifecycle'
import { tier2ReadingPathwayTargets } from './tier2/pathway'
import { tier2ReadingProfileForScope } from './tier2/registry'
import { LearningHub } from './learningHub/LearningHub.tsx'
import { grade2LearningHubView, type Grade2LearningHubLaunch } from './grade2/learningHub.ts'
import { readLocalTier2ReadingProgress, writeLocalTier2ReadingProgress } from './persistence/tier2ReadingLocal.ts'

const Tier2ReadingPractice = lazy(() =>
  import('./readingPractice/Tier2ReadingPractice.tsx').then((module) => ({
    default: module.Tier2ReadingPractice,
  })),
)
const PracticeView = lazy(() =>
  import('./practice/PracticeView.tsx').then((module) => ({ default: module.PracticeView })),
)
const HistoryView = lazy(() => import('./progress/HistoryView.tsx'))
const LocalBackupTools = lazy(() =>
  import('./backup/LocalBackupTools.tsx').then((module) => ({ default: module.LocalBackupTools })),
)
const LocalRestoreGate = lazy(() =>
  import('./backup/LocalRestoreGate.tsx').then((module) => ({ default: module.LocalRestoreGate })),
)
const AuthScreen = lazy(() => import('./auth/AuthScreen.tsx'))
const ProfileModal = lazy(() => import('./profiles/ProfileModal.tsx'))
const UnsupportedPracticeView = lazy(() =>
  import('./home/EmptyPracticeViews.tsx').then((module) => ({ default: module.UnsupportedPracticeView })),
)
const NoDatasetView = lazy(() =>
  import('./home/EmptyPracticeViews.tsx').then((module) => ({ default: module.NoDatasetView })),
)

type BaseView = 'home' | 'history'
type View = BaseView | 'practice' | 'reading'
type Child = ChildProfile & { name: string; color: string; initials: string }
type AppClock = () => Date
type AppToast = { id: number; message: string }
type ActiveExperience =
  | { kind: 'practice'; session: PracticeSession }
  | {
      kind: 'reading'
      pathway: Tier2ReadingPathway
      sessionId: string
      startedAt: string
    }
  | null

const demoChildren: Child[] = [
  {
    id: 'rhys',
    name: 'Rhys',
    nickname: 'Rhys',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    active: true,
    gradeEffectiveDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    color: 'coral',
    initials: 'R',
  },
  {
    id: 'eli',
    name: 'Eli',
    nickname: 'Eli',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    active: true,
    gradeEffectiveDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    color: 'blue',
    initials: 'E',
  },
]

const REVIEW_INSTRUCTION =
  'If you cheat, you are just cheating yourself. Answer whether you got it right or wrong honestly, to improve your score.'

function localStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function localStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
function lifecycleLabel(lifecycle: DatasetLifecycle) {
  return lifecycle === 'acquisition'
    ? 'Acquisition'
    : lifecycle === 'test-review'
      ? 'Test Review'
      : lifecycle === 'future'
        ? 'Future'
        : lifecycle === 'no-instruction'
          ? 'Writing Workshop'
          : 'Mastered'
}
function phaseLabel(phase: LifecyclePhase) {
  return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition'
}
function readingPathwayLabel(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'acquisition') return 'Learn to Read'
  if (pathway.kind === 'mastery') return 'Reading Mastery'
  return pathway.cycle && pathway.cycle > 1 ? `Reading Test Review ${pathway.cycle}` : 'Reading Test Review'
}

export function App({ now = () => new Date(), manualTestDateLabel }: { now?: AppClock; manualTestDateLabel?: string }) {
  const [auth, setAuth] = useState<AuthState>(() =>
    firebaseConfigReady
      ? { status: 'loading', user: null, error: null }
      : { status: 'unconfigured', user: null, error: null },
  )
  useEffect(() => subscribeAuth(setAuth), [])
  const content =
    auth.status === 'loading' ? (
      <div className="auth-shell">
        <div className="auth-card">
          <Sparkles size={28} />
          <h1>Loading Weekly Dictation</h1>
          <p>Checking your secure family session…</p>
        </div>
      </div>
    ) : firebaseConfigReady && auth.status === 'signed-out' ? (
      <Suspense
        fallback={
          <div className="auth-shell">
            <div className="auth-card" role="status">
              Loading sign in…
            </div>
          </div>
        }
      >
        <AuthScreen />
      </Suspense>
    ) : firebaseConfigReady ? (
      <AuthenticatedApp auth={auth} now={now} />
    ) : (
      <Suspense
        fallback={
          <div className="auth-shell">
            <div className="auth-card">
              <ShieldCheck size={28} />
              <h1>Checking browser progress</h1>
            </div>
          </div>
        }
      >
        <LocalRestoreGate>
          <AuthenticatedApp auth={auth} now={now} />
        </LocalRestoreGate>
      </Suspense>
    )
  return (
    <>
      {manualTestDateLabel && (
        <div className="manual-test-date-banner" role="status">
          {manualTestDateLabel}
          <span>Development only</span>
        </div>
      )}
      {content}
    </>
  )
}

function AuthenticatedApp({ auth, now }: { auth: AuthState; now: AppClock }) {
  const workspaceCapabilities = useMemo(() => createFirestoreWorkspaceCapabilities(window.localStorage), [])
  const practicePersistence = useMemo(() => createBrowserPracticePersistence(window.localStorage), [])
  const [baseView, setView] = useState<BaseView>('home')
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [familyChildren, setFamilyChildren] = useState<Child[]>(firebaseConfigReady ? [] : demoChildren)
  const [selectedChildId, setSelectedChildId] = useState(
    () => localStorageGet('weekly-dictation-child') || demoChildren[0].id,
  )
  const [state, setState] = useState<AppState>(() => {
    const initial = firebaseConfigReady ? createInitialState() : loadLocalWorkspace(workspaceCapabilities.local)
    return { ...initial, tier2ReadingProgressV1: readLocalTier2ReadingProgress(window.localStorage) }
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const [activeExperience, setActiveExperience] = useState<ActiveExperience>(null)
  const [practiceStartInFlight, setPracticeStartInFlight] = useState(false)
  const session = activeExperience?.kind === 'practice' ? activeExperience.session : null
  const readingPathway = activeExperience?.kind === 'reading' ? activeExperience.pathway : null
  const readingExperience = activeExperience?.kind === 'reading' ? activeExperience : null
  const view: View =
    activeExperience?.kind === 'practice' ? 'practice' : activeExperience?.kind === 'reading' ? 'reading' : baseView
  const activityControlsLocked = activeExperience !== null || practiceStartInFlight
  const setSession = useCallback(
    (next: PracticeSession | null | ((current: PracticeSession | null) => PracticeSession | null)) => {
      setActiveExperience((current) => {
        const currentSession = current?.kind === 'practice' ? current.session : null
        const value = typeof next === 'function' ? next(currentSession) : next
        if (value) return { kind: 'practice', session: value }
        return current?.kind === 'practice' ? null : current
      })
    },
    [],
  )
  const setReadingPathway = useCallback(
    (pathway: Tier2ReadingPathway | null) => {
      setActiveExperience((current) =>
        pathway
          ? {
              kind: 'reading',
              pathway,
              sessionId: current?.kind === 'reading' ? current.sessionId : createSessionId(),
              startedAt: current?.kind === 'reading' ? current.startedAt : now().toISOString(),
            }
          : current?.kind === 'reading'
            ? null
            : current,
      )
    },
    [now],
  )
  const completedSessionRef = useRef<string | null>(null)
  const completionInFlightRef = useRef<string | null>(null)
  const cloudSessionsRef = useRef(new Map<string, CloudSession>())
  const [showChildMenu, setShowChildMenu] = useState(false)
  const [showProfiles, setShowProfiles] = useState(false)
  const [showLocalBackup, setShowLocalBackup] = useState(false)
  const [completedSummary, setCompletedSummary] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(Boolean(auth.user))
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [toast, setToast] = useState<AppToast | null>(null)
  const [promotionError, setPromotionError] = useState<string | null>(null)
  const [promotionInFlight, setPromotionInFlight] = useState(false)
  const [practiceStartError, setPracticeStartError] = useState<string | null>(null)
  const [curriculumSourceMessage, setCurriculumSourceMessage] = useState<string | null>(
    firebaseConfigReady ? null : 'Updating lessons from Google Slides…',
  )
  const [curriculumSourceError, setCurriculumSourceError] = useState<string | null>(null)
  const [curriculumRefreshAttempt, setCurriculumRefreshAttempt] = useState(0)
  const selectedChild =
    familyChildren.find((child) => child.id === selectedChildId) ||
    familyChildren.find((child) => child.active) ||
    familyChildren[0]
  const cloudScope = family && selectedChild ? { familyId: family.id, childId: selectedChild.id } : null
  const readingCloudWritesRef = useRef<Promise<unknown>>(Promise.resolve())
  const notifyActionError = useCallback((message: string) => {
    setToast({ id: Date.now(), message })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 6000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const queueReadingCloudSave = useCallback(
    (progress: Tier2ReadingProgressRecord) => {
      if (!auth.user || !cloudScope) return
      const scope = cloudScope
      readingCloudWritesRef.current = readingCloudWritesRef.current
        .catch(() => undefined)
        .then(() => practicePersistence.reading.save(scope, progress))
        .catch((error) => {
          const message = `Reading progress could not sync to Firebase. ${authErrorMessage(error)}`
          setCloudError(message)
          notifyActionError(message)
        })
    },
    [auth.user, cloudScope?.familyId, cloudScope?.childId, notifyActionError, practicePersistence],
  )

  useEffect(() => {
    if (!writeLocalTier2ReadingProgress(window.localStorage, state.tier2ReadingProgressV1 || [])) {
      setCloudError('Reading progress could not be saved on this device.')
    }
  }, [state.tier2ReadingProgressV1])
  const practiceCompletionPersistence = cloudScope
    ? {
        completeSession: (
          cloudSession: CloudSession,
          attempts: Parameters<typeof practicePersistence.sessions.complete>[2],
          scores: Parameters<typeof practicePersistence.sessions.complete>[3],
          nextState: AppState,
          completedAt: string,
        ) => practicePersistence.sessions.complete(cloudScope, cloudSession, attempts, scores, nextState, completedAt),
        finishSession: (
          cloudSession: CloudSession,
          status: 'partial' | 'completed' | 'skipped',
          attempts: Parameters<typeof practicePersistence.sessions.finish>[3],
          scores: Parameters<typeof practicePersistence.sessions.finish>[4],
          nextState: AppState,
          completedAt: string,
        ) =>
          practicePersistence.sessions.finish(
            cloudScope,
            cloudSession,
            status,
            attempts,
            scores,
            nextState,
            completedAt,
          ),
        discardTestReview: (
          cloudSession: CloudSession,
          attempts: Parameters<typeof practicePersistence.sessions.skipTestReview>[2],
          nextState: AppState,
          completedAt: string,
        ) => practicePersistence.sessions.skipTestReview(cloudScope, cloudSession, attempts, nextState, completedAt),
      }
    : undefined
  const cloudPracticeEnabled = Boolean(auth.user && cloudScope)
  const practiceTransitionPersistence = {
    cloud: cloudPracticeEnabled,
    saveLocalState: practicePersistence.local.saveState,
    journalWarmup: practicePersistence.warmup.journal,
    acknowledgeWarmup: practicePersistence.warmup.acknowledge,
    commitWarmup: cloudPracticeEnabled
      ? (transition: Parameters<typeof practicePersistence.warmup.commit>[1]) =>
          practicePersistence.warmup.commit(cloudScope!, transition)
      : undefined,
    updateCloudSession: cloudPracticeEnabled
      ? (cloudSession: CloudSession, patch: Partial<CloudSession>) =>
          practicePersistence.sessions.update(cloudScope!, cloudSession, patch)
      : undefined,
    abandonCloudSession: cloudPracticeEnabled
      ? (cloudSession: CloudSession) => practicePersistence.sessions.abandon(cloudScope!, cloudSession)
      : undefined,
  }
  const runPracticeBackgroundTasks = (tasks: PracticeAnswerBackgroundTask[]) => {
    for (const task of tasks) {
      void task.promise
        .then((value) => {
          if (task.onSuccess) setState((existing) => task.onSuccess!(existing))
          if (task.updatedCloudSessionId && value)
            cloudSessionsRef.current.set(task.updatedCloudSessionId, value as CloudSession)
        })
        .catch((error) => {
          setCloudError(
            task.failureMessage ? `${task.failureMessage} ${authErrorMessage(error)}` : authErrorMessage(error),
          )
        })
    }
  }
  const practiceProfile = productionSourceIsActive(selectedChild?.grade, selectedChild?.schoolYear)
    ? practiceProfileForGrade(selectedChild?.grade)
    : null
  const lifecycleStrategy = lifecycleStrategyForGradeAndSchoolYear(selectedChild?.grade, selectedChild?.schoolYear)
  const configuredReadingProfile = productionSourceIsActive(selectedChild?.grade, selectedChild?.schoolYear)
    ? tier2ReadingProfileForScope(selectedChild?.grade, lifecycleStrategy?.schoolYearKey)
    : null
  const readingProfile = configuredReadingProfile?.availability === 'main-app' ? configuredReadingProfile : null
  const primaryDatasets = useMemo(
    () => (selectedChild ? filterDatasetsForChild(state.datasets, selectedChild.grade, selectedChild.schoolYear) : []),
    [selectedChild, state.datasets],
  )
  const currentDate = now()
  const currentDateKey = localDateKey(currentDate)
  const lifecycleResolution = useMemo(
    () => (lifecycleStrategy ? resolveDatasetLifecycles(primaryDatasets, currentDate) : null),
    [lifecycleStrategy, primaryDatasets, currentDateKey],
  )
  const readingLifecycle = useMemo(
    () =>
      selectedChild && readingProfile
        ? resolveTier2ReadingLifecycle(
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
          )
        : null,
    [selectedChild, readingProfile, primaryDatasets, currentDateKey],
  )
  const primaryChoices = (lifecycleResolution ? practiceTargetsForLifecycle(lifecycleResolution) : []).filter(
    (choice) => Boolean(practiceProfile && choice.dataset.words.length > 0 && !choice.dataset.isWritingWorkshop),
  )
  const warmupPreview = useMemo(
    () =>
      selectedChild && practiceProfile && lifecycleResolution
        ? prepareAdaptiveWarmupVisit({
            state,
            childId: selectedChild.id,
            grade: selectedChild.grade,
            schoolYear: selectedChild.schoolYear,
            datasets: primaryDatasets,
            lifecycleResolution,
            visitType: 'standalone',
            visitId: 'warmup-preview-only',
            createdAt: currentDate.toISOString(),
            random: () => 0.999,
          })
        : null,
    [selectedChild, practiceProfile, primaryDatasets, state, currentDateKey, lifecycleResolution],
  )
  const warmupWordCount = warmupPreview?.status === 'ready' ? warmupPreview.visit.assignedQueueSize : 0
  const promotionSuggested = Boolean(selectedChild && shouldSuggestGradePromotion(selectedChild, currentDate))

  useEffect(() => {
    localStorageSet('weekly-dictation-child', selectedChildId)
  }, [selectedChildId])
  useEffect(() => {
    if (!auth.user) localStorageSet(APP_STATE_KEY, JSON.stringify(state))
  }, [state, auth.user])

  useEffect(() => {
    if (firebaseConfigReady) return
    const controller = new AbortController()
    setCurriculumSourceMessage('Updating lessons from Google Slides…')
    setCurriculumSourceError(null)
    void import('./automaticGrade2Curriculum.ts')
      .then(async (curriculum) => ({
        curriculum,
        loaded: await curriculum.fetchAutomaticGrade2Curriculum({ signal: controller.signal }),
      }))
      .then(({ curriculum, loaded: { snapshot, datasetCount } }) => {
        if (controller.signal.aborted) return
        const hydrated = curriculum.hydrateAutomaticGrade2Curriculum(stateRef.current, snapshot)
        setState(hydrated)
        setCurriculumSourceMessage(`Loaded ${datasetCount} weekly datasets automatically from Google Slides.`)
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        setCurriculumSourceMessage(null)
        setCurriculumSourceError(
          error instanceof Error ? error.message : 'The Grade 2 curriculum source could not be loaded.',
        )
      })
    return () => controller.abort()
  }, [curriculumRefreshAttempt])

  useEffect(() => {
    const user = auth.user
    if (!user) return
    const controller = new AbortController()
    setDataLoading(true)
    setCloudError(null)
    void readFamilyWorkspace(user, workspaceCapabilities.family, controller.signal)
      .then(({ family: loadedFamily, children }) => {
        setFamily(loadedFamily)
        setFamilyChildren(children)
        setSelectedChildId((current) =>
          children.length && !children.some((child) => child.id === current)
            ? children.find((child) => child.active)?.id || children[0].id
            : current,
        )
      })
      .catch((error) => {
        if (!isWorkspaceSynchronizationAborted(error)) setCloudError(authErrorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDataLoading(false)
      })
    return () => controller.abort()
  }, [auth.user?.uid])

  useEffect(() => {
    if (!auth.user || !family || !selectedChild) return
    const controller = new AbortController()
    const scope = {
      familyId: family.id,
      childId: selectedChild.id,
      grade: selectedChild.grade,
      schoolYear: selectedChild.schoolYear,
    }
    setDataLoading(true)
    void synchronizeChildWorkspace({
      scope,
      capabilities: workspaceCapabilities.child,
      synchronizedAt: now(),
      signal: controller.signal,
    })
      .then(({ state: hydrated }) => {
        setState((current) => ({
          ...hydrated,
          tier2ReadingProgressV1: mergeTier2ReadingProgress(
            current.tier2ReadingProgressV1 || [],
            hydrated.tier2ReadingProgressV1 || [],
          ),
        }))
      })
      .catch((error) => {
        if (!isWorkspaceSynchronizationAborted(error)) setCloudError(authErrorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDataLoading(false)
      })
    return () => controller.abort()
  }, [auth.user?.uid, family?.id, selectedChild?.id, selectedChild?.grade, selectedChild?.schoolYear])

  const chooseChild = (childId: string) => {
    if (activityControlsLocked) return
    setSelectedChildId(childId)
    setShowChildMenu(false)
    setShowProfiles(false)
    setView('home')
  }
  const confirmPromotion = async () => {
    if (!selectedChild) return
    const promoted = nextGrade(selectedChild.grade)
    if (!promoted) return
    setPromotionError(null)
    setPromotionInFlight(true)
    try {
      if (family) {
        const updated = await practicePersistence.profiles.updateChild(family.id, selectedChild.id, {
          grade: promoted,
          schoolYear: DEFAULT_SCHOOL_YEAR,
          gradeEffectiveDate: currentDateKey,
        })
        setFamilyChildren((items) =>
          items.map((item) =>
            item.id === selectedChild.id
              ? { ...item, ...updated, name: updated.nickname, initials: updated.nickname.slice(0, 1).toUpperCase() }
              : item,
          ),
        )
      } else
        setFamilyChildren((items) =>
          items.map((item) =>
            item.id === selectedChild.id
              ? { ...item, grade: promoted, schoolYear: DEFAULT_SCHOOL_YEAR, gradeEffectiveDate: currentDateKey }
              : item,
          ),
        )
    } catch (error) {
      const message = `Promotion could not be saved. ${authErrorMessage(error)}`
      setPromotionError(message)
      notifyActionError(message)
    } finally {
      setPromotionInFlight(false)
    }
  }
  const startPractice = useCallback(
    async (target: PracticeTarget | null) => {
      if (!selectedChild || !lifecycleResolution || practiceStartInFlight) return
      setPracticeStartInFlight(true)
      setPracticeStartError(null)
      setShowChildMenu(false)
      const id = createSessionId()
      const cloud = Boolean(auth.user && cloudScope)
      try {
        const result = await startPracticeOperation({
          state,
          child: selectedChild,
          target,
          primaryDatasets,
          lifecycleResolution,
          sessionId: id,
          startedAt: now(),
          formatError: authErrorMessage,
          persistence: {
            cloud,
            saveLocalState: practicePersistence.local.saveState,
            journalWarmup: practicePersistence.warmup.journal,
            acknowledgeWarmup: practicePersistence.warmup.acknowledge,
            ensureWarmupSeed: cloud
              ? (visit, mastery, rotations) =>
                  practicePersistence.warmup.ensureSeed(cloudScope!, visit, mastery, rotations)
              : undefined,
            commitWarmupTransition: cloud
              ? (transition) => practicePersistence.warmup.commit(cloudScope!, transition)
              : undefined,
            startCloudSession: cloud ? (input) => practicePersistence.sessions.start(cloudScope!, input) : undefined,
            journalAcquisition: practicePersistence.acquisition.journal,
            acknowledgeAcquisition: practicePersistence.acquisition.acknowledge,
            commitAcquisitionCheckpoint: cloud
              ? (envelope, checkpoint) => practicePersistence.acquisition.commit(cloudScope!, envelope, checkpoint)
              : undefined,
          },
        })
        if (result.status === 'no-op') return
        if (result.status === 'blocked') {
          if (result.state) setState(result.state)
          setPracticeStartError(result.message)
          notifyActionError(result.message)
          return
        }
        if (result.cloudSession) cloudSessionsRef.current.set(id, result.cloudSession)
        setState(result.state)
        completedSessionRef.current = null
        setCompletedSummary(null)
        if (result.warning) setCloudError(result.warning)
        setSession(result.session)
      } catch (error) {
        const message = `Practice could not start. ${authErrorMessage(error)}`
        setPracticeStartError(message)
        notifyActionError(message)
      } finally {
        setPracticeStartInFlight(false)
      }
    },
    [
      auth.user,
      cloudScope,
      lifecycleResolution,
      now,
      practicePersistence,
      practiceStartInFlight,
      primaryDatasets,
      selectedChild,
      state,
      notifyActionError,
    ],
  )
  const leavePractice = (nextView: BaseView) => {
    const current = session
    const cloud = current?.cloudSessionId ? cloudSessionsRef.current.get(current.cloudSessionId) : undefined
    const result = leavePracticeOperation({
      state,
      session: current,
      occurredAt: now(),
      persistence: practiceTransitionPersistence,
      cloudSession: cloud,
      formatError: authErrorMessage,
    })
    if (result.state !== state) setState(result.state)
    if (result.message) setCloudError(result.message)
    runPracticeBackgroundTasks(result.background)
    setSession(null)
    setView(nextView)
  }
  const exitPractice = () => leavePractice('home')
  const startReading = (pathway: Tier2ReadingPathway) => {
    if (!selectedChild || !readingProfile) return
    setShowChildMenu(false)
    setCompletedSummary(null)
    const saved = activeTier2ReadingProgress(state, selectedChild.id, selectedChild.schoolYear, readingProfile, pathway)
    setActiveExperience({
      kind: 'reading',
      pathway,
      sessionId: saved?.id || createSessionId(),
      startedAt: saved?.startedAt || now().toISOString(),
    })
  }
  const checkpointReading = (progress: Tier2ReadingProgressRecord) => {
    setState((current) => {
      try {
        return checkpointTier2ReadingProgress(current, progress)
      } catch (error) {
        window.queueMicrotask(() =>
          setCloudError(error instanceof Error ? error.message : 'Reading progress could not be saved.'),
        )
        return current
      }
    })
    queueReadingCloudSave(progress)
  }
  const finishReading = (summary: Tier2ReadingPracticeSummary, progress?: Tier2ReadingProgressRecord) => {
    if (progress) {
      const completed = completedTier2ReadingProgress(progress, summary, now().toISOString())
      setState((current) => {
        try {
          return completeTier2ReadingProgress(current, progress, summary, completed.completedAt || completed.updatedAt)
        } catch (error) {
          window.queueMicrotask(() =>
            setCloudError(error instanceof Error ? error.message : 'Completed reading progress could not be saved.'),
          )
          return current
        }
      })
      queueReadingCloudSave(completed)
    }
    setCompletedSummary(
      `Reading practice complete: ${summary.correct}/${summary.attempted} assessed responses marked correct. Progress metadata was saved${auth.user && cloudScope ? ' on this device and synced to Firebase' : ' on this device'}; microphone audio was not saved.`,
    )
    setReadingPathway(null)
    setView('home')
  }
  const beginWarmup = () => {
    setSession((current) => {
      if (!current || current.stage !== 'warmup-intro') return current
      if (current.queue.length === 0) return primaryStartState(current)
      return { ...current, stage: 'interstitial', index: current.warmupResumePosition || 0 }
    })
  }
  const skipWarmup = () => {
    const current = session
    const cloud = current?.cloudSessionId ? cloudSessionsRef.current.get(current.cloudSessionId) : undefined
    const result = skipWarmupOperation({
      state,
      session: current,
      occurredAt: now(),
      persistence: practiceTransitionPersistence,
      cloudSession: cloud,
      formatError: authErrorMessage,
    })
    if (result.status === 'ignored') return
    if (result.status === 'error') {
      setCloudError(result.message)
      return
    }
    setState(result.state)
    setSession(result.session)
    runPracticeBackgroundTasks(result.background)
  }
  const continueToPrimaryAfterPartialWarmup = () => {
    const current = session
    const cloud = current?.cloudSessionId ? cloudSessionsRef.current.get(current.cloudSessionId) : undefined
    const result = continueAfterPartialWarmupOperation({
      state,
      session: current,
      occurredAt: now(),
      persistence: practiceTransitionPersistence,
      cloudSession: cloud,
      formatError: authErrorMessage,
    })
    if (result.status === 'ignored') return
    if (result.status === 'error') {
      setCloudError(result.message)
      return
    }
    setState(result.state)
    setSession(result.session)
    runPracticeBackgroundTasks(result.background)
  }
  const completeInterstitial = async () => {
    const result = await advancePracticeInterstitial({
      state,
      session,
      child: selectedChild,
      primaryDatasets,
      lifecycleResolution,
      occurredAt: now(),
      formatError: authErrorMessage,
      persistence: {
        cloud: cloudPracticeEnabled,
        saveLocalState: practicePersistence.local.saveState,
        journalWarmup: practicePersistence.warmup.journal,
        acknowledgeWarmup: practicePersistence.warmup.acknowledge,
        commitWarmup: cloudPracticeEnabled
          ? (transition) => practicePersistence.warmup.commit(cloudScope!, transition)
          : undefined,
      },
    })
    if (result.status === 'ignored') return
    if (result.status === 'blocked') {
      setCloudError(result.message)
      return
    }
    if (result.status === 'completed') {
      await completeSession(result.session, result.state)
      return
    }
    if (result.state !== state) setState(result.state)
    setSession(result.session)
  }
  const completeDictationWord = (revealMethod: 'timer' | 'skip_timer' = 'timer') =>
    setSession((current) => {
      if (!current || current.stage !== 'dictation') return current
      if (current.segment === 'primary' && current.acquisition) {
        const prompt = current.acquisition.prompt
        if (!prompt) return current
        return {
          ...current,
          acquisition: revealAcquisitionPrompt(current.acquisition),
          currentRevealMethod: revealMethod,
          stage: 'review',
        }
      }
      if (current.segment === 'warmup' && current.adaptiveWarmupVisitId)
        return { ...current, currentRevealMethod: revealMethod, stage: 'review' }
      if (current.index < current.queue.length - 1)
        return { ...current, stage: 'interstitial', index: current.index + 1 }
      if (current.segment === 'warmup') return { ...current, stage: 'review', index: 0 }
      return { ...current, stage: 'complete' }
    })
  const startPrimaryReview = () => {
    if (session?.stage === 'complete' && session.primaryQueue.length === 0) {
      void completeSession({ ...session, segment: 'primary', queue: [], primaryAnswers: [] })
      return
    }
    setSession((current) =>
      current && current.stage === 'complete' ? { ...current, stage: 'review', index: 0 } : current,
    )
  }
  const completeSession = async (finished: PracticeSession, baseState: AppState = state) => {
    if (completionInFlightRef.current) return
    completionInFlightRef.current = finished.id
    const storedCloud = finished.cloudSessionId ? cloudSessionsRef.current.get(finished.cloudSessionId) : undefined
    const completionAttempt = prepareCloudCompletionAttempt(storedCloud, now())
    const cloud = completionAttempt.session
    const completionDate = completionAttempt.completedAt
    if (cloud) cloudSessionsRef.current.set(cloud.id, cloud)
    const outcome = completePracticeOperation({
      state: baseState,
      session: finished,
      completedAt: completionDate,
      cloud:
        cloud && practiceCompletionPersistence
          ? { session: cloud, persistence: practiceCompletionPersistence }
          : undefined,
    })
    setCloudError(null)
    try {
      await outcome.cloudCommit
      setState(outcome.state)
      setCompletedSummary(outcome.summary)
      setSession(null)
      setView('home')
      if (cloud) cloudSessionsRef.current.delete(cloud.id)
    } catch (error) {
      completedSessionRef.current = null
      setCloudError(`Your score or adaptive progress could not be confirmed in the cloud: ${authErrorMessage(error)}`)
    } finally {
      if (completionInFlightRef.current === finished.id) completionInFlightRef.current = null
    }
  }
  const finishAcquisitionForToday = async () => {
    const current = session
    if (!current?.acquisition || current.primaryPhase !== 'acquisition') return
    if (completionInFlightRef.current) return
    completionInFlightRef.current = current.id
    const storedCloud = current.cloudSessionId ? cloudSessionsRef.current.get(current.cloudSessionId) : undefined
    const completionAttempt = prepareCloudCompletionAttempt(storedCloud, now())
    const cloud = completionAttempt.session
    const completionDate = completionAttempt.completedAt
    if (cloud) cloudSessionsRef.current.set(cloud.id, cloud)
    const outcome = completeAcquisitionForTodayOperation({
      state,
      session: current,
      completedAt: completionDate,
      cloud:
        cloud && practiceCompletionPersistence
          ? { session: cloud, persistence: practiceCompletionPersistence }
          : undefined,
    })
    setCloudError(null)
    try {
      await outcome.cloudCommit
      setState(outcome.state)
      setCompletedSummary(outcome.summary)
      setSession(null)
      setView('home')
      if (cloud) cloudSessionsRef.current.delete(cloud.id)
    } catch (error) {
      setCloudError(`Acquisition could not be finalized in the cloud: ${authErrorMessage(error)}`)
    } finally {
      if (completionInFlightRef.current === current.id) completionInFlightRef.current = null
    }
  }
  const completeDeferredWritingTestReview = (completion: TestReviewCompletion<Word>) => {
    const current = session
    if (!current || current.segment !== 'primary' || current.primaryPhase !== 'test-review') return
    if (completedSessionRef.current === current.id) return
    const primaryAnswers = writingSessionAnswers(completion)
    completedSessionRef.current = current.id
    void completeSession({
      ...current,
      stage: 'complete',
      queue: current.primaryQueue,
      index: current.primaryQueue.length,
      primaryAnswers,
    })
  }
  const discardTestReview = async () => {
    const current = session
    if (!current || current.primaryPhase !== 'test-review') return
    if (completionInFlightRef.current) return
    completionInFlightRef.current = current.id
    const storedCloud = current.cloudSessionId ? cloudSessionsRef.current.get(current.cloudSessionId) : undefined
    const completionAttempt = prepareCloudCompletionAttempt(storedCloud, now())
    const cloud = completionAttempt.session
    const completionDate = completionAttempt.completedAt
    if (cloud) cloudSessionsRef.current.set(cloud.id, cloud)
    const outcome = discardTestReviewOperation({
      state,
      session: current,
      completedAt: completionDate,
      cloud:
        cloud && practiceCompletionPersistence
          ? { session: cloud, persistence: practiceCompletionPersistence }
          : undefined,
    })
    setCloudError(null)
    try {
      await outcome.cloudCommit
      setState(outcome.state)
      setCompletedSummary(outcome.summary)
      setSession(null)
      setView('home')
      if (cloud) cloudSessionsRef.current.delete(cloud.id)
    } catch (error) {
      setCloudError(`The skipped Test Review could not be confirmed in the cloud: ${authErrorMessage(error)}`)
    } finally {
      if (completionInFlightRef.current === current.id) completionInFlightRef.current = null
    }
  }
  const answer = (correct: PracticeAnswer) => {
    if (typeof correct === 'object') {
      if (correct.kind === 'deferred-writing-test-review') completeDeferredWritingTestReview(correct.completion)
      return
    }
    if (correct === 'skip-warmup') {
      skipWarmup()
      return
    }
    if (correct === 'continue-primary') {
      continueToPrimaryAfterPartialWarmup()
      return
    }
    if (correct === 'skip-test-review') {
      void discardTestReview()
      return
    }
    if (correct === 'done') {
      void finishAcquisitionForToday()
      return
    }
    const current = session
    const cloud = current?.cloudSessionId ? cloudSessionsRef.current.get(current.cloudSessionId) : undefined
    const cloudEnabled = Boolean(auth.user && cloudScope)
    const result = recordPracticeAnswerOperation({
      state,
      session: current,
      correct,
      occurredAt: now(),
      cloudSession: cloud,
      formatError: authErrorMessage,
      persistence: {
        cloud: cloudEnabled,
        saveLocalState: practicePersistence.local.saveState,
        journalAcquisition: practicePersistence.acquisition.journal,
        acknowledgeAcquisition: practicePersistence.acquisition.acknowledge,
        commitAcquisition: cloudEnabled
          ? (envelope, checkpoint) => practicePersistence.acquisition.commit(cloudScope!, envelope, checkpoint)
          : undefined,
        journalWarmup: practicePersistence.warmup.journal,
        acknowledgeWarmup: practicePersistence.warmup.acknowledge,
        commitWarmup: cloudEnabled
          ? (transition) => practicePersistence.warmup.commit(cloudScope!, transition)
          : undefined,
        saveAttempt: cloudEnabled
          ? (sessionId, attempt) => practicePersistence.sessions.saveAttempt(cloudScope!, sessionId, attempt)
          : undefined,
        updateSession: cloudEnabled
          ? (cloudSession, patch) => practicePersistence.sessions.update(cloudScope!, cloudSession, patch)
          : undefined,
      },
    })
    if (result.status === 'ignored') return
    if (result.status === 'error') {
      setCloudError(result.message)
      return
    }
    if (result.state) setState(result.state)
    runPracticeBackgroundTasks(result.background)
    if (result.completion) {
      if (completedSessionRef.current === result.completion.session.id) return
      completedSessionRef.current = result.completion.session.id
      void completeSession(result.completion.session, result.completion.state)
      return
    }
    if (result.session) setSession(result.session)
  }
  const navigate = (nextView: BaseView) => {
    if (view === 'practice') {
      leavePractice(nextView)
      return
    }
    if (view === 'reading') setReadingPathway(null)
    setView(nextView)
  }
  if (dataLoading && auth.user && familyChildren.length === 0)
    return (
      <div className="auth-shell">
        <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
        <div className="auth-card">
          <Sparkles size={28} />
          <h1>Loading your family</h1>
          <p>Securely loading children and weekly datasets…</p>
        </div>
      </div>
    )
  if (!selectedChild)
    return (
      <div className="auth-shell">
        <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
        <div className="auth-card">
          <h1>Add a child to begin</h1>
          <p>{cloudError || 'Your family does not have an active child profile yet.'}</p>
          <button className="primary-button" onClick={() => setShowProfiles(true)}>
            Add child
          </button>
        </div>
        {showProfiles && family && (
          <Suspense
            fallback={
              <div className="modal-backdrop" role="status">
                Loading profile manager…
              </div>
            }
          >
            <ProfileModal
              children={familyChildren}
              selectedChildId=""
              onSelect={() => undefined}
              onClose={() => setShowProfiles(false)}
              onAdd={async (input) => {
                const created = await practicePersistence.profiles.createChild(family.id, input)
                setFamilyChildren([
                  {
                    ...created,
                    name: created.nickname,
                    color: 'coral',
                    initials: created.nickname.slice(0, 1).toUpperCase(),
                  },
                ])
                setSelectedChildId(created.id)
                setShowProfiles(false)
              }}
              onUpdate={async () => undefined}
              onError={notifyActionError}
            />
          </Suspense>
        )}
      </div>
    )
  const legacyCount = state.legacyRecords.filter((record) => record.childId === selectedChild.id).length
  const showLearningHome =
    primaryChoices.length > 0 ||
    (selectedChild.grade === 'Grade 2' && (warmupWordCount > 0 || primaryDatasets.length > 0))
  return (
    <div className="app-shell">
      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')} aria-label="Go to home">
          <span className="brand-mark">
            <Sparkles size={17} strokeWidth={2.5} />
          </span>
          <span>
            weekly<span className="brand-accent">dictation</span>
          </span>
        </button>
        <div className="topbar-actions">
          {activityControlsLocked && (
            <span className="visually-hidden" id="profile-switcher-locked-description">
              Exit the current activity before switching profiles or signing out.
            </span>
          )}
          {!firebaseConfigReady && selectedChild.grade === 'Grade 2' && (
            <button
              className="local-backup-control"
              type="button"
              aria-label="Back up Grade 2 browser data"
              disabled={view === 'practice' || view === 'reading'}
              onClick={() => setShowLocalBackup(true)}
            >
              <ShieldCheck size={14} /> Protect progress
            </button>
          )}
          {!firebaseConfigReady && curriculumSourceMessage && (
            <span className="curriculum-source-status" role="status">
              {curriculumSourceMessage}
            </span>
          )}
          <button
            className="profile-switcher"
            disabled={activityControlsLocked}
            aria-describedby={activityControlsLocked ? 'profile-switcher-locked-description' : undefined}
            onClick={() => setShowChildMenu((current) => !current)}
          >
            <span className={`avatar avatar-${selectedChild.color}`}>{selectedChild.initials}</span>
            <span className="profile-switcher-copy">
              <small>Practicing as</small>
              {selectedChild.name}
            </span>
            <ChevronDown size={16} />
          </button>
          {showChildMenu && !activityControlsLocked && (
            <div className="child-menu">
              <p>Switch child</p>
              {familyChildren
                .filter((child) => child.active)
                .map((child) => (
                  <button
                    key={child.id}
                    className={child.id === selectedChild.id ? 'selected' : ''}
                    onClick={() => chooseChild(child.id)}
                  >
                    <span className={`avatar avatar-${child.color}`}>{child.initials}</span>
                    <span>
                      <strong>{child.name}</strong>
                      <small>{child.grade}</small>
                    </span>
                    {child.id === selectedChild.id && <Check size={15} />}
                  </button>
                ))}
              <button
                className="manage-children"
                onClick={() => {
                  setShowChildMenu(false)
                  setShowProfiles(true)
                }}
              >
                Manage profiles <ArrowLeft size={14} />
              </button>
              <button className="manage-children" onClick={() => signOut()}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="main-content">
        {cloudError && auth.user && <div className="error-banner">{cloudError}</div>}
        {!firebaseConfigReady && curriculumSourceError && (
          <div className="error-banner">
            Weekly vocabulary could not be updated automatically. Existing lessons and progress were preserved.{' '}
            {curriculumSourceError}{' '}
            <button type="button" onClick={() => setCurriculumRefreshAttempt((attempt) => attempt + 1)}>
              Try again
            </button>
          </div>
        )}
        {promotionSuggested && (
          <div className="promotion-banner" aria-busy={promotionInFlight}>
            <div>
              <span>Your {selectedChild.grade} school year is ready to advance.</span>
              {promotionError && (
                <p className="action-inline-error" role="alert">
                  {promotionError}
                </p>
              )}
            </div>
            <button disabled={promotionInFlight} onClick={() => void confirmPromotion()}>
              {promotionInFlight ? 'Saving…' : `Move to ${nextGrade(selectedChild.grade)}`}
            </button>
          </div>
        )}
        {view === 'home' && practiceStartError && (
          <div className="action-inline-error action-inline-error-surface" role="alert">
            {practiceStartError}
          </div>
        )}
        {view === 'home' && !practiceProfile && (
          <Suspense
            fallback={
              <div className="page loading-surface" role="status">
                Loading practice options…
              </div>
            }
          >
            <UnsupportedPracticeView
              child={selectedChild}
              datasets={primaryDatasets}
              onHistory={() => setView('history')}
              onProfiles={() => setShowProfiles(true)}
            />
          </Suspense>
        )}
        {view === 'home' && Boolean(practiceProfile) && showLearningHome && lifecycleResolution && (
          <HomeView
            child={selectedChild}
            profile={practiceProfile!}
            datasets={primaryDatasets}
            scores={state.scores}
            acquisitionTarget={primaryChoices.find((choice) => choice.phase === 'acquisition') || null}
            testReviewTarget={primaryChoices.find((choice) => choice.phase === 'test-review') || null}
            readingLifecycle={readingLifecycle}
            warmupWords={warmupWordCount}
            completedSummary={completedSummary}
            currentDate={currentDate}
            lifecycleResolution={lifecycleResolution}
            onStart={(target) => void startPractice(target)}
            onStartWarmup={() => void startPractice(null)}
            onStartReading={startReading}
            onHistory={() => setView('history')}
            onProfiles={() => setShowProfiles(true)}
          />
        )}
        {view === 'home' && Boolean(practiceProfile) && !showLearningHome && (
          <Suspense
            fallback={
              <div className="page loading-surface" role="status">
                Loading practice options…
              </div>
            }
          >
            <NoDatasetView
              child={selectedChild}
              datasets={primaryDatasets}
              warmupWords={warmupWordCount}
              localMode={!firebaseConfigReady}
              onStartWarmup={() => void startPractice(null)}
              onHistory={() => setView('history')}
              onProfiles={() => setShowProfiles(true)}
            />
          </Suspense>
        )}
        {view === 'practice' && session && (
          <Suspense
            fallback={
              <div className="page loading-surface" role="status">
                Loading writing practice…
              </div>
            }
          >
            <PracticeView
              session={session}
              datasets={state.datasets}
              onExit={exitPractice}
              onBeginWarmup={beginWarmup}
              onInterstitialComplete={completeInterstitial}
              onDictationComplete={completeDictationWord}
              onStartReview={startPrimaryReview}
              onAnswer={answer}
              reviewInstruction={REVIEW_INSTRUCTION}
            />
          </Suspense>
        )}
        {view === 'reading' && readingPathway && readingProfile && (
          <Suspense
            fallback={
              <div className="page loading-surface" role="status">
                Loading reading practice…
              </div>
            }
          >
            <Tier2ReadingPractice
              key={readingExperience?.sessionId}
              profile={readingProfile}
              pathway={readingPathway}
              label={readingPathwayLabel(readingPathway)}
              onExit={() => {
                setReadingPathway(null)
                setView('home')
              }}
              onComplete={finishReading}
              persistence={
                readingExperience && selectedChild
                  ? {
                      sessionId: readingExperience.sessionId,
                      childId: selectedChild.id,
                      schoolYear: selectedChild.schoolYear,
                      startedAt: readingExperience.startedAt,
                      savedProgress: (state.tier2ReadingProgressV1 || []).find(
                        (progress) => progress.id === readingExperience.sessionId,
                      ),
                      onCheckpoint: checkpointReading,
                    }
                  : undefined
              }
              sessionNote={`Progress and self-assessments are saved on this device${auth.user && cloudScope ? ' and synced to Firebase' : ''} · microphone audio is never saved`}
            />
          </Suspense>
        )}
        {view === 'history' && (
          <Suspense
            fallback={
              <div className="page loading-surface" role="status">
                Loading progress…
              </div>
            }
          >
            <HistoryView
              child={selectedChild}
              datasets={primaryDatasets}
              scores={state.scores}
              legacyCount={legacyCount}
              legacyMasteryScores={state.monthlyRotationScores.filter((score) => score.childId === selectedChild.id)}
              warmupGraphPoints={(state.warmupGraphPointsV1 || []).filter(
                (point) => point.childId === selectedChild.id,
              )}
              readingProgress={(state.tier2ReadingProgressV1 || []).filter(
                (progress) => progress.childId === selectedChild.id,
              )}
              onBack={() => setView('home')}
            />
          </Suspense>
        )}
      </main>
      {view !== 'practice' && view !== 'reading' && (
        <nav className="bottom-nav" aria-label="Primary navigation">
          <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
            <Home size={19} />
            <span>Practice</span>
          </button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
            <BarChart3 size={19} />
            <span>Progress</span>
          </button>
          <button onClick={() => setShowProfiles(true)}>
            <Languages size={19} />
            <span>Profiles</span>
          </button>
        </nav>
      )}
      {showProfiles && (
        <Suspense
          fallback={
            <div className="modal-backdrop" role="status">
              Loading profile manager…
            </div>
          }
        >
          <ProfileModal
            children={familyChildren}
            selectedChildId={selectedChildId}
            onSelect={chooseChild}
            onClose={() => setShowProfiles(false)}
            onAdd={async (input) => {
              if (!family) return
              const created = await practicePersistence.profiles.createChild(family.id, input)
              setFamilyChildren((items) => [
                ...items,
                {
                  ...created,
                  name: created.nickname,
                  color: 'coral',
                  initials: created.nickname.slice(0, 1).toUpperCase(),
                },
              ])
              setSelectedChildId(created.id)
            }}
            onUpdate={async (childId, patch) => {
              if (!family) return
              const updated = await practicePersistence.profiles.updateChild(family.id, childId, patch)
              setFamilyChildren((items) =>
                items.map((item) =>
                  item.id === childId
                    ? {
                        ...item,
                        ...updated,
                        name: updated.nickname,
                        initials: updated.nickname.slice(0, 1).toUpperCase(),
                      }
                    : item,
                ),
              )
            }}
            onError={notifyActionError}
          />
        </Suspense>
      )}
      {showLocalBackup && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="backup-modal" role="status">
                Loading progress protection…
              </div>
            </div>
          }
        >
          <LocalBackupTools
            onClose={() => setShowLocalBackup(false)}
            state={state}
            selectedChildId={selectedChild.id}
            localWorkspace={workspaceCapabilities.local}
            onStateRestored={setState}
          />
        </Suspense>
      )}
    </div>
  )
}

function HomeView({
  child,
  profile,
  datasets,
  scores,
  acquisitionTarget,
  testReviewTarget,
  readingLifecycle,
  warmupWords,
  completedSummary,
  currentDate,
  lifecycleResolution,
  onStart,
  onStartWarmup,
  onStartReading,
  onHistory,
  onProfiles,
}: {
  child: Child
  profile: WritingPracticeProfile
  datasets: Dataset[]
  scores: DatasetScore[]
  acquisitionTarget: PracticeTarget | null
  testReviewTarget: PracticeTarget | null
  readingLifecycle: Tier2ReadingLifecycle | null
  warmupWords: number
  completedSummary: string | null
  currentDate: Date
  lifecycleResolution: ReturnType<typeof resolveDatasetLifecycles>
  onStart: (target: PracticeTarget) => void
  onStartWarmup: () => void
  onStartReading: (pathway: Tier2ReadingPathway) => void
  onHistory: () => void
  onProfiles: () => void
}) {
  const today = scores.filter(
    (score) => score.childId === child.id && score.sessionDate === localDateKey(currentDate),
  ).length
  const displayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    currentDate,
  )
  const orderedDatasets = sortDatasetsNewestFirst(datasets)
  const presentation = profile.presentation
  const warmupOptional = profile.preActivityWarmupRequirement === 'optional'
  if (child.grade === 'Grade 2') {
    const model = grade2LearningHubView({
      childName: child.name,
      datasets,
      masteredDatasets: lifecycleResolution.mastered,
      acquisitionTarget,
      testReviewTarget,
      readingLifecycle,
      warmupWordCount: warmupWords,
    })
    const launch = (request: Grade2LearningHubLaunch) => {
      if (request.kind === 'writing') onStart(request.target)
      else if (request.kind === 'reading') onStartReading(request.pathway)
      else onStartWarmup()
    }
    return (
      <div className="page grade2-learning-hub">
        {completedSummary && (
          <div className="success-banner">
            <span className="success-icon">
              <Check size={17} />
            </span>
            <span>
              <strong>Practice complete.</strong> {completedSummary}
            </span>
            <button onClick={onHistory}>
              See progress <ArrowLeft size={14} />
            </button>
          </div>
        )}
        <LearningHub model={model} onLaunch={launch} showTopbar={false} />
        <section className="section-heading grade2-record-heading">
          <div>
            <p className="eyebrow">Ninja Record</p>
            <h2>Every week stays on record</h2>
          </div>
          <button className="text-button" onClick={onHistory}>
            View progress <ArrowLeft size={15} />
          </button>
        </section>
        <div className="set-grid">
          {orderedDatasets.map((dataset, index) => (
            <SetCard
              key={dataset.id}
              dataset={dataset}
              lifecycle={requireDatasetLifecycle(lifecycleResolution, dataset.id)}
              score={latestScore(scores, child.id, dataset.id)}
              tone={index % 2 === 0 ? 'yellow' : 'lavender'}
            />
          ))}
        </div>
        <section className="today-strip">
          <div className="strip-icon">
            <Clock3 size={18} />
          </div>
          <div>
            <strong>
              {today
                ? `${today} dataset score${today === 1 ? '' : 's'} recorded today`
                : 'No dataset scores recorded today'}
            </strong>
            <span>
              Acquisition scores appear when “Done for today” is selected; Final Boss scores require the complete Test
              Review.
            </span>
          </div>
          <div className="strip-arrow">→</div>
        </section>
      </div>
    )
  }
  return (
    <div className="page home-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{presentation?.homeEyebrow || displayDate}</p>
          <h1>
            {presentation?.homeHeading || 'Ready when you are'}, <em>{child.name}.</em>
          </h1>
          <p className="subhead">
            {presentation?.homeDescription ||
              `Choose your activity. Warmup is offered first and ${warmupOptional ? 'may be skipped' : 'is required'}.`}
          </p>
        </div>
        <button className="mini-profile" onClick={onProfiles}>
          <span className={`avatar avatar-${child.color}`}>{child.initials}</span>
          <span>{child.grade}</span>
          <ChevronDown size={15} />
        </button>
      </section>
      {completedSummary && (
        <div className="success-banner">
          <span className="success-icon">
            <Check size={17} />
          </span>
          <span>
            <strong>Practice complete.</strong> {completedSummary}
          </span>
          <button onClick={onHistory}>
            See progress <ArrowLeft size={14} />
          </button>
        </div>
      )}
      <section className="practice-lane-grid" aria-label="Available practice activities">
        <article className="practice-lane lane-warmup">
          <div className="status-pill">
            <span className="status-dot" /> Independently available
          </div>
          <h2>Adaptive Warmup</h2>
          <p>
            {warmupWords > 0
              ? `${warmupWords} unique mastery target${warmupWords === 1 ? '' : 's'} selected. ${warmupOptional ? 'A pre-activity Warmup may also be skipped.' : 'Pre-activity Warmup is required.'}`
              : 'No prior mastery targets are available yet.'}
          </p>
          {warmupWords > 0 && (
            <button className="primary-button" onClick={onStartWarmup}>
              Start mastery Warmup <ArrowLeft size={17} />
            </button>
          )}
        </article>
        {acquisitionTarget && <PracticeLaneCard target={acquisitionTarget} profile={profile} onStart={onStart} />}
        {testReviewTarget && (
          <PracticeLaneCard
            target={testReviewTarget}
            profile={profile}
            onStart={onStart}
            resumeAcquisitionTarget={acquisitionTarget}
          />
        )}
      </section>
      {readingLifecycle && <Tier2ReadingPathways lifecycle={readingLifecycle} onStart={onStartReading} />}
      <section className="section-heading">
        <div>
          <p className="eyebrow">Weekly datasets</p>
          <h2>Every week stays on record</h2>
        </div>
        <button className="text-button" onClick={onHistory}>
          View progress <ArrowLeft size={15} />
        </button>
      </section>
      <div className="set-grid">
        {orderedDatasets.map((dataset, index) => (
          <SetCard
            key={dataset.id}
            dataset={dataset}
            lifecycle={requireDatasetLifecycle(lifecycleResolution, dataset.id)}
            score={latestScore(scores, child.id, dataset.id)}
            tone={index % 2 === 0 ? 'yellow' : 'lavender'}
          />
        ))}
      </div>
      <section className="today-strip">
        <div className="strip-icon">
          <Clock3 size={18} />
        </div>
        <div>
          <strong>
            {today
              ? `${today} dataset score${today === 1 ? '' : 's'} recorded today`
              : 'No dataset scores recorded today'}
          </strong>
          <span>
            Acquisition scores appear when “Done for today” is selected; Test Review scores require the complete review.
          </span>
        </div>
        <div className="strip-arrow">→</div>
      </section>
    </div>
  )
}

function PracticeLaneCard({
  target,
  profile,
  onStart,
  resumeAcquisitionTarget,
}: {
  target: PracticeTarget
  profile: WritingPracticeProfile
  onStart: (target: PracticeTarget) => void
  resumeAcquisitionTarget?: PracticeTarget | null
}) {
  const groupedDatasets = target.reviewDatasets || [target.dataset]
  const wordCount = groupedDatasets.reduce((total, dataset) => total + dataset.words.length, 0)
  const label =
    target.phase === 'acquisition'
      ? profile.presentation?.acquisitionLabel || phaseLabel(target.phase)
      : profile.presentation?.testReviewLabel || phaseLabel(target.phase)
  const startLabel =
    target.phase === 'acquisition'
      ? profile.presentation?.acquisitionAction || 'Start Acquisition'
      : profile.presentation?.testReviewAction || 'Start Test Review'
  const detail = target.reviewDatasets
    ? `${groupedDatasets.length} teaching weeks · ${wordCount} writing target${wordCount === 1 ? '' : 's'}`
    : `${target.dataset.dateRange} · ${wordCount} word${wordCount === 1 ? '' : 's'}`
  return (
    <article className={`practice-lane lane-${target.phase}`}>
      <div className="status-pill">
        <span className="status-dot" /> {label}
      </div>
      <h2>{label}</h2>
      <p>{detail} · Warmup offered first</p>
      <button
        className="primary-button"
        aria-label={`${startLabel} for ${target.dataset.dateRange}`}
        onClick={() => onStart(target)}
      >
        {startLabel} <ArrowLeft size={17} />
      </button>
      {resumeAcquisitionTarget && (
        <button className="replay-button" onClick={() => onStart(resumeAcquisitionTarget)}>
          Return to {profile.presentation?.acquisitionLabel?.toLowerCase() || 'acquisition'}
        </button>
      )}
    </article>
  )
}

function Tier2ReadingPathways({
  lifecycle,
  onStart,
}: {
  lifecycle: Tier2ReadingLifecycle
  onStart: (pathway: Tier2ReadingPathway) => void
}) {
  const pathways = [
    ...(lifecycle.acquisition ? [lifecycle.acquisition] : []),
    ...lifecycle.testReviews,
    lifecycle.mastery,
  ].filter((pathway) => pathway.available && tier2ReadingPathwayTargets(pathway).length > 0)
  if (pathways.length === 0) return null
  return (
    <section className="tier2-teaching-card tier2-lifecycle-card" aria-label="Tier 2 reading pathways">
      <div className="tier2-copy">
        <p className="eyebrow">Tier 2 reading</p>
        <h2>Look, listen, record, and compare</h2>
        <p>
          Reading follows the same curriculum stages as writing while keeping its own targets and session-only results.
        </p>
      </div>
      <div className="tier2-pathway-list">
        {pathways.map((pathway) => {
          const targets = tier2ReadingPathwayTargets(pathway)
          const id = `${pathway.kind}-${pathway.cycle || 0}-${pathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`
          return (
            <button className="tier2-pathway-button" type="button" key={id} onClick={() => onStart(pathway)}>
              <span>{readingPathwayLabel(pathway)}</span>
              <strong>
                {targets.length} target{targets.length === 1 ? '' : 's'}
              </strong>
              <small>{targets.map((target) => target.text).join('、')}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SetCard({
  dataset,
  lifecycle,
  score,
  tone,
}: {
  dataset: Dataset
  lifecycle: DatasetLifecycle
  score: DatasetScore | null
  tone: 'yellow' | 'lavender'
}) {
  return (
    <article className={`set-card set-${tone}`}>
      <div className="set-card-top">
        <span className="set-label">{lifecycleLabel(lifecycle)}</span>
        <span className="score-badge">{score ? `${score.percent}% · ${phaseLabel(score.phase)}` : 'Not scored'}</span>
      </div>
      <h3>{dataset.dateRange}</h3>
      <p className="set-date">
        {dataset.description} · {dataset.words.length} words
      </p>
      <div className="set-footer">
        <span>{dataset.grade}</span>
        <div
          className="tiny-progress"
          role="progressbar"
          aria-label={`${dataset.dateRange} score`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score?.percent || 0}
        >
          <span style={{ width: `${score?.percent || 0}%` }} />
        </div>
      </div>
    </article>
  )
}

function ToastNotification({ toast, onDismiss }: { toast: AppToast | null; onDismiss: () => void }) {
  if (!toast) return null
  return (
    <div className="toast-region" aria-live="assertive" aria-atomic="true">
      <div className="error-toast" role="alert">
        <span>{toast.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export default App
