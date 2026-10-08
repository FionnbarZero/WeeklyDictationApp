import { createRoot } from 'react-dom/client'
import { ProblemReporter } from './ProblemReporter.tsx'
import { AudioCheck } from './AudioCheck.tsx'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AppErrorBoundary } from '../AppErrorBoundary.tsx'
import { firebaseConfigReady, DEFAULT_SCHOOL_YEAR } from '../config.ts'
import { subscribeAuth, signIn, signOut, type AuthState } from '../firebaseClient.ts'
import { createChild, ensureParentFamily, listChildren, updateChild } from '../firestoreClient.ts'
import { fetchCurriculum, gradeSlugs } from './curriculum.ts'
import { BETA_GRADES, type BetaGrade, type BetaProfile, type BetaResult } from './model.ts'
import { ResultHistory } from './ResultHistory.tsx'
import { assertSavedAttemptsMatch } from './resultHistory.ts'
import { PROFILE_KEY, RESULT_KEY, acknowledgeResult, pendingResults, previewResults } from './runtime.ts'
import { familyResultRepository } from './cloud.ts'
import { deviceExport } from './deviceExport.ts'
import { familyDeviceSyncRepository } from './deviceSync.ts'
import { syncCompletedBeforePractice } from './syncProgress.ts'
import { assertResultCopiesMatch } from './resultLedger.ts'
import { learningModuleCapabilities } from '../ninjaSkills/content.ts'
import { learningModuleCatalogEntry } from '../ninjaSkills/catalog.ts'
import { channelCohort, latestEarlierTargets } from './gamePools.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import { activityWorkspace, type FamilyActivitySlot } from './activitySlots.ts'
import { activityClock, confirmActivityDiscard } from '../activity/activityLifecycle.ts'
import { createFamilyWorkspaceOwner, type FamilyWorkspaceWindow } from './workspaceOwner.ts'
import { localDateKey } from '../domain.ts'
import { cacheLessonSource, discardSavedLesson, listSavedLessons, readSavedLesson, type SavedLessonLaunch } from './lessonLaunch.ts'
import { isConnectionFailure, isFamilyAccessDenied, offlineFamilyKey, readOfflineFamily, rememberOfflineFamily } from './offlineFamily.ts'
import '../styles.css'
import './preview.css'

const AuthScreen = lazy(() => import('../auth/AuthScreen.tsx').then((m) => ({ default: m.AuthScreen })))
const routes: Record<BetaGrade, string> = {
  Kindergarten: 'kindergarten-learning-lab.html',
  'Grade 2': 'index.html',
  'Grade 5': 'grade5-learning-hub.html',
}
const initialProfiles: BetaProfile[] = BETA_GRADES.map((grade, i) => ({
  id: `preview-${i}`,
  nickname: `Learner ${i + 1}`,
  grade,
  active: true,
}))
const message = (error: unknown) => (error instanceof Error ? error.message : 'The operation could not be completed.')
const workspaceOwner = createFamilyWorkspaceOwner(localStorage)
;(window as FamilyWorkspaceWindow).familyWorkspaceOwner = workspaceOwner

function FamilyPreview() {
  const requested = new URLSearchParams(location.search).get('grade')
  const initialGrade = BETA_GRADES.find((g) => gradeSlugs[g] === requested) || 'Kindergarten'
  const [auth, setAuth] = useState<AuthState>({
    status: firebaseConfigReady ? 'loading' : 'unconfigured',
    user: null,
    error: null,
  })
  const [profiles, setProfiles] = useState<BetaProfile[]>(
    firebaseConfigReady
      ? []
      : (() => {
          try {
            return JSON.parse(localStorage.getItem('beta-preview-profiles') || 'null') || initialProfiles
          } catch {
            return initialProfiles
          }
        })(),
  )
  const [selectedId, setSelectedId] = useState(initialProfiles.find((p) => p.grade === initialGrade)!.id)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [tab, setTab] = useState<'activities' | 'games' | 'progress' | 'parent'>('activities')
  const [curricula, setCurricula] = useState<Partial<Record<BetaGrade, Awaited<ReturnType<typeof fetchCurriculum>>>>>({})
  const [week, setWeek] = useState('')
  const [results, setResults] = useState<BetaResult[]>([])
  const [historyCursor, setHistoryCursor] = useState({ owner: '', token: '' })
  const [error, setError] = useState('')
  const [activityError, setActivityError] = useState('')
  const [curriculumError, setCurriculumError] = useState('')
  const [curriculumRetry, setCurriculumRetry] = useState(0)
  const [status, setStatus] = useState(
    firebaseConfigReady
      ? 'Sign in to save across devices.'
      : 'One-device beta: scores and reports stay in this browser. Online syncing is not enabled.',
  )
  const [busy, setBusy] = useState(false)
  const [adultUnlocked, setAdultUnlocked] = useState(!firebaseConfigReady)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [grade, setGrade] = useState<BetaGrade>(initialGrade)
  const [slots, setSlots] = useState<FamilyActivitySlot[]>([])
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [savedLessonsOpen, setSavedLessonsOpen] = useState(false)
  const [savedLessons, setSavedLessons] = useState<{ owner: string; lessons: SavedLessonLaunch[]; warnings: string[] }>({ owner: '', lessons: [], warnings: [] })
  const [resumeRefresh, setResumeRefresh] = useState(0)
  const resumeInFlight = useRef(false)
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const [selectedSlots, setSelectedSlots] = useState<Record<string, string | undefined>>({})
  const syncing = useRef(false)
  const syncAgain = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  const [readyChildren, setReadyChildren] = useState<ReadonlySet<string>>(new Set())
  const [offlineShell, setOfflineShell] = useState(document.documentElement.dataset.offlineShell || '')
  const child = profiles.find((p) => p.id === selectedId && p.active) || profiles.find((p) => p.active)
  const currentGrade = child?.grade || initialGrade
  const curriculum = curricula[currentGrade] || null
  const practiceReady = !firebaseConfigReady || Boolean(familyId && child && readyChildren.has(child.id))
  const today = localDateKey(new Date())
  const available = curriculum?.datasets.filter(d => d.startDate <= today).sort((a, b) => b.startDate.localeCompare(a.startDate)) || []
  const dataset = available.find(d => d.startDate === week) || available[0]
  const resumeSlot = tab === 'activities' ? slots.find(slot => slot.id === resumingId && slot.profile.id === child?.id) : undefined
  const workspace = resumeSlot?.workspace || (child ? activityWorkspace(child, dataset?.startDate || week) : '')
  const selectedSlot = selectedSlots[`${workspace}:${tab}`]
  const pack = slots.find(slot => slot.id === selectedSlot)?.game?.pack
  const scope = `${auth.user?.uid || ''}:${familyId || ''}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const childRef = useRef(child?.id)
  childRef.current = child?.id

  useEffect(() => subscribeAuth(setAuth), [])
  useEffect(() => {
    const changed = () => setOfflineShell(document.documentElement.dataset.offlineShell || '')
    addEventListener('family-offline-shell', changed)
    changed()
    return () => removeEventListener('family-offline-shell', changed)
  }, [])
  useEffect(() => {
    let cancelled = false
    setReadyChildren(new Set())
    workspaceOwner.retain([])
    setSlots([])
    setSelectedSlots({})
    setResumingId(null)
    if (!firebaseConfigReady) return
    setFamilyId(null)
    setProfiles([])
    setResults([])
    if (!auth.user) return
    const uid = auth.user.uid
    const restoreOffline = () => {
      if (cancelled) return false
      const cached = readOfflineFamily(localStorage, uid)
      if (!cached || !cached.ready.length) return false
      setFamilyId(cached.familyId)
      setProfiles(cached.profiles)
      setReadyChildren(new Set(cached.ready))
      setSelectedId((cached.profiles.find(c => c.grade === initialGrade && cached.ready.includes(c.id)) || cached.profiles.find(c => cached.ready.includes(c.id)))?.id || '')
      setStatus('Offline: using this parent’s previously confirmed device records. Saved lessons can continue; online saving will retry when connected.')
      setAdultUnlocked(false)
      return true
    }
    const connect = () => { void ensureParentFamily(auth.user!)
      .then(async ({ family }) => {
        const children = (await listChildren(family.id)).filter((c) =>
          BETA_GRADES.includes(c.grade as BetaGrade),
        ) as BetaProfile[]
        if (cancelled) return
        setFamilyId(family.id)
        setProfiles(children)
        setSelectedId((children.find((c) => c.grade === initialGrade) || children[0])?.id || '')
        setStatus('Family account connected.')
        setAdultUnlocked(false)
        try { rememberOfflineFamily(localStorage, uid, family.id, children) }
        catch (e) { setError(message(e)) }
      })
      .catch((e) => {
        if (cancelled) return
        if (isConnectionFailure(e) && restoreOffline()) return
        if (isFamilyAccessDenied(e)) {
          localStorage.removeItem(offlineFamilyKey(uid))
          setReadyChildren(new Set())
          setProfiles([])
          setFamilyId(null)
        }
        setError(message(e))
      }) }
    // A disconnected browser must not try to refresh an expired token first.
    // This is local access only, and requires an existing signed-in owner.
    if (!navigator.onLine) {
      if (!restoreOffline()) setError('Connect once with this parent account and finish family syncing before reopening offline.')
    } else connect()
    // Revalidate membership on reconnect. Do not replace mounted workspaces.
    const reconnect = () => { if (!slotsRef.current.length) connect() }
    addEventListener('online', reconnect)
    return () => {
      cancelled = true
      removeEventListener('online', reconnect)
    }
  }, [auth.user?.uid, initialGrade])

  useEffect(() => {
    workspaceOwner.retain(slots.map(slot => slot.profile.id))
  }, [slots])

  useEffect(() => {
    if (child) sessionStorage.setItem(PROFILE_KEY, JSON.stringify(child))
    if (!firebaseConfigReady) localStorage.setItem('beta-preview-profiles', JSON.stringify(profiles))
  }, [child, profiles])

  useEffect(() => {
    if (!child || !practiceReady) return
    let cancelled = false
    void listSavedLessons(localStorage, child).then(value => {
      if (!cancelled) setSavedLessons({ owner: child.id, ...value })
    }).catch(e => { if (!cancelled) setActivityError(message(e)) })
    return () => { cancelled = true }
  }, [child?.id, child?.grade, practiceReady, resumeRefresh])

  useEffect(() => {
    const controller = new AbortController()
    setCurriculumError('')
    const refresh = () => {
      void fetchCurriculum(currentGrade, controller.signal)
        .then((loaded) => {
          if (!controller.signal.aborted) {
            setCurricula(current => ({ ...current, [currentGrade]: loaded }))
            setCurriculumError('')
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setCurriculumError(
              `${message(e)} Any previously loaded lesson is retained; no placeholder lesson will be substituted.`,
            )
        })
    }
    refresh()
    const interval = window.setInterval(refresh, 5 * 60_000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [currentGrade, curriculumRetry])

  const refreshProgress = useCallback(async () => {
    if (!child) return
    if (syncing.current) { syncAgain.current = true; return }
    syncing.current = true
    try {
      if (familyId && auth.user) {
        if (!navigator.onLine) throw new Error('This device is offline. Reviewed progress remains in this browser.')
        const repository = familyResultRepository(familyId)
        const current = () => scopeRef.current === scope && childRef.current === child.id
        if (!await syncCompletedBeforePractice({
          isCurrent: current,
          pending: pendingResults,
          belongsToFamily: item => profiles.some(p => p.id === item.childId),
          validate: item => assertResultCopiesMatch(localStorage, RESULT_KEY, item),
          save: repository.save,
          acknowledge: acknowledgeResult,
          syncPractice: () => familyDeviceSyncRepository(familyId).sync(localStorage, child.id,
            () => current() && !slotsRef.current.some(slot => slot.profile.id === child.id)),
        })) return
        const page = await repository.listPage(child.id)
        const saved = page.results
        if (scopeRef.current !== scope) return
        assertSavedAttemptsMatch(saved, localStorage, RESULT_KEY)
        for (const result of saved) {
          const key = `${RESULT_KEY}:${result.id}`
          const previous = localStorage.getItem(key)
          if (!previous) localStorage.setItem(key, JSON.stringify(result))
        }
        setReadyChildren(current => new Set([...current, child.id]))
        rememberOfflineFamily(localStorage, auth.user.uid, familyId, profiles, child.id)
        if (childRef.current !== child.id) return
        // Keep the visible remote page aligned with its cursor. Newly queued
        // results remain in the outbox and appear after their confirmed refresh.
        setResults(saved)
        setHistoryCursor({ owner: `${scope}:${child.id}`, token: page.nextPageToken })
        setStatus('Scores and saved practice confirmed in your private family account. Use the same parent account on your other device.')
      } else {
        setResults(previewResults())
        setStatus('Saved in this browser on this device. Online syncing is not enabled; use the same grade link and browser next time.')
      }
      setError('')
    } catch (e) {
      if (scopeRef.current !== scope || childRef.current !== child.id) return
      const accessDenied = auth.user && isFamilyAccessDenied(e)
      if (auth.user && accessDenied) {
        localStorage.removeItem(offlineFamilyKey(auth.user.uid))
        setReadyChildren(new Set())
      }
      if (auth.user && isConnectionFailure(e)) {
        const cached = readOfflineFamily(localStorage, auth.user.uid)
        if (cached?.familyId === familyId && cached.ready.includes(child.id) && cached.profiles.some(p => p.id === child.id && p.grade === child.grade))
          setReadyChildren(current => new Set([...current, child.id]))
      }
      setError(message(e))
      setStatus(accessDenied ? 'Family access needs confirmation. Existing work remains stored and paused. Reconnect or sign in again.' : familyId ? 'Online saving is unavailable. Keep practicing here; saved work will retry automatically. Keep this browser’s data.' : 'Saving is not confirmed. Keep this browser’s data and retry.')
      setHistoryCursor({ owner: '', token: '' })
      try {
        setResults(previewResults())
      } catch {
        setResults([])
      }
    } finally {
      if (scopeRef.current === scope) setResumeRefresh(value => value + 1)
      syncing.current = false
      if (syncAgain.current) {
        syncAgain.current = false
        void refreshRef.current()
      }
    }
  }, [child?.id, familyId, auth.user?.uid, profiles, slots, scope])
  refreshRef.current = refreshProgress

  useEffect(() => {
    void refreshProgress()
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin) return
      const source = [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-family-slot]')].find(frame => frame.contentWindow === event.source)
      const slot = slots.find(item => item.id === source?.dataset.familySlot)
      if (!slot) return
      if (event.data?.type === 'family-beta-activity-paused') {
        const key = `${slot.workspace}:${slot.kind === 'game' ? 'games' : 'activities'}`
        setSelectedSlots(current => ({ ...current, [key]: undefined }))
      }
      if (event.data?.type === 'family-beta-game-completed' && slot.game?.attemptId === event.data.attemptId) {
        let confirmed = false
        try { confirmed = previewResults().some(result => result.id === slot.game?.attemptId && result.childId === slot.profile.id && result.grade === slot.profile.grade) } catch { /* Keep this game open when its ledger cannot be read. */ }
        if (!confirmed) { setActivityError('The game result is not confirmed. Keep it open and retry.'); return }
        setSlots(current => current.filter(item => item.id !== slot.id))
        setSelectedSlots(current => ({ ...current, [`${slot.workspace}:games`]: undefined }))
        void refreshProgress()
      }
      if (event.data?.type === 'family-beta-result-ready') {
        const lesson = event.data.lesson
        if (lesson && /^acq-progress-v1-[a-f0-9]{16}$/.test(lesson.progressionId) && /^[a-f0-9]{16}$/.test(lesson.fingerprint)) {
          setSlots(current => current.map(item => item.id === slot.id ? { ...item,
            savedLesson: { progressionId: lesson.progressionId, fingerprint: lesson.fingerprint } } : item))
        }
        setActivityError('')
        void refreshProgress()
      }
      if (event.data?.type === 'family-beta-save-error') {
        setActivityError(
          'The score could not be saved. Keep the activity open and retry its completion after restoring storage access.',
        )
        setStatus('Saving is not confirmed.')
      }
    }
    const online = () => void refreshProgress()
    const storageChanged = (event: StorageEvent) => {
      if (event.key && !event.key.startsWith('family-beta-sync-') && event.key.startsWith('family-beta-')) void refreshProgress()
    }
    addEventListener('message', receive)
    addEventListener('online', online)
    addEventListener('storage', storageChanged)
    const interval = setInterval(() => { if (familyId) void refreshProgress() }, 15000)
    return () => {
      removeEventListener('message', receive)
      removeEventListener('online', online)
      removeEventListener('storage', storageChanged)
      clearInterval(interval)
    }
  }, [refreshProgress, slots])

  async function editProfile(profile: BetaProfile, patch: Partial<BetaProfile>) {
    if (!adultUnlocked) return
    setBusy(true)
    try {
      if (familyId && (patch.grade || patch.active === false)) {
        await refreshProgress()
        if (pendingResults().some((result) => result.childId === profile.id))
          throw new Error('Save this child’s queued results before changing their grade or deactivating them.')
      }
      if (familyId) await updateChild(familyId, profile.id, patch)
      setProfiles((existing) => existing.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)))
      setError('')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const earlierWriting = latestEarlierTargets(available, dataset?.startDate || today, 'writing')
  const earlierReading = latestEarlierTargets(available, dataset?.startDate || today, 'reading')
  const writingCapabilities = learningModuleCapabilities(
    channelCohort(earlierWriting, 'writing', 'Earlier writing targets'),
    NINJA_SKILLS_PROFILES[currentGrade],
  )
  const capabilities = learningModuleCapabilities(
    channelCohort(earlierReading, 'reading', 'Earlier reading targets'),
    NINJA_SKILLS_PROFILES[currentGrade],
  ).map((capability) => {
    const id = capability.status === 'ready' ? capability.pack.moduleId : capability.moduleId
    return id === 'dictation-streak'
      ? writingCapabilities.find((c) => (c.status === 'ready' ? c.pack.moduleId : c.moduleId) === id)!
      : capability
  })
  const frameUrl = `${routes[currentGrade]}?family-preview=1${week ? `&week=${encodeURIComponent(week)}` : ''}`

  function newSlot(kind: FamilyActivitySlot['kind'], gamePack?: LearningModulePack) {
    if (!child || !curriculum || curriculum.snapshot.grade !== currentGrade || !dataset || !practiceReady) return
    try { cacheLessonSource(localStorage, child.id, curriculum.snapshot) }
    catch (e) { setActivityError(message(e)); return }
    const id = crypto.randomUUID()
    const slot: FamilyActivitySlot = {
      id, workspace, profile: { ...child }, week: dataset?.startDate || week,
      curriculumVersion: curriculum.snapshot.contentSha256,
      source: curriculum.snapshot,
      teachingVersion: import.meta.env.VITE_GIT_REVISION || 'local',
      kind, src: kind === 'game' ? 'family-game.html?family-preview=1' : frameUrl,
      ...(gamePack ? { game: { attemptId: id, pack: gamePack } } : {}),
    }
    setSlots(current => [...current, slot])
    setSelectedSlots(current => ({ ...current, [`${workspace}:${kind === 'game' ? 'games' : 'activities'}`]: id }))
  }

  useEffect(() => {
    if (tab === 'activities' && !resumingId && child && curriculum && practiceReady && !slots.some(slot => slot.workspace === workspace && slot.kind === 'activities')) newSlot('activities')
  }, [tab, child, curriculum, practiceReady, workspace, slots, resumingId])

  async function resumeSavedLesson(lesson: SavedLessonLaunch) {
    if (!child || !practiceReady || resumeInFlight.current) return
    resumeInFlight.current = true
    try {
      const saved = await readSavedLesson(localStorage, child, lesson)
      if (scopeRef.current !== scope || childRef.current !== child.id) return
      if (!saved) throw new Error('This lesson has already finished or changed. Refresh the saved lesson list.')
      const existing = slotsRef.current.find(slot => slot.profile.id === child.id && slot.kind === 'activities' &&
        slot.savedLesson?.progressionId === saved.progressionId && slot.savedLesson.fingerprint === saved.lessonFingerprint)
      const id = existing?.id || crypto.randomUUID()
      const savedWorkspace = existing?.workspace || `${activityWorkspace(child, saved.week)}:saved:${id}`
      if (!existing) setSlots(current => [...current, {
        id, workspace: savedWorkspace, profile: { ...child }, week: saved.week,
        curriculumVersion: saved.sourceHash, source: saved.source, resumeChannel: saved.channel,
        savedLesson: { progressionId: saved.progressionId, fingerprint: saved.lessonFingerprint },
        teachingVersion: import.meta.env.VITE_GIT_REVISION || 'local', kind: 'activities',
        src: `${routes[child.grade]}?family-preview=1&week=${encodeURIComponent(saved.week)}`,
      }])
      setResumingId(id)
      setSavedLessonsOpen(false)
      setTab('activities')
      setSelectedSlots(current => ({ ...current, [`${savedWorkspace}:activities`]: id }))
      setActivityError('')
    } catch (e) { setActivityError(message(e)) }
    finally { resumeInFlight.current = false }
  }

  function discardSlot(slot: FamilyActivitySlot) {
    if (!confirmActivityDiscard()) return
    try {
      if (slot.savedLesson) discardSavedLesson(localStorage, slot.profile, slot.savedLesson)
      const removed = slots.filter(item => item.id === slot.id || (slot.savedLesson && item.profile.id === slot.profile.id && item.savedLesson?.progressionId === slot.savedLesson.progressionId))
      if (removed.some(item => item.id === resumingId)) setResumingId(null)
      setSlots(current => current.filter(item => !removed.some(value => value.id === item.id)))
      setSelectedSlots(current => Object.fromEntries(Object.entries(current).map(([key, id]) => [key, removed.some(item => item.id === id) ? undefined : id])))
      setResumeRefresh(current => current + 1)
      setActivityError('')
    } catch (error) { setActivityError(message(error)) }
  }

  if (auth.status === 'loading') return <p role="status">Loading family access…</p>
  if (firebaseConfigReady && !auth.user)
    return (
      <Suspense fallback={<p>Loading parent sign-in…</p>}>
        <AuthScreen />
      </Suspense>
    )
  return (
    <div
      className="beta-workspace"
      data-report-grade={currentGrade}
      data-report-screen={tab}
      data-report-week={dataset?.startDate || week || 'unavailable'}
      data-report-curriculum={curriculum?.snapshot.contentSha256}
      data-report-game={tab === 'games' ? pack?.title : undefined}
      data-report-mode={familyId ? 'account' : 'device-preview'}
      data-report-revision={import.meta.env.VITE_GIT_REVISION || 'local'}
    >
      <header className="beta-toolbar">
        <strong>Ninja Dojo · Family beta</strong>
        <small>Beta build {import.meta.env.VITE_GIT_REVISION?.slice(0, 7) || 'local'}</small>
        <label>
          Practicing as{' '}
          <select
            aria-label="Child profile"
            value={child?.id || ''}
            onChange={(e) => { setSelectedId(e.target.value); setWeek(''); setResumingId(null) }}
          >
            {profiles
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname} · {p.grade}
                </option>
              ))}
          </select>
        </label>
        <button onClick={() => setTab('parent')}>Parent controls</button>
        <AudioCheck />
      </header>
      <div className="beta-status" role="status">
        {status}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error} <button onClick={() => void refreshProgress()}>Retry saving</button>
        </div>
      )}
      {activityError && (
        <div className="error-banner" role="alert">
          {activityError}
        </div>
      )}
      {curriculumError && (
        <div className="error-banner" role="alert">
          {curriculumError} <button onClick={() => setCurriculumRetry((value) => value + 1)}>Retry lessons</button>
        </div>
      )}
      <nav className="beta-tabs" aria-label="Family preview navigation">
        {(['activities', 'games', 'progress'] as const).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t)
              if (t === 'progress') void refreshProgress()
            }}
          >
            {t === 'games' ? 'Ninja Skills' : t === 'activities' ? 'Activities' : 'Progress'}
          </button>
        ))}
      </nav>
      {familyId && child && !readyChildren.has(child.id) && <section className="beta-panel" role="status">
        <p>Checking this child’s saved practice before opening activities. Existing device records are preserved.</p>
        <button type="button" onClick={() => void refreshProgress()}>Retry family sync</button>
      </section>}
      {child && practiceReady && (tab === 'activities' || tab === 'games') && (
        <label className="beta-week">
          Practice week{' '}
          <select
            aria-label="Practice week"
            value={week}
            onChange={(e) => { setWeek(e.target.value); setResumingId(null) }}
          >
            <option value="">Current teacher lesson</option>
            {available.map((d) => (
              <option key={d.id} value={d.startDate}>
                {d.dateRange}
              </option>
            ))}
          </select>
        </label>
      )}
      {child && practiceReady && tab === 'activities' && <details className="beta-panel" open={savedLessonsOpen} onToggle={e => setSavedLessonsOpen(e.currentTarget.open)}>
        <summary>Saved lessons</summary>
        <p>Resume the original lesson even when the teacher’s document changes. Only reviewed progress is saved; repeat unfinished handwriting or recordings.</p>
        {savedLessons.owner === child.id && savedLessons.warnings.map(warning => <p role="alert" key={warning}>{warning}</p>)}
        {savedLessons.owner === child.id && savedLessons.lessons.map(lesson => <button key={`${lesson.progressionId}:${lesson.lessonFingerprint}`} onClick={() => void resumeSavedLesson(lesson)}>
          Resume saved {lesson.channel} · {lesson.week}
        </button>)}
        {savedLessons.owner === child.id && !savedLessons.lessons.length && !savedLessons.warnings.length && <p>No saved lessons are available yet.</p>}
      </details>}
      {resumeSlot && <section className="beta-panel" role="status">
        Original saved {resumeSlot.resumeChannel || ''} lesson · {resumeSlot.week}. New activities still use the current teacher curriculum.
        <button onClick={() => setResumingId(null)}>Return to current teacher lessons</button>
      </section>}
      {!child && <p>Add a child in Parent controls to begin.</p>}
      {slots.map(slot => {
        const active = practiceReady && slot.id === selectedSlot && slot.workspace === workspace && (tab === 'activities' || tab === 'games')
        return <iframe key={slot.id} className="beta-grade-frame" title={slot.game?.pack.title || `${slot.profile.grade} activities`}
          id={slot.id} data-family-slot={slot.id} data-family-active={String(active)} data-family-paused={String(!active)}
          data-family-owner-paused={String(activityClock.paused)} data-family-profile={JSON.stringify(slot.profile)}
          data-family-week={slot.week} data-family-curriculum={slot.curriculumVersion} data-family-revision={slot.teachingVersion}
          data-family-source={slot.source ? JSON.stringify(slot.source) : undefined} data-family-resume-channel={slot.resumeChannel}
          data-family-resume-lesson={slot.resumeChannel && slot.savedLesson ? JSON.stringify(slot.savedLesson) : undefined}
          data-family-game={slot.game ? JSON.stringify(slot.game) : undefined}
          hidden={!active} src={slot.src} allow="microphone 'self'; autoplay 'self'" />
      })}
      {practiceReady && (tab === 'activities' || tab === 'games') && !selectedSlot && slots.some(slot => slot.workspace === workspace && slot.kind === (tab === 'games' ? 'game' : 'activities')) && <section className="beta-panel">
        <h2>Your paused work</h2>
        <p>Your work stays here during this visit. After a reload, reviewed saved practice resumes; temporary writing and recordings must be repeated.</p>
        {slots.filter(slot => slot.workspace === workspace && slot.kind === (tab === 'games' ? 'game' : 'activities')).map(slot => <div key={slot.id}>
          <button onClick={() => setSelectedSlots(current => ({ ...current, [`${workspace}:${tab}`]: slot.id }))}>Resume {slot.game?.pack.title || `${slot.profile.grade} activity`}</button>
          <button onClick={() => discardSlot(slot)}>Discard unfinished {slot.game?.pack.title || 'activity'}</button>
        </div>)}
      </section>}
      {child &&
        practiceReady &&
        tab === 'games' &&
        !pack && (
          <section className="beta-panel">
            <h1>Practice your Ninja Skills</h1>
            <p>
              Games use the most recent earlier week with relevant targets, separately for writing and reading. Writing:{' '}
              {earlierWriting[0]?.dateRange || 'No earlier targets'}. Reading:{' '}
              {earlierReading[0]?.dateRange || 'No earlier targets'}.
            </p>
            <div className="beta-game-grid">
              {capabilities.map((c) =>
                c.status === 'ready' ? (
                  <button className="primary-button" key={c.pack.moduleId} onClick={() => {
                    setActivityError('')
                    const paused = slots.find(slot => slot.workspace === workspace && slot.game?.pack.moduleId === c.pack.moduleId)
                    if (paused) setSelectedSlots(current => ({ ...current, [`${workspace}:games`]: paused.id }))
                    else newSlot('game', c.pack)
                  }}>
                    {c.pack.title}
                  </button>
                ) : (
                  <article key={c.moduleId}>
                    <h2>{learningModuleCatalogEntry(c.moduleId).title}</h2>
                    <p>{c.reason}</p>
                    <button disabled>Needs teacher-approved content</button>
                  </article>
                ),
              )}
            </div>
            <p>Additional games will appear when their required teacher-approved content is available.</p>
          </section>
        )}
      {child && tab === 'progress' && <ResultHistory
        key={`${scope}:${child.id}`}
        child={child}
        results={results}
        nextPageToken={historyCursor.owner === `${scope}:${child.id}` ? historyCursor.token : ''}
        readLocalResults={previewResults}
        loadPage={familyId && historyCursor.owner === `${scope}:${child.id}` ? async (token, signal) => {
          const page = await familyResultRepository(familyId).listPage(child.id, token, signal)
          signal.throwIfAborted()
          assertSavedAttemptsMatch(page.results, localStorage, RESULT_KEY)
          return page
        } : undefined}
      />}
      {tab === 'parent' && (
        <section className="beta-panel">
          <h1>Parent controls</h1>
          {!adultUnlocked ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await signIn(auth.user!.email, password)
                  setAdultUnlocked(true)
                  setPassword('')
                } catch (e) {
                  setError(message(e))
                }
              }}
            >
              <label>
                Confirm parent password{' '}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button>Unlock profile changes</button>
            </form>
          ) : (
            <>
              {!firebaseConfigReady && (
                <p>
                  These learner profiles are stored only in this browser. They do not sync to another device.
                </p>
              )}
              <p>Download a private copy of this site's saved scores, reviewed acquisition responses, checkpoints, and problem reports before changing devices or website addresses. This does not move or erase anything.</p>
              {familyId && <p>Older device-only learner records remain on their original website and are not automatically assigned to an online child profile. Keep their export if you want those histories reconciled.</p>}
              <button type="button" onClick={() => {
                try {
                  const data = deviceExport(localStorage, location.origin)
                  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `ninja-dojo-device-records-${data.createdAt.slice(0, 10)}.json`
                  link.click()
                  setTimeout(() => URL.revokeObjectURL(url), 60_000)
                } catch (error) { setError(message(error)) }
              }}>Download this device's records</button>
              {profiles.map((p) => (
                <div key={p.id} className="beta-profile">
                  <strong>
                    {p.nickname} · {p.grade}
                  </strong>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const value = prompt('Child’s name', p.nickname)?.trim()
                      if (value) void editProfile(p, { nickname: value })
                    }}
                  >
                    Edit name
                  </button>
                  <button disabled={busy} onClick={() => void editProfile(p, { active: !p.active })}>
                    {p.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <label>
                    Grade{' '}
                    <select
                      aria-label={`Grade for ${p.nickname}`}
                      value={p.grade}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.value as BetaGrade
                        if (
                          confirm(
                            `Move ${p.nickname} from ${p.grade} to ${next}? Existing scores will remain in history. You can return to the previous grade here.`,
                          )
                        )
                          void editProfile(p, { grade: next })
                      }}
                    >
                      {BETA_GRADES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!name.trim()) return
                  setBusy(true)
                  try {
                    const p = familyId
                      ? await createChild(familyId, { nickname: name.trim(), grade, schoolYear: DEFAULT_SCHOOL_YEAR })
                      : { id: crypto.randomUUID(), nickname: name.trim(), grade, active: true }
                    setProfiles((v) => [...v, p as BetaProfile])
                    setSelectedId(p.id)
                    setName('')
                  } catch (e) {
                    setError(message(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <label>
                  Child’s name <input required value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Grade{' '}
                  <select value={grade} onChange={(e) => setGrade(e.target.value as BetaGrade)}>
                    {BETA_GRADES.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Add child</button>
              </form>
            </>
          )}
          {curriculum && (
            <details>
              <summary>Curriculum source status</summary>
              <p>
                Source checked: {curriculum.snapshot.retrievedAt}. Teacher file updated:{' '}
                {curriculum.snapshot.sourceModifiedAt}.
              </p>
              <p>
                {import.meta.env.VITE_CURRICULUM_URL
                  ? 'Automatic curriculum endpoint configured.'
                  : 'Verified source snapshot. Automatic server synchronization is prepared but not deployed.'}
              </p>
              {curriculum.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <ul>
                {capabilities
                  .filter((c) => c.status === 'unavailable')
                  .map(
                    (c) =>
                      c.status === 'unavailable' && (
                        <li key={c.moduleId}>
                          {c.moduleId}: {c.reason}
                        </li>
                      ),
                  )}
              </ul>
            </details>
          )}
          {auth.user && (
            <button
              onClick={() => {
                if (slots.length && !confirmActivityDiscard()) return
                sessionStorage.removeItem(PROFILE_KEY)
                signOut()
                setProfiles([])
                setFamilyId(null)
                setAdultUnlocked(false)
              }}
            >
              Sign out parent
            </button>
          )}
        </section>
      )}
      {offlineShell && <p className="beta-status" data-offline-shell-status>{offlineShell}</p>}
    </div>
  )
}

createRoot(document.getElementById('beta-root')!).render(
  <>
    <AppErrorBoundary>
      <FamilyPreview />
    </AppErrorBoundary>
    <ProblemReporter />
  </>,
)
