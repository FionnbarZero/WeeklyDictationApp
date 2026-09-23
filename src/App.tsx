import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft, BarChart3, Check, ChevronDown, Clock3, Headphones, History, Home, Languages, LogOut,
  RotateCcw, Sparkles, Volume2, X,
} from 'lucide-react'
import {
  APP_STATE_KEY, AUDIO_PAUSE_MS, audioPartsForWord, type AppState, type Dataset, type DatasetLifecycle, type DatasetScore,
  datasetLifecycle, buildWarmupSelection, commitCompletedSession, createInitialState,
  filterDatasetsForChild, getPrimaryDataset, latestScore, loadState, localDateKey, createSessionId, sortDatasetsNewestFirst, timerSecondsFor, shouldSuggestGradePromotion, nextGrade, type LifecyclePhase,
  type PracticeSession, type SessionAnswer, type Word, LEGACY_ATTEMPTS_KEY,
} from './domain'
import { authErrorMessage, sendPasswordResetEmail, signIn, signOut, signUp, subscribeAuth, type AuthState } from './firebaseClient'
import { firebaseConfigReady, firebaseSetupMessage, DEFAULT_GRADE, DEFAULT_SCHOOL_YEAR } from './config'
import { abandonSession, cloudDataToAppState, completeCloudSession, createChild, ensureParentFamily, listAttempts, listChildren, listDatasetWords, listDatasets, listScores, listSessions, saveCloudAttempt, startCloudSession, updateChild, updateCloudSession, type ChildProfile, type CloudAttempt, type CloudSession, type FamilyRecord } from './firestoreClient'

type View = 'home' | 'practice' | 'history'
type Child = ChildProfile & { name: string; color: string; initials: string }

const demoChildren: Child[] = [
  { id: 'maya', name: 'Maya', nickname: 'Maya', grade: 'Kindergarten', schoolYear: '2026–27', active: true, gradeEffectiveDate: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', color: 'coral', initials: 'M' },
  { id: 'eli', name: 'Eli', nickname: 'Eli', grade: 'Grade 2', schoolYear: '2026–27', active: true, gradeEffectiveDate: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', color: 'blue', initials: 'E' },
]

const REVIEW_INSTRUCTION = 'If you cheat, you are just cheating yourself. Answer whether you got it right or wrong honestly, to improve your score.'

function localStorageGet(key: string) { try { return window.localStorage.getItem(key) } catch { return null } }
function localStorageSet(key: string, value: string) { try { window.localStorage.setItem(key, value) } catch { /* optional persistence */ } }
function shuffle<T>(items: T[]) { const output = [...items]; for (let index = output.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(Math.random() * (index + 1)); [output[index], output[swapIndex]] = [output[swapIndex], output[index]] } return output }
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
function lifecycleLabel(lifecycle: DatasetLifecycle) { return lifecycle === 'acquisition' ? 'Acquisition' : lifecycle === 'test-review' ? 'Test Review' : lifecycle === 'future' ? 'Future' : 'Archived' }
function phaseLabel(phase: LifecyclePhase) { return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition' }

function unlockSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.resume()
}

function App() {
  const [auth, setAuth] = useState<AuthState>(() => firebaseConfigReady ? { status: 'loading', user: null, error: null } : { status: 'unconfigured', user: null, error: null })
  useEffect(() => subscribeAuth(setAuth), [])
  if (auth.status === 'loading') return <div className="auth-shell"><div className="auth-card"><Sparkles size={28} /><h1>Loading Weekly Dictation</h1><p>Checking your secure family session…</p></div></div>
  if (firebaseConfigReady && auth.status === 'signed-out') return <AuthScreen />
  return <AuthenticatedApp auth={auth} />
}

function AuthenticatedApp({ auth }: { auth: AuthState }) {
  const [view, setView] = useState<View>('home')
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [familyChildren, setFamilyChildren] = useState<Child[]>(firebaseConfigReady ? [] : demoChildren)
  const [selectedChildId, setSelectedChildId] = useState(() => localStorageGet('weekly-dictation-child') || demoChildren[0].id)
  const [state, setState] = useState<AppState>(() => firebaseConfigReady ? { version: 2, datasets: [], results: [], scores: [], warmupSessions: [], completedSessions: [], legacyRecords: [] } : loadState(localStorageGet(APP_STATE_KEY), localStorageGet(LEGACY_ATTEMPTS_KEY)) || createInitialState())
  const [session, setSession] = useState<PracticeSession | null>(null)
  const completedSessionRef = useRef<string | null>(null)
  const cloudSessionsRef = useRef(new Map<string, CloudSession>())
  const [showChildMenu, setShowChildMenu] = useState(false); const [showProfiles, setShowProfiles] = useState(false); const [completedSummary, setCompletedSummary] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(Boolean(auth.user))
  const [cloudError, setCloudError] = useState<string | null>(null)
  const selectedChild = familyChildren.find((child) => child.id === selectedChildId) || familyChildren.find((child) => child.active) || familyChildren[0]
  const primaryDatasets = useMemo(() => selectedChild && firebaseConfigReady ? filterDatasetsForChild(state.datasets, selectedChild.grade, selectedChild.schoolYear) : state.datasets, [selectedChild, state.datasets])
  const primaryContext = useMemo(() => getPrimaryDataset(primaryDatasets, new Date()), [primaryDatasets])
  const primaryDataset = primaryContext?.dataset || null; const primaryPhase = primaryContext?.phase || 'acquisition'
  const warmupSelection = useMemo(() => selectedChild ? buildWarmupSelection({ datasets: state.datasets, results: state.results, warmupSessions: state.warmupSessions, childId: selectedChild.id }) : null, [selectedChild, state.datasets, state.results, state.warmupSessions])
  const warmupOnly = Boolean(!primaryDataset || primaryDataset.words.length === 0)
  const promotionSuggested = Boolean(selectedChild && shouldSuggestGradePromotion(selectedChild))

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
    void Promise.all([listDatasets(), listSessions(family.id, selectedChild.id), listScores(family.id, selectedChild.id)]).then(async ([rawDatasets, sessions, scores]) => {
      const datasets = await Promise.all(rawDatasets.map(async (dataset) => dataset.words?.length ? dataset : { ...dataset, words: await listDatasetWords(dataset.id) }))
      const readableSessions = sessions.filter((item) => item.status !== 'abandoned')
      const attempts = (await Promise.all(readableSessions.map((item) => listAttempts(family.id, selectedChild.id, item.id)))).flat()
      await Promise.all(readableSessions.filter((item) => item.status === 'in_progress').map((item) => abandonSession(family.id, selectedChild.id, item)))
      if (cancelled) return
      setState(cloudDataToAppState(datasets, scores, readableSessions, attempts.filter((item) => item.completionStatus === 'complete'), selectedChild.id))
    }).catch((error) => { if (!cancelled) setCloudError(authErrorMessage(error)) }).finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [auth.user?.uid, family?.id, selectedChild?.id])

  const chooseChild = (childId: string) => { setSelectedChildId(childId); setShowChildMenu(false); setShowProfiles(false); setSession(null); setView('home') }
  const confirmPromotion = async () => {
    if (!selectedChild) return
    const promoted = nextGrade(selectedChild.grade); if (!promoted) return
    if (family) { const updated = await updateChild(family.id, selectedChild.id, { grade: promoted, schoolYear: DEFAULT_SCHOOL_YEAR, gradeEffectiveDate: localDateKey() }); setFamilyChildren((items) => items.map((item) => item.id === selectedChild.id ? { ...item, ...updated, name: updated.nickname, initials: updated.nickname.slice(0, 1).toUpperCase() } : item)) }
    else setFamilyChildren((items) => items.map((item) => item.id === selectedChild.id ? { ...item, grade: promoted, schoolYear: DEFAULT_SCHOOL_YEAR, gradeEffectiveDate: localDateKey() } : item))
  }
  const startPractice = useCallback(async () => {
    if (!selectedChild || !warmupSelection || (warmupOnly && warmupSelection.words.length === 0)) return
    const warmup = warmupSelection
    const primaryDatasetId = primaryDataset?.id || warmup.words[0]?.datasetId || 'warmup-only'
    const id = createSessionId()
    if (auth.user && family) {
      try {
        const cloud = await startCloudSession(family.id, selectedChild.id, { id, childId: selectedChild.id, sessionDate: new Date().toISOString(), localDate: localDateKey(new Date()), startedAt: new Date().toISOString(), primaryPhase, datasetId: primaryDatasetId, warmupOnly, warmupStatus: 'in_progress' })
        cloudSessionsRef.current.set(id, cloud)
      } catch (error) { setCloudError(`Practice could not be saved: ${authErrorMessage(error)}`); return }
    }
    completedSessionRef.current = null
    setCompletedSummary(null); setSession({ id, childId: selectedChild.id, grade: selectedChild.grade, primaryDatasetId, primaryPhase, segment: 'warmup', stage: 'warmup-intro', queue: shuffle(warmup.words), warmupQueue: warmup.words, primaryQueue: warmupOnly ? [] : shuffle(primaryDataset?.words || []), index: 0, startedAt: new Date().toISOString(), warmupAnswers: [], primaryAnswers: [], warmupOnly, cloudSessionId: auth.user ? id : undefined }); setView('practice')
  }, [auth.user, family, primaryDataset, primaryPhase, selectedChild, warmupOnly, warmupSelection])
  const exitPractice = () => { if (auth.user && family && session?.cloudSessionId && selectedChild) { const cloud = cloudSessionsRef.current.get(session.cloudSessionId); if (cloud) void abandonSession(family.id, selectedChild.id, cloud).catch((error) => setCloudError(authErrorMessage(error))) }; setSession(null); setView('home') }
  const beginWarmup = () => { unlockSpeech(); setSession((current) => {
    if (!current || current.stage !== 'warmup-intro') return current
    if (current.queue.length === 0) return current.primaryQueue.length === 0 ? { ...current, segment: 'primary', stage: 'complete', queue: [], index: 0 } : { ...current, segment: 'primary', stage: 'interstitial', queue: current.primaryQueue, index: 0 }
    return { ...current, stage: 'interstitial', index: 0 }
  }) }
  const completeInterstitial = () => setSession((current) => current && current.stage === 'interstitial' ? { ...current, stage: 'dictation' } : current)
  const completeDictationWord = () => setSession((current) => {
    if (!current || current.stage !== 'dictation') return current
    if (current.index < current.queue.length - 1) return { ...current, stage: 'interstitial', index: current.index + 1 }
    if (current.segment === 'warmup') return { ...current, stage: 'review', index: 0 }
    return { ...current, stage: 'complete' }
  })
  const startPrimaryReview = () => {
    if (session?.stage === 'complete' && session.primaryQueue.length === 0) { completeSession({ ...session, segment: 'primary', queue: [], primaryAnswers: [] }); return }
    setSession((current) => current && current.stage === 'complete' ? { ...current, stage: 'review', index: 0 } : current)
  }
  const completeSession = (finished: PracticeSession) => {
    const committed = commitCompletedSession(state, finished)
    setState(committed)
    if (auth.user && family && finished.cloudSessionId && selectedChild) {
      const cloud = cloudSessionsRef.current.get(finished.cloudSessionId)
      if (cloud) {
        const answers = [...finished.warmupAnswers, ...finished.primaryAnswers]
        const attempts: CloudAttempt[] = answers.map((answer, index) => ({ id: `${finished.id}-${answer.word.id}-${index}`, sessionId: finished.id, wordId: answer.word.id, sourceDatasetId: answer.word.datasetId, phase: finished.warmupAnswers.includes(answer) ? 'warmup' : finished.primaryPhase, correct: answer.correct, reviewedAt: new Date().toISOString(), completionStatus: 'complete' }))
        void completeCloudSession(family.id, selectedChild.id, cloud, attempts, committed.scores.filter((score) => score.sessionId === finished.id)).catch((error) => setCloudError(`Your score could not be confirmed in the cloud: ${authErrorMessage(error)}`))
      }
    }
    setCompletedSummary(finished.warmupOnly ? 'Mastery warmup complete. Your warmup results are saved.' : 'Practice complete. Your warmup and dataset results are saved.'); setSession(null); setView('home')
  }
  const answer = (correct: boolean) => {
    const current = session
    if (!current || current.stage !== 'review') return
    const response: SessionAnswer = { word: current.queue[current.index], correct, revealMethod: 'timer' }
    const isWarmup = current.segment === 'warmup'
    const answers = isWarmup ? [...current.warmupAnswers, response] : [...current.primaryAnswers, response]
    if (auth.user && family && current.cloudSessionId && selectedChild) {
      const cloud = cloudSessionsRef.current.get(current.cloudSessionId)
      if (cloud) {
        void saveCloudAttempt(family.id, selectedChild.id, current.cloudSessionId, { id: `${current.id}-${response.word.id}-${current.index}`, sessionId: current.id, wordId: response.word.id, sourceDatasetId: response.word.datasetId, phase: isWarmup ? 'warmup' : current.primaryPhase, correct, reviewedAt: new Date().toISOString(), completionStatus: isWarmup && current.index === current.queue.length - 1 ? 'complete' : 'temporary' }).catch((error) => setCloudError(`A practice result could not be saved: ${authErrorMessage(error)}`))
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
  const navigate = (nextView: View) => { if (view === 'practice' && nextView !== 'practice') setSession(null); setView(nextView) }

  if (dataLoading && auth.user && familyChildren.length === 0) return <div className="auth-shell"><div className="auth-card"><Sparkles size={28} /><h1>Loading your family</h1><p>Securely loading children and weekly datasets…</p></div></div>
  if (!selectedChild) return <div className="auth-shell"><div className="auth-card"><h1>Add a child to begin</h1><p>{cloudError || 'Your family does not have an active child profile yet.'}</p><button className="primary-button" onClick={() => setShowProfiles(true)}>Add child</button></div>{showProfiles && family && <ProfileModal children={familyChildren} selectedChildId="" onSelect={() => undefined} onClose={() => setShowProfiles(false)} onAdd={async (input) => { const created = await createChild(family.id, input); setFamilyChildren([{ ...created, name: created.nickname, color: 'coral', initials: created.nickname.slice(0, 1).toUpperCase() }]); setSelectedChildId(created.id); setShowProfiles(false) }} onUpdate={async () => undefined} />}</div>
  const legacyCount = state.legacyRecords.filter((record) => record.childId === selectedChild.id).length
  return <div className="app-shell"><header className="topbar"><button className="brand" onClick={() => navigate('home')} aria-label="Go to home"><span className="brand-mark"><Sparkles size={17} strokeWidth={2.5} /></span><span>weekly<span className="brand-accent">dictation</span></span></button><div className="topbar-actions"><button className="profile-switcher" onClick={() => setShowChildMenu((current) => !current)}><span className={`avatar avatar-${selectedChild.color}`}>{selectedChild.initials}</span><span className="profile-switcher-copy"><small>Practicing as</small>{selectedChild.name}</span><ChevronDown size={16} /></button>{showChildMenu && <div className="child-menu"><p>Switch child</p>{familyChildren.filter((child) => child.active).map((child) => <button key={child.id} className={child.id === selectedChild.id ? 'selected' : ''} onClick={() => chooseChild(child.id)}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span><strong>{child.name}</strong><small>{child.grade}</small></span>{child.id === selectedChild.id && <Check size={15} />}</button>)}<button className="manage-children" onClick={() => { setShowChildMenu(false); setShowProfiles(true) }}>Manage profiles <ArrowLeft size={14} /></button><button className="manage-children" onClick={() => signOut()}><LogOut size={14} /> Sign out</button></div>}</div></header><main className="main-content">{cloudError && auth.user && <div className="error-banner">{cloudError}</div>}{promotionSuggested && <div className="promotion-banner"><span>Your {selectedChild.grade} school year is ready to advance.</span><button onClick={() => void confirmPromotion()}>Move to {nextGrade(selectedChild.grade)}</button></div>}{view === 'home' && primaryDataset && <HomeView child={selectedChild} datasets={primaryDatasets} scores={state.scores} primaryDataset={primaryDataset} primaryPhase={primaryPhase} warmupOnly={warmupOnly} warmupWords={warmupSelection?.words.length || 0} completedSummary={completedSummary} onStart={startPractice} onHistory={() => setView('history')} onProfiles={() => setShowProfiles(true)} />}{view === 'home' && !primaryDataset && <NoDatasetView child={selectedChild} datasets={primaryDatasets} warmupWords={warmupSelection?.words.length || 0} onStartWarmup={startPractice} onHistory={() => setView('history')} onProfiles={() => setShowProfiles(true)} />}{view === 'practice' && session && <PracticeView session={session} datasets={state.datasets} onExit={exitPractice} onReplay={() => session.stage === 'complete' ? speakReviewInstruction() : session.queue[session.index] ? speakWord(session.queue[session.index], session.segment === 'warmup') : undefined} onBeginWarmup={beginWarmup} onInterstitialComplete={completeInterstitial} onDictationComplete={completeDictationWord} onStartReview={startPrimaryReview} onAnswer={answer} />}{view === 'history' && <HistoryView child={selectedChild} datasets={primaryDatasets} scores={state.scores} legacyCount={legacyCount} onBack={() => setView('home')} />}</main>{view !== 'practice' && <nav className="bottom-nav" aria-label="Primary navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><Home size={19} /><span>Practice</span></button><button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><BarChart3 size={19} /><span>Progress</span></button><button onClick={() => setShowProfiles(true)}><Languages size={19} /><span>Profiles</span></button></nav>}{showProfiles && <ProfileModal children={familyChildren} selectedChildId={selectedChildId} onSelect={chooseChild} onClose={() => setShowProfiles(false)} onAdd={async (input) => { if (!family) return; const created = await createChild(family.id, input); setFamilyChildren((items) => [...items, { ...created, name: created.nickname, color: 'coral', initials: created.nickname.slice(0, 1).toUpperCase() }]); setSelectedChildId(created.id) }} onUpdate={async (childId, patch) => { if (!family) return; const updated = await updateChild(family.id, childId, patch); setFamilyChildren((items) => items.map((item) => item.id === childId ? { ...item, ...updated, name: updated.nickname, initials: updated.nickname.slice(0, 1).toUpperCase() } : item)) }} />}</div>
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

function HomeView({ child, datasets, scores, primaryDataset, primaryPhase, warmupOnly, warmupWords, completedSummary, onStart, onHistory, onProfiles }: { child: Child; datasets: Dataset[]; scores: DatasetScore[]; primaryDataset: Dataset; primaryPhase: 'acquisition' | 'test-review'; warmupOnly: boolean; warmupWords: number; completedSummary: string | null; onStart: () => void; onHistory: () => void; onProfiles: () => void }) {
  const today = scores.filter((score) => score.childId === child.id && score.sessionDate === localDateKey()).length; const displayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()); const orderedDatasets = sortDatasetsNewestFirst(datasets)
  return <div className="page home-page"><section className="welcome-row"><div><p className="eyebrow">{displayDate}</p><h1>Ready when you are, <em>{child.name}.</em></h1><p className="subhead">{warmupOnly ? 'Review your mastery targets while this week’s primary set is unavailable.' : `Warm up first, then practice the ${primaryPhase === 'test-review' ? 'Test Review' : 'Acquisition'} words.`}</p></div><button className="mini-profile" onClick={onProfiles}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span>{child.grade}</span><ChevronDown size={15} /></button></section>{completedSummary && <div className="success-banner"><span className="success-icon"><Check size={17} /></span><span><strong>Practice complete!</strong> {completedSummary}</span><button onClick={onHistory}>See progress <ArrowLeft size={14} /></button></div>}<section className="hero-card"><div className="hero-copy"><div className="status-pill"><span className="status-dot" /> {warmupOnly ? 'Mastery Warmup' : phaseLabel(primaryPhase)} · {primaryDataset.dateRange}</div><h2>Your weekly<br /><span>word practice</span></h2><p>{warmupOnly ? (warmupWords > 0 ? `${warmupWords} mastery targets` : 'No prior mastery targets available') : `${primaryDataset.words.length} words · required warmup`} · {primaryDataset.dateRange}</p><button className="primary-button" onClick={onStart} disabled={warmupOnly && warmupWords === 0}>{warmupOnly ? 'Start mastery warmup' : 'Start the test'} <ArrowLeft size={17} /></button></div><div className="hero-illustration" aria-hidden="true"><div className="sun-shape" /><div className="paper-shape"><span>字</span><span>词</span><span>好</span></div><div className="pencil-shape" /><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div></div></section><section className="section-heading"><div><p className="eyebrow">Weekly datasets</p><h2>Every week stays on record</h2></div><button className="text-button" onClick={onHistory}>View progress <ArrowLeft size={15} /></button></section><div className="set-grid">{orderedDatasets.map((dataset, index) => <SetCard key={dataset.id} dataset={dataset} score={latestScore(scores, child.id, dataset.id)} tone={index % 2 === 0 ? 'yellow' : 'lavender'} />)}</div><section className="today-strip"><div className="strip-icon"><Clock3 size={18} /></div><div><strong>{today ? `${today} dataset score${today === 1 ? '' : 's'} recorded today` : 'No dataset scores recorded today'}</strong><span>Scores appear only after the complete relevant dataset is reviewed.</span></div><div className="strip-arrow">→</div></section></div>
}

function NoDatasetView({ child, datasets, warmupWords, onStartWarmup, onHistory, onProfiles }: { child: Child; datasets: Dataset[]; warmupWords: number; onStartWarmup: () => void; onHistory: () => void; onProfiles: () => void }) {
  return <div className="page home-page"><section className="welcome-row"><div><p className="eyebrow">Ready when you are</p><h1>Hi, <em>{child.name}.</em></h1><p className="subhead">{warmupWords > 0 ? 'The current week has no primary word set. Your mastery warmup is still available.' : 'There is no active weekly dataset scheduled right now.'}</p></div><button className="mini-profile" onClick={onProfiles}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span>{child.grade}</span><ChevronDown size={15} /></button></section><section className="hero-card"><div className="hero-copy"><div className="status-pill"><span className="status-dot" /> {warmupWords > 0 ? 'Mastery Warmup' : 'No active dataset'}</div><h2>{warmupWords > 0 ? <>Keep your<br /><span>mastery growing</span></> : <>Your next<br /><span>practice set</span></>}</h2><p>{warmupWords > 0 ? `${warmupWords} mastery target${warmupWords === 1 ? '' : 's'} available` : `${datasets.length} weekly dataset${datasets.length === 1 ? '' : 's'} remain on record.`}</p>{warmupWords > 0 && <button className="primary-button" onClick={onStartWarmup}>Start mastery warmup <ArrowLeft size={17} /></button>}{warmupWords === 0 && <button className="primary-button" onClick={onHistory}>View progress <ArrowLeft size={17} /></button>}</div><div className="hero-illustration" aria-hidden="true"><div className="sun-shape" /><div className="paper-shape"><span>字</span><span>词</span><span>好</span></div><div className="pencil-shape" /><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div></div></section></div>
}

function SetCard({ dataset, score, tone }: { dataset: Dataset; score: DatasetScore | null; tone: 'yellow' | 'lavender' }) { const lifecycle = datasetLifecycle(dataset, new Date()); return <article className={`set-card set-${tone}`}><div className="set-card-top"><span className="set-label">{lifecycleLabel(lifecycle)}</span><span className="score-badge">{score ? `${score.percent}% · ${phaseLabel(score.phase)}` : 'Not scored'}</span></div><h3>{dataset.dateRange}</h3><p className="set-date">{dataset.description} · {dataset.words.length} words</p><div className="set-footer"><span>{dataset.grade}</span><div className="tiny-progress"><span style={{ width: `${score?.percent || 0}%` }} /></div></div></article> }

function PracticeView({ session, datasets, onExit, onReplay, onBeginWarmup, onInterstitialComplete, onDictationComplete, onStartReview, onAnswer }: { session: PracticeSession; datasets: Dataset[]; onExit: () => void; onReplay: () => void; onBeginWarmup: () => void; onInterstitialComplete: () => void; onDictationComplete: () => void; onStartReview: () => void; onAnswer: (correct: boolean) => void }) {
  const term = session.queue[session.index]; const dataset = datasets.find((item) => item.id === term?.datasetId) || datasets.find((item) => item.id === session.primaryDatasetId); const [seconds, setSeconds] = useState(20); const advanceGuard = useRef<string | null>(null); const isWarmup = session.segment === 'warmup'; const timerSeconds = timerSecondsFor(session.segment, session.primaryPhase); const stageKey = `${session.id}:${session.segment}:${session.stage}:${session.index}`
  useEffect(() => { advanceGuard.current = null }, [stageKey])
  useEffect(() => { if (session.stage === 'warmup-intro') return; if (session.stage === 'interstitial') { const transition = window.setTimeout(onInterstitialComplete, 1500); return () => window.clearTimeout(transition) } if (session.stage === 'complete') { const stop = speakReviewInstruction(); return () => stop?.() } setSeconds(session.stage === 'dictation' ? timerSeconds : 0); const stop = speakWord(term, isWarmup); return () => stop?.() }, [stageKey, session.stage, term, isWarmup, timerSeconds, onInterstitialComplete])
  useEffect(() => { if (session.stage !== 'dictation') return; const timer = window.setInterval(() => setSeconds((value) => { if (value <= 1) { window.clearInterval(timer); if (advanceGuard.current === stageKey) return 0; advanceGuard.current = stageKey; onDictationComplete(); return 0 } return value - 1 }), 1000); return () => window.clearInterval(timer) }, [session.stage, stageKey, onDictationComplete])
  const progress = session.segment === 'warmup' ? Math.round((session.index / Math.max(session.queue.length, 1)) * 25) : session.stage === 'complete' ? 50 : 50 + Math.round((session.index / Math.max(session.queue.length, 1)) * 50); const count = session.stage === 'complete' ? 'Test complete' : session.segment === 'warmup' ? `Warmup ${session.index + 1}` : `Word ${session.index + 1}`
  return <div className="practice-page"><div className="practice-top"><button className="back-button" onClick={onExit}><X size={18} /> Exit practice</button><span className="practice-count">{count}<span>{session.stage === 'dictation' || session.stage === 'review' ? ` of ${session.queue.length}` : ''}</span></span></div><div className="practice-progress"><span style={{ width: `${progress}%` }} /></div><section className={`prompt-card ${session.stage === 'warmup-intro' || session.stage === 'interstitial' || session.stage === 'complete' ? 'interstitial-card' : ''}`}>
    {session.stage === 'warmup-intro' && <><div className="interstitial-mark"><Sparkles size={25} /></div><p className="eyebrow">Required before every session</p><h1>Warm up</h1><p className="practice-helper">Let’s get ready to warm up.</p><button className="primary-button" onClick={onBeginWarmup}>Begin warmup <ArrowLeft size={17} /></button></>}
    {session.stage === 'interstitial' && <><div className="interstitial-mark"><Volume2 size={25} /></div><p className="eyebrow">{isWarmup ? 'Warm up' : phaseLabel(session.primaryPhase)}</p><h1>{isWarmup ? `Warmup word ${session.index + 1}` : `Word ${session.index + 1}`}</h1><p className="practice-helper">Listen carefully, then write what you hear.</p>{term && <button className="replay-button" onClick={onReplay}><Volume2 size={16} /> Play word audio</button>}</>}
    {session.stage === 'complete' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Dictation finished · {dataset?.dateRange}</p><h1>Test complete</h1><p className="review-instruction">{REVIEW_INSTRUCTION}</p><button className="primary-button review-start-button" onClick={onStartReview}>Start review <ArrowLeft size={17} /></button><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay instructions</button></>}
    {session.stage === 'dictation' && <><div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup' : phaseLabel(session.primaryPhase)} · {dataset?.dateRange}</span><span className="timer"><Clock3 size={15} /> 00:{String(seconds).padStart(2, '0')}</span></div><div className="speaker-orb"><div className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></div><h1>Listen, then write<br /><span>what you hear.</span></h1><p className="practice-helper">Write the word on paper. The answer will be reviewed after the complete set is heard.</p><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay sequence</button><p className="dictation-status">The next word begins when the timer ends.</p></>}
    {session.stage === 'review' && <><div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup review' : `${phaseLabel(session.primaryPhase)} review`} · {dataset?.dateRange}</span><span className="review-label">Check your paper</span></div><div className="review-heading"><p className="answer-label">The word was</p><div className="answer-word">{term.text}</div></div><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay word sequence</button><div className="context-box"><span>In a sentence</span><p>{term.sentence}</p></div><div className="answer-actions"><button className="wrong-button" onClick={() => onAnswer(false)}><X size={17} /> I got it wrong</button><button className="right-button" onClick={() => onAnswer(true)}><Check size={17} /> I got it right</button></div><p className="answer-note">Be honest with yourself — that’s how you grow.</p></>}
  </section><p className="practice-footnote"><Headphones size={14} /> Mandarin audio plays automatically · You can replay it anytime</p></div>
}

function HistoryView({ child, datasets, scores, legacyCount, onBack }: { child: Child; datasets: Dataset[]; scores: DatasetScore[]; legacyCount: number; onBack: () => void }) { const ordered = sortDatasetsNewestFirst(datasets); return <div className="page history-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to practice</button><div className="history-heading"><div><p className="eyebrow">Progress for {child.name}</p><h1>Small steps,<br /><em>real progress.</em></h1></div><div className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</div></div>{legacyCount > 0 && <div className="history-note"><History size={17} /><span>{legacyCount} legacy result{legacyCount === 1 ? '' : 's'} preserved without an invented date range.</span></div>}{ordered.map((dataset) => <DatasetGraph key={dataset.id} dataset={dataset} scores={scores.filter((score) => score.childId === child.id && score.datasetId === dataset.id)} />)}</div> }
function DatasetGraph({ dataset, scores }: { dataset: Dataset; scores: DatasetScore[] }) { const orderedScores = [...scores].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)); return <section className="dataset-graph progress-card"><div className="progress-card-heading"><div><span className="eyebrow">{dataset.dateRange} · {dataset.grade}</span><h2>{dataset.description}</h2></div><BarChart3 size={22} /></div>{orderedScores.length === 0 ? <p className="empty-graph">No complete dataset review has been scored yet.</p> : <div className="score-list">{orderedScores.map((score) => <div className="score-row" key={score.id}><div className={`score-dot dot-${score.phase}`} /><div className="score-row-copy"><strong>{score.sessionDate}</strong><span>{phaseLabel(score.phase)} · {score.correct}/{score.wordCount} correct</span></div><div className="score-bar"><span style={{ width: `${score.percent}%` }} /></div><strong className="score-number">{score.percent}%</strong></div>)}</div>}</section> }
function ProfileModal({ children, selectedChildId, onSelect, onClose, onAdd, onUpdate }: { children: Child[]; selectedChildId: string; onSelect: (id: string) => void; onClose: () => void; onAdd: (input: Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear'>) => Promise<void>; onUpdate: (childId: string, patch: Partial<Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear' | 'active'>>) => Promise<void> }) {
  const [nickname, setNickname] = useState(''); const [grade, setGrade] = useState<string>(DEFAULT_GRADE); const [schoolYear, setSchoolYear] = useState(DEFAULT_SCHOOL_YEAR); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const add = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await onAdd({ nickname, grade, schoolYear }); setNickname('') } catch (caught) { setError(authErrorMessage(caught)) } finally { setSaving(false) } }
  return <div className="modal-backdrop" onClick={onClose}><div className="profile-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Family profiles</p><h2>Who is practicing?</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="profile-grid">{children.map((child) => <div key={child.id} className={`profile-card ${child.id === selectedChildId ? 'active' : ''} ${!child.active ? 'inactive' : ''}`}><button className="profile-select" disabled={!child.active} onClick={() => { onSelect(child.id); onClose() }}><span className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</span><strong>{child.name}</strong><span>{child.grade} · {child.active ? 'Active' : 'Inactive'}</span>{child.id === selectedChildId && <span className="profile-check"><Check size={14} /></span>}</button><div className="profile-actions"><button onClick={() => { const nextName = window.prompt('Child nickname', child.nickname); if (nextName && nextName !== child.nickname) void onUpdate(child.id, { nickname: nextName }) }}>Edit nickname</button><button onClick={() => void onUpdate(child.id, { active: !child.active })}>{child.active ? 'Mark inactive' : 'Reactivate'}</button></div></div>)}</div><form className="add-child-form" onSubmit={add}><h3>Add child</h3><input placeholder="Nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} required /><select value={grade} onChange={(event) => setGrade(event.target.value)}><option>Kindergarten</option><option>Grade 1</option><option>Grade 2</option><option>Grade 3</option><option>Grade 4</option><option>Grade 5</option></select><input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} aria-label="School year" /><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Add child'}</button>{error && <div className="error-banner">{error}</div>}</form></div></div>
}

export default App
