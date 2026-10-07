import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, BarChart3, Check, ChevronDown, Home, Languages, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import {
  APP_STATE_KEY,
  activePracticeWord,
  type AppState,
  type Dataset,
  createInitialState,
  revealAcquisitionPrompt,
  filterDatasetsForChild,
  localDateKey,
  createSessionId,
  resolveDatasetLifecycles,
  shouldSuggestGradePromotion,
  nextGrade,
  type PracticeSession,
  type PracticeTarget,
  type Word,
} from './domain'
import { writingSessionAnswers } from './application/testReview.ts'
import { originalGrade2Dataset, sourceGrade2Datasets } from './curriculum/grade2Revisions.ts'
import type { SavedWritingLesson } from './familyBeta/grade2LessonSelection.ts'
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
  isWorkspaceSynchronizationAborted,
  loadLocalWorkspace,
  readFamilyWorkspace,
  synchronizeChildWorkspace,
} from './application/workspace/index.ts'
import { authErrorMessage, signOut, subscribeAuth, type AuthState } from './firebaseClient'
import {
  firebaseConfigReady as configuredFirebase,
  DEFAULT_GRADE,
  DEFAULT_SCHOOL_YEAR,
  productionSourceIsActive,
} from './config'
import { activityStorage, familyPreview, previewProfile, savePreviewResult } from './familyBeta/runtime.ts'
import { useWorkspaceState } from './familyBeta/useWorkspaceState.ts'
import type { CloudSession, FamilyRecord } from './persistence/cloudRecords.ts'
import { createFirestoreWorkspaceCapabilities } from './infrastructure/firestoreWorkspace.ts'
import { createBrowserPracticePersistence } from './infrastructure/browserPracticePersistence.ts'
import type { PracticeAnswer } from './practice/PracticeView'
import { practiceProfileForGrade } from './practice/profiles/registry'
import { practiceTargetsForLifecycle } from './practice/targets'
import { lifecycleStrategyForGradeAndSchoolYear } from './lifecycle/registry'
import type { Tier2ReadingPracticeSummary } from './readingPractice/Tier2ReadingPractice'
import type { TestReviewCompletion } from './testReview/contracts.ts'
import type { Tier2ReadingLifecycle, Tier2ReadingPathway } from './tier2/contracts'
import { resolveTier2ReadingLifecycle } from './tier2/lifecycle'
import { tier2ReadingProfileForScope } from './tier2/registry'
import { playAudioPlan, playCachedWordAudio, stopActiveAudio } from './audio/lazyPromptAudio.ts'
import { gradeAudioProfileFor } from './audio/gradeAudioProfile.ts'
import type { ProfileChild } from './profiles/ProfileModal.tsx'

const Tier2ReadingPractice = lazy(() =>
  import('./readingPractice/Tier2ReadingPractice.tsx').then((module) => ({
    default: module.Tier2ReadingPractice,
  })),
)
const AuthScreen = lazy(() => import('./auth/AuthScreen.tsx').then((module) => ({ default: module.AuthScreen })))
const PracticeView = lazy(() =>
  import('./practice/PracticeView.tsx').then((module) => ({ default: module.PracticeView })),
)
const Grade2StrokeOrderExperience = lazy(() => import('./learningGames/strokeOrder/Grade2StrokeOrderExperience.tsx'))
const HistoryView = lazy(() => import('./progress/HistoryView.tsx'))
const LocalBackupTools = lazy(() =>
  import('./backup/LocalBackupTools.tsx').then((module) => ({ default: module.LocalBackupTools })),
)
const LocalRestoreGate = lazy(() =>
  import('./backup/LocalRestoreGate.tsx').then((module) => ({ default: module.LocalRestoreGate })),
)
const ProfileModal = lazy(() =>
  import('./profiles/ProfileModal.tsx').then((module) => ({ default: module.ProfileModal })),
)
const LazyHomeView = lazy(() => import('./home/HomeViews.tsx').then((module) => ({ default: module.HomeView })))
const LazyUnsupportedPracticeView = lazy(() =>
  import('./home/HomeViews.tsx').then((module) => ({ default: module.UnsupportedPracticeView })),
)
const LazyNoDatasetView = lazy(() =>
  import('./home/HomeViews.tsx').then((module) => ({ default: module.NoDatasetView })),
)

type BaseView = 'home' | 'history'
type View = BaseView | 'practice' | 'reading'
type Child = ProfileChild
type AppClock = () => Date
type ActiveExperience =
  | { kind: 'practice'; session: PracticeSession }
  | { kind: 'reading'; pathway: Tier2ReadingPathway }
  | { kind: 'stroke-order'; target: PracticeTarget }
  | null

const firebaseConfigReady = configuredFirebase && !familyPreview
const sampleChildren: Child[] = [
  {
    id: 'learner-a',
    name: 'Learner A',
    nickname: 'Learner A',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    active: true,
    gradeEffectiveDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    color: 'coral',
    initials: 'A',
  },
  {
    id: 'learner-b',
    name: 'Learner B',
    nickname: 'Learner B',
    grade: 'Grade 2',
    schoolYear: '2026–2027',
    active: true,
    gradeEffectiveDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    color: 'blue',
    initials: 'B',
  },
]

const currentPreviewProfile = previewProfile()
const appStorage = activityStorage()
const demoChildren = currentPreviewProfile
  ? [
      {
        ...sampleChildren[0],
        ...currentPreviewProfile,
        name: currentPreviewProfile.nickname,
        initials: currentPreviewProfile.nickname.slice(0, 1),
      },
    ]
  : sampleChildren

const REVIEW_INSTRUCTION =
  'Do your own best work. Look carefully at your answer, then choose whether it matches. Every try helps you learn.'

function localStorageGet(key: string) {
  try {
    return appStorage.getItem(key)
  } catch {
    return null
  }
}
function localStorageSet(key: string, value: string) {
  try {
    appStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
type SpeechPart = { text: string; rate: number; lang?: 'zh-CN' | 'en-GB' | 'en-IE' | 'en-US' }

function playSpeechSequence(parts: SpeechPart[], pauseMs = gradeAudioProfileFor('Grade 2').segmentGapMs) {
  return playAudioPlan(
    parts.map((part) => ({
      text: part.text,
      language: part.lang || 'zh-CN',
      rate: part.rate,
    })),
    { pauseMs },
  )
}

function speakWord(word: Word, warmup: boolean) {
  const profile = gradeAudioProfileFor(word.grade || 'Grade 2')
  const rate = warmup ? profile.masteryRate : profile.dictationRate
  return playCachedWordAudio(word, warmup, {
    playbackRate: rate,
    sentenceRate: rate,
    pauseMs: profile.segmentGapMs,
  })
}
function speakReviewInstruction() {
  return playSpeechSequence([{ text: REVIEW_INSTRUCTION, rate: 0.9, lang: 'en-GB' }], 0)
}
function readingPathwayLabel(pathway: Tier2ReadingPathway) {
  if (pathway.kind === 'acquisition') return 'Learn to Read'
  if (pathway.kind === 'mastery') return 'Reading Mastery'
  return pathway.cycle && pathway.cycle > 1 ? `Reading Test Review ${pathway.cycle}` : 'Reading Test Review'
}

function unlockSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.resume()
}

export function App({ now = () => new Date(), manualTestDateLabel }: { now?: AppClock; manualTestDateLabel?: string }) {
  const [auth, setAuth] = useState<AuthState>(() =>
    firebaseConfigReady
      ? { status: 'loading', user: null, error: null }
      : { status: 'unconfigured', user: null, error: null },
  )
  useEffect(() => (familyPreview ? undefined : subscribeAuth(setAuth)), [])
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
            <div className="auth-card">
              <ShieldCheck size={28} />
              <h1>Loading sign in</h1>
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
  const workspaceCapabilities = useMemo(() => createFirestoreWorkspaceCapabilities(appStorage), [])
  const browserPersistence = useMemo(() => createBrowserPracticePersistence(appStorage), [])
  const [baseView, setView] = useState<BaseView>('home')
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [familyChildren, setFamilyChildren] = useState<Child[]>(firebaseConfigReady ? [] : demoChildren)
  const [selectedChildId, setSelectedChildId] = useState(
    () => localStorageGet('weekly-dictation-child') || demoChildren[0].id,
  )
  const {
    state,
    setState,
    owner: sharedWorkspace,
    error: sharedWorkspaceError,
  } = useWorkspaceState(() =>
    firebaseConfigReady ? createInitialState() : loadLocalWorkspace(workspaceCapabilities.local),
  )
  const practicePersistence = useMemo(() => {
    if (!sharedWorkspace) return browserPersistence
    // One engine operation can checkpoint more than once. Only its own
    // successful updates advance this writer's expected snapshot.
    let expected = state
    return {
      ...browserPersistence,
      local: {
        saveState: (next: AppState) => {
          const saved = sharedWorkspace.save(expected, next)
          if (sharedWorkspace.getSnapshot().state === next) expected = next
          return saved
        },
      },
    }
  }, [browserPersistence, sharedWorkspace, state])
  const [curriculumSourceMessage, setCurriculumSourceMessage] = useState<string | null>(null)
  const [grade2SourceDatasets, setGrade2SourceDatasets] = useState<Dataset[] | null>(null)
  const [grade2CurriculumTools, setGrade2CurriculumTools] = useState<typeof import('./automaticGrade2Curriculum.ts') | null>(null)
  const [lessonRetirement, setLessonRetirement] = useState<typeof import('./familyBeta/acquisitionRetirement.ts') | null>(null)
  const [requestedWritingLesson] = useState<SavedWritingLesson | null>(() => {
    const frame = familyPreview ? window.frameElement as HTMLIFrameElement | null : null
    return frame?.dataset.familyResumeChannel === 'writing' && frame.dataset.familyResumeLesson
      ? JSON.parse(frame.dataset.familyResumeLesson) : null
  })
  const [curriculumSourceError, setCurriculumSourceError] = useState<string | null>(null)
  const [curriculumRefreshAttempt, setCurriculumRefreshAttempt] = useState(0)
  const [activeExperience, setActiveExperience] = useState<ActiveExperience>(null)
  const [practiceStartInFlight, setPracticeStartInFlight] = useState(false)
  const session = activeExperience?.kind === 'practice' ? activeExperience.session : null
  const readingPathway = activeExperience?.kind === 'reading' ? activeExperience.pathway : null
  const view: View = activeExperience?.kind === 'practice' ? 'practice' : activeExperience ? 'reading' : baseView
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
  const setReadingPathway = useCallback((pathway: Tier2ReadingPathway | null) => {
    setActiveExperience((current) =>
      pathway ? { kind: 'reading', pathway } : current?.kind === 'reading' ? null : current,
    )
  }, [])
  const completedSessionRef = useRef<string | null>(null)
  const completionInFlightRef = useRef<string | null>(null)
  const cloudSessionsRef = useRef(new Map<string, CloudSession>())
  const [showChildMenu, setShowChildMenu] = useState(false)
  const profileSwitcherRef = useRef<HTMLButtonElement>(null)
  const [showProfiles, setShowProfiles] = useState(false)
  const [showLocalBackup, setShowLocalBackup] = useState(false)
  const [completedSummary, setCompletedSummary] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(Boolean(auth.user))
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [localPersistenceError, setLocalPersistenceError] = useState<string | null>(null)
  const [localImportMessage, setLocalImportMessage] = useState<string | null>(null)
  const [localImportError, setLocalImportError] = useState<string | null>(null)
  const selectedChild =
    familyChildren.find((child) => child.id === selectedChildId) ||
    familyChildren.find((child) => child.active) ||
    familyChildren[0]
  const cloudScope = family && selectedChild ? { familyId: family.id, childId: selectedChild.id } : null
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
    () => (selectedChild ? filterDatasetsForChild(
      familyPreview && grade2SourceDatasets && grade2CurriculumTools && selectedChild.grade === 'Grade 2'
        ? grade2CurriculumTools.grade2WritingDatasets(state, grade2SourceDatasets, selectedChild.id, envelope => lessonRetirement?.isAcquisitionRetired(localStorage, envelope) || false, requestedWritingLesson)
        : state.datasets.filter(dataset => !dataset.curriculumRevision),
      selectedChild.grade, selectedChild.schoolYear) : []),
    [selectedChild, state, grade2SourceDatasets, lessonRetirement, grade2CurriculumTools, requestedWritingLesson],
  )
  const readingDatasets = familyPreview && grade2SourceDatasets
    ? sourceGrade2Datasets(state, grade2SourceDatasets).map(originalGrade2Dataset) : primaryDatasets
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
              sets: readingDatasets.map((dataset) => ({
                datasetId: dataset.id,
                grade: dataset.grade,
                schoolYearKey: readingProfile.schoolYearKey,
                activationDate: dataset.startDate,
                instructionalEndDate: dataset.endDate,
                kind: dataset.isWritingWorkshop ? 'no-instruction' : 'vocabulary',
              })),
              progressionEvents: [],
            },
            readingDatasets,
          )
        : null,
    [selectedChild, readingProfile, readingDatasets, currentDateKey],
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
    if (auth.user) return
    if (sharedWorkspace) {
      setLocalPersistenceError(sharedWorkspaceError || null)
      return
    }
    const saved = localStorageSet(APP_STATE_KEY, JSON.stringify(state))
    setLocalPersistenceError(
      saved
        ? null
        : 'Progress could not be saved in this browser. Keep this page open and use Protect progress to download a backup before continuing.',
    )
  }, [state, auth.user, sharedWorkspace, sharedWorkspaceError])

  useEffect(() => {
    if (firebaseConfigReady) return
    const controller = new AbortController()
    setCurriculumSourceMessage('Updating lessons from Google Slides…')
    setCurriculumSourceError(null)
    void import('./automaticGrade2Curriculum.ts')
      .then(async (curriculum) => ({
        curriculum,
        loaded: await curriculum.fetchAutomaticGrade2Curriculum({ signal: controller.signal }),
        retirement: familyPreview ? await import('./familyBeta/acquisitionRetirement.ts') : null,
      }))
      .then(({ curriculum, loaded: { snapshot, datasetCount }, retirement }) => {
        if (controller.signal.aborted) return
        const source = curriculum.hydrateAutomaticGrade2Curriculum(createInitialState(), snapshot)
        setState((current) => curriculum.hydrateAutomaticGrade2Curriculum(current, snapshot, familyPreview))
        setGrade2SourceDatasets(source.datasets)
        setGrade2CurriculumTools(curriculum)
        setLessonRetirement(retirement)
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
        setState(hydrated)
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
    if (!productionSourceIsActive(promoted, DEFAULT_SCHOOL_YEAR)) {
      setCloudError(
        `${promoted} practice is not active for ${DEFAULT_SCHOOL_YEAR}. The current profile was not changed.`,
      )
      return
    }
    const confirmed = window.confirm(
      `Adult confirmation required: move ${selectedChild.name} from ${selectedChild.grade} to ${promoted}? Existing history will be preserved, but the home screen will use ${promoted} curriculum after this change.`,
    )
    if (!confirmed) return
    setCloudError(null)
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
      setCloudError(`The profile could not be promoted. Nothing changed: ${authErrorMessage(error)}`)
    }
  }
  const startPractice = useCallback(
    async (target: PracticeTarget | null) => {
      if (!selectedChild || !lifecycleResolution || practiceStartInFlight || (familyPreview && !lessonRetirement)) return
      setPracticeStartInFlight(true)
      setShowChildMenu(false)
      const id = createSessionId()
      const cloud = Boolean(auth.user && cloudScope)
      const result = await startPracticeOperation({
        state,
        resolveAcquisitionContext: familyPreview ? context => lessonRetirement!.currentAcquisitionContext(localStorage, context, requestedWritingLesson?.progressionId) : undefined,
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
      }).finally(() => setPracticeStartInFlight(false))
      if (result.status === 'no-op') return
      if (result.status === 'blocked') {
        if (result.state) setState(result.state)
        setCloudError(result.message)
        return
      }
      if (result.cloudSession) cloudSessionsRef.current.set(id, result.cloudSession)
      setState(result.state)
      if (familyPreview && result.session.primaryPhase === 'acquisition' && result.session.acquisition) {
        try {
          const envelope = result.state.acquisitionProgressEnvelopes?.find(e => e.id === result.session.acquisitionProgressionId)
          if (!envelope) throw new Error('The original lesson checkpoint is unavailable. Your saved work is unchanged.')
          const { rememberFamilyLesson } = await import('./familyBeta/lessonLaunchRuntime.ts')
          rememberFamilyLesson(envelope)
        } catch (error) {
          setCloudError(authErrorMessage(error))
          return
        }
      }
      completedSessionRef.current = null
      setCompletedSummary(null)
      if (result.warning) setCloudError(result.warning)
      setSession(result.session)
    },
    [
      auth.user,
      cloudScope,
      lifecycleResolution,
      lessonRetirement,
      requestedWritingLesson,
      now,
      practicePersistence,
      practiceStartInFlight,
      primaryDatasets,
      selectedChild,
      state,
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
    setShowChildMenu(false)
    setCompletedSummary(null)
    setReadingPathway(pathway)
  }
  const finishReading = (summary: Tier2ReadingPracticeSummary) => {
    try {
      savePreviewResult({
        id: summary.sessionId,
        activity: readingPathwayLabel(readingPathway!),
        channel: 'reading',
        datasetIds: readingPathway!.cohorts.map((c) => c.datasetId),
        correct: summary.correct,
        attempted: summary.attempted,
      })
    } catch (error) {
      setCloudError(authErrorMessage(error))
      return
    }
    setCompletedSummary(
      `Reading practice complete: ${summary.correct}/${summary.attempted} assessed responses marked correct. ${familyPreview ? 'See family progress for saving status.' : 'This prototype reading visit was not saved.'}`,
    )
    setReadingPathway(null)
    setView('home')
  }
  const beginWarmup = () => {
    unlockSpeech()
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
  const acquisitionIsActive = (current: PracticeSession | null) => {
    if (!familyPreview || !current?.acquisitionProgressionId) return true
    try {
      const envelope = state.acquisitionProgressEnvelopes?.find(item => item.id === current.acquisitionProgressionId)
      if (!envelope || !lessonRetirement || lessonRetirement.isAcquisitionRetired(localStorage, envelope)) throw new Error('This attempt was discarded. Its reviewed history is preserved; reopen the lesson to start again.')
      return true
    } catch (error) { setCloudError(authErrorMessage(error)); return false }
  }
  const completeSession = async (finished: PracticeSession, baseState: AppState = state) => {
    if (!acquisitionIsActive(finished)) return
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
      const scores = outcome.state.scores.filter((score) => score.sessionId === finished.id)
      if (scores.length)
        savePreviewResult({
          id: finished.id,
          activity: finished.warmupOnly ? 'Spirit Realm' : finished.primaryPhase,
          channel: 'writing',
          datasetIds: scores.map((score) => score.datasetId),
          correct: scores.reduce((sum, score) => sum + score.correct, 0),
          attempted: scores.reduce((sum, score) => sum + score.wordCount, 0),
        })
      else if (finished.warmupOnly && finished.warmupAnswers.length)
        savePreviewResult({
          id: finished.id,
          activity: 'Spirit Realm',
          channel: 'writing',
          datasetIds: finished.warmupAnswers.map((answer) => answer.word.datasetId),
          correct: finished.warmupAnswers.filter((answer) => answer.correct).length,
          attempted: finished.warmupAnswers.length,
        })
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
    if (!acquisitionIsActive(current)) return
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
      const scores = outcome.state.scores.filter((score) => score.sessionId === current.id)
      if (scores.length)
        savePreviewResult({
          id: current.id,
          activity: 'Writing Dojo',
          channel: 'writing',
          datasetIds: scores.map((score) => score.datasetId),
          correct: scores.reduce((sum, score) => sum + score.correct, 0),
          attempted: scores.reduce((sum, score) => sum + score.wordCount, 0),
        })
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
    if (!acquisitionIsActive(session)) return
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
    stopActiveAudio()
    if (view === 'practice') {
      leavePractice(nextView)
      return
    }
    if (activeExperience) setActiveExperience(null)
    setView(nextView)
  }
  const importLocalDeck = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { hydrateLocalStateFromJson } = await import('./localHydration.ts')
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
  if (dataLoading && auth.user && familyChildren.length === 0)
    return (
      <div className="auth-shell">
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
              <div className="loading-surface" role="status">
                Loading profiles…
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
              disabled={activityControlsLocked}
              onClick={() => setShowLocalBackup(true)}
            >
              <ShieldCheck size={14} /> Protect progress
            </button>
          )}
          {!firebaseConfigReady && selectedChild.grade !== 'Grade 2' && (
            <LocalImportControl disabled={activityControlsLocked} onChange={importLocalDeck} />
          )}
          {!firebaseConfigReady && localImportMessage && (
            <span className="local-import-status">{localImportMessage}</span>
          )}
          <button
            className="profile-switcher"
            disabled={activityControlsLocked}
            ref={profileSwitcherRef}
            aria-label={`Choose child: ${selectedChild.name}, ${selectedChild.grade}`}
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
        {curriculumSourceMessage && (
          <p className="curriculum-source-status" role="status">
            {curriculumSourceMessage}
          </p>
        )}
        {curriculumSourceError && (
          <div className="curriculum-source-error error-banner" role="alert">
            <strong>Weekly vocabulary could not be updated automatically.</strong>
            <p>{curriculumSourceError}</p>
            <button type="button" onClick={() => setCurriculumRefreshAttempt((value) => value + 1)}>
              Try again
            </button>
          </div>
        )}
        {cloudError && (
          <div className="error-banner" role="alert">
            {cloudError}
          </div>
        )}
        {localPersistenceError && (
          <div className="error-banner" role="alert">
            {localPersistenceError}
          </div>
        )}
        {!firebaseConfigReady && localImportError && (
          <div className="error-banner" role="alert">
            {localImportError}
          </div>
        )}
        {promotionSuggested && nextGrade(selectedChild.grade) && (
          <div className="promotion-banner">
            <span>
              {productionSourceIsActive(nextGrade(selectedChild.grade), DEFAULT_SCHOOL_YEAR)
                ? `Your ${selectedChild.grade} school year is ready to advance.`
                : `${nextGrade(selectedChild.grade)} practice is not active yet. This profile will stay on ${selectedChild.grade}.`}
            </span>
            {productionSourceIsActive(nextGrade(selectedChild.grade), DEFAULT_SCHOOL_YEAR) && (
              <button onClick={() => void confirmPromotion()}>Review move to {nextGrade(selectedChild.grade)}</button>
            )}
          </div>
        )}
        <Suspense
          fallback={
            view === 'home' ? (
              <div className="page loading-surface" role="status">
                Loading practice choices…
              </div>
            ) : null
          }
        >
          {view === 'home' && !practiceProfile && (
            <LazyUnsupportedPracticeView
              child={selectedChild}
              datasets={primaryDatasets}
              onHistory={() => setView('history')}
              onProfiles={() => setShowProfiles(true)}
            />
          )}
          {view === 'home' && Boolean(practiceProfile) && showLearningHome && lifecycleResolution && (
            <LazyHomeView
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
              onStartStrokeOrder={(target) => setActiveExperience({ kind: 'stroke-order', target })}
              onStartWarmup={() => void startPractice(null)}
              onStartReading={startReading}
              onHistory={() => setView('history')}
              onProfiles={() => setShowProfiles(true)}
            />
          )}
          {view === 'home' && Boolean(practiceProfile) && !showLearningHome && (
            <LazyNoDatasetView
              child={selectedChild}
              datasets={primaryDatasets}
              warmupWords={warmupWordCount}
              localMode={!firebaseConfigReady}
              onStartWarmup={() => void startPractice(null)}
              onHistory={() => setView('history')}
              onProfiles={() => setShowProfiles(true)}
            />
          )}
        </Suspense>
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
              onReplay={() => {
                const word = activePracticeWord(session)
                if (session.stage === 'complete') return speakReviewInstruction()
                return word ? speakWord(word, session.segment === 'warmup') : undefined
              }}
              onBeginWarmup={beginWarmup}
              onInterstitialComplete={completeInterstitial}
              onDictationComplete={completeDictationWord}
              onStartReview={startPrimaryReview}
              onAnswer={answer}
              onSpeakWord={speakWord}
              onSpeakReviewInstruction={speakReviewInstruction}
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
              key={`${readingPathway.kind}-${readingPathway.cycle || 0}-${readingPathway.cohorts.map((cohort) => cohort.datasetId).join('-')}`}
              profile={readingProfile}
              pathway={readingPathway}
              label={readingPathwayLabel(readingPathway)}
              onExit={() => {
                setReadingPathway(null)
                setView('home')
              }}
              onComplete={finishReading}
              sessionNote={
                familyPreview
                  ? 'Recordings stay in this session. Completed scores appear in family progress.'
                  : 'Prototype reading visit · recording and results are not saved yet'
              }
            />
          </Suspense>
        )}
        {activeExperience?.kind === 'stroke-order' && (
          <Suspense
            fallback={
              <div className="page loading-surface" role="status">
                Loading Stroke Order…
              </div>
            }
          >
            <Grade2StrokeOrderExperience
              target={activeExperience.target}
              onClose={() => setActiveExperience(null)}
              onComplete={(summary) => {
                try {
                  savePreviewResult({
                    activity: 'Stroke Order',
                    channel: 'game',
                    datasetIds: [activeExperience.target.dataset.id],
                    correct: summary.correct,
                    attempted: summary.attempted,
                  })
                  stopActiveAudio()
                  setActiveExperience(null)
                } catch (error) {
                  setCloudError(authErrorMessage(error))
                }
              }}
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
            <div className="loading-surface" role="status">
              Loading profiles…
            </div>
          }
        >
          <ProfileModal
            children={familyChildren}
            selectedChildId={selectedChildId}
            onSelect={chooseChild}
            onClose={() => {
              setShowProfiles(false)
              profileSwitcherRef.current?.focus()
            }}
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

function LocalImportControl({
  disabled,
  onChange,
}: {
  disabled: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className={`local-import-control${disabled ? ' disabled' : ''}`}>
      Import deck JSON
      <input type="file" accept="application/json,.json" disabled={disabled} onChange={onChange} />
    </label>
  )
}

export default App
