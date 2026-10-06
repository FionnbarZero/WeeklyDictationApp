import { createRoot } from 'react-dom/client'
import { ProblemReporter } from './ProblemReporter.tsx'
import { AudioCheck } from './AudioCheck.tsx'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AppErrorBoundary } from '../AppErrorBoundary.tsx'
import { firebaseConfigReady, DEFAULT_SCHOOL_YEAR } from '../config.ts'
import { subscribeAuth, signIn, signOut, type AuthState } from '../firebaseClient.ts'
import { createChild, ensureParentFamily, listChildren, updateChild } from '../firestoreClient.ts'
import { fetchCurriculum, gradeSlugs } from './curriculum.ts'
import { BETA_GRADES, dailyTotals, isBetaResult, type BetaGrade, type BetaProfile, type BetaResult } from './model.ts'
import { PROFILE_KEY, RESULT_KEY, acknowledgeResult, pendingResults, previewResults, savePreviewResult } from './runtime.ts'
import { familyResultRepository } from './cloud.ts'
import { deviceExport } from './deviceExport.ts'
import { familyDeviceSyncRepository } from './deviceSync.ts'
import { learningModuleCapabilities } from '../ninjaSkills/content.ts'
import { learningModuleCatalogEntry } from '../ninjaSkills/catalog.ts'
import { channelCohort, latestEarlierTargets } from './gamePools.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import { localDateKey } from '../domain.ts'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import '../styles.css'
import './preview.css'

const AuthScreen = lazy(() => import('../auth/AuthScreen.tsx').then((m) => ({ default: m.AuthScreen })))
const ModuleHost = lazy(() =>
  import('../ninjaSkills/LearningModuleHost.tsx').then((m) => ({ default: m.LearningModuleHost })),
)
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
  const [curriculum, setCurriculum] = useState<Awaited<ReturnType<typeof fetchCurriculum>> | null>(null)
  const [week, setWeek] = useState('')
  const [results, setResults] = useState<BetaResult[]>([])
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
  const [pack, setPack] = useState<LearningModulePack | null>(null)
  const gameAttemptId = useRef('')
  const frame = useRef<HTMLIFrameElement>(null)
  const syncing = useRef(false)
  const syncAgain = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  const [readyChild, setReadyChild] = useState('')
  const child = profiles.find((p) => p.id === selectedId && p.active) || profiles.find((p) => p.active)
  const currentGrade = child?.grade || initialGrade
  const practiceReady = !firebaseConfigReady || Boolean(familyId && child && readyChild === child.id)
  useEffect(() => () => stopActiveAudio(), [pack, tab, child?.id])

  useEffect(() => subscribeAuth(setAuth), [])
  useEffect(() => {
    if (!auth.user) return
    let cancelled = false
    setReadyChild('')
    setFamilyId(null)
    setProfiles([])
    setResults([])
    void ensureParentFamily(auth.user)
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
      })
      .catch((e) => !cancelled && setError(message(e)))
    return () => {
      cancelled = true
    }
  }, [auth.user?.uid, initialGrade])

  useEffect(() => {
    if (child) sessionStorage.setItem(PROFILE_KEY, JSON.stringify(child))
    if (!firebaseConfigReady) localStorage.setItem('beta-preview-profiles', JSON.stringify(profiles))
  }, [child, profiles])

  useEffect(() => {
    const controller = new AbortController()
    setCurriculum((current) => (current?.snapshot.grade === currentGrade ? current : null))
    setWeek('')
    const refresh = () => {
      void fetchCurriculum(currentGrade, controller.signal)
        .then((loaded) => {
          if (!controller.signal.aborted) {
            setCurriculum(loaded)
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
        await familyDeviceSyncRepository(familyId).sync(localStorage, child.id, !frame.current && !pack)
        const repository = familyResultRepository(familyId)
        const pending = pendingResults()
        for (const item of pending) {
          if (!isBetaResult(item) || !profiles.some((p) => p.id === item.childId)) continue
          await repository.save(item)
          acknowledgeResult(item.id)
        }
        const saved = await repository.list(child.id)
        for (const result of saved) {
          const key = `${RESULT_KEY}:${result.id}`
          const previous = localStorage.getItem(key)
          if (previous && JSON.stringify(JSON.parse(previous)) !== JSON.stringify(result)) {
            const local = JSON.parse(previous) as BetaResult
            if (Object.keys(result).some(key => JSON.stringify(local[key as keyof BetaResult]) !== JSON.stringify(result[key as keyof BetaResult])))
              throw new Error('An online score differs from this device’s record. Both copies are preserved.')
          }
          if (!previous) localStorage.setItem(key, JSON.stringify(result))
        }
        setResults(saved)
        setStatus('Scores and saved practice confirmed in your private family account. Use the same parent account on your other device.')
        setReadyChild(child.id)
      } else {
        setResults(previewResults())
        setStatus('Saved in this browser on this device. Online syncing is not enabled; use the same grade link and browser next time.')
      }
      setError('')
    } catch (e) {
      setError(message(e))
      if (familyId) setReadyChild('')
      setStatus('Saving is not confirmed. Keep this browser’s data and retry.')
      try {
        setResults(previewResults())
      } catch {
        setResults([])
      }
    } finally {
      syncing.current = false
      if (syncAgain.current) {
        syncAgain.current = false
        void refreshRef.current()
      }
    }
  }, [child?.id, familyId, auth.user?.uid, profiles, pack])
  refreshRef.current = refreshProgress

  useEffect(() => {
    void refreshProgress()
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'family-beta-result-ready') {
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
  }, [refreshProgress])

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

  const today = localDateKey(new Date())
  const available =
    curriculum?.datasets.filter((d) => d.startDate <= today).sort((a, b) => b.startDate.localeCompare(a.startDate)) ||
    []
  const dataset = available.find((d) => d.startDate === week) || available[0]
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
            onChange={(e) => {
              if (window.confirm('Switch child? Any unfinished activity will be discarded.')) {
                setSelectedId(e.target.value)
                setPack(null)
              }
            }}
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
      {familyId && child && readyChild !== child.id && <section className="beta-panel" role="status">
        <p>Checking this child’s saved practice before opening activities. Existing device records are preserved.</p>
        <button type="button" onClick={() => void refreshProgress()}>Retry family sync</button>
      </section>}
      {child && practiceReady && (tab === 'activities' || tab === 'games') && (
        <label className="beta-week">
          Practice week{' '}
          <select
            aria-label="Practice week"
            value={week}
            onChange={(e) => {
              if (window.confirm('Change week? Any unfinished activity will be discarded.')) {
                setWeek(e.target.value)
                setPack(null)
              }
            }}
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
      {!child && <p>Add a child in Parent controls to begin.</p>}
      {child && practiceReady && tab === 'activities' && curriculum && (
        <iframe
          ref={frame}
          key={`${child.id}-${currentGrade}-${week}`}
          className="beta-grade-frame"
          title={`${currentGrade} activities`}
          src={frameUrl}
          allow="microphone 'self'; autoplay 'self'"
        />
      )}
      {child &&
        practiceReady &&
        tab === 'games' &&
        (pack ? (
          <Suspense fallback={<p>Loading game…</p>}>
            <ModuleHost
              pack={pack}
              playAudio={(text, language = 'zh-CN', rate = 0.65) => {
                return promptAudioCompleted(
                  playAudioPlan([
                    {
                      text,
                      language: language as 'zh-CN',
                      rate,
                      storagePath: kindergartenAudioForText(text)?.storagePath,
                    },
                  ]),
                )
              }}
              onExit={() => setPack(null)}
              onComplete={(summary) => {
                try {
                  const saved = savePreviewResult({
                    id: gameAttemptId.current,
                    activity: pack.title,
                    channel: 'game',
                    datasetIds: pack.cohort.provenance.map((p) => p.datasetId),
                    correct: summary.correct,
                    attempted: summary.attempted,
                  })
                  if (!saved) throw new Error('The completed game could not be saved for this child.')
                  setPack(null)
                  setActivityError('')
                  void refreshProgress()
                } catch (e) {
                  setActivityError(`${message(e)} Keep the game open and retry its completion.`)
                }
              }}
            />
          </Suspense>
        ) : (
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
                    gameAttemptId.current = crypto.randomUUID()
                    setActivityError('')
                    setPack(c.pack)
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
        ))}
      {child && tab === 'progress' && (
        <section className="beta-panel">
          <h1>{child.nickname}’s progress</h1>
          <p>Every completed attempt counts. Daily totals reset at midnight Pacific time; history is retained.</p>
          {dailyTotals(results, child.id).length ? (
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Summed score</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {dailyTotals(results, child.id).map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>
                      {d.correct} / {d.attempted}
                    </td>
                    <td>{d.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No completed scores yet.</p>
          )}
          <ul>
            {results
              .filter((r) => r.childId === child.id)
              .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
              .map((r) => (
                <li key={r.id}>
                  {r.day} · {r.grade} · {r.activity}: {r.correct}/{r.attempted}
                </li>
              ))}
          </ul>
        </section>
      )}
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
