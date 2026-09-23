import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BarChart3, Check, ChevronDown, Clock3, Headphones, History, Home, Languages, LogOut,
  RotateCcw, Sparkles, Volume2, X,
} from 'lucide-react'
import {
  APP_STATE_KEY, AUDIO_PAUSE_MS, audioPartsForWord, type AppState, type Dataset, type DatasetLifecycle, type DatasetScore,
  datasetLifecycle, buildWarmupSelection, commitCompletedSession, createInitialState,
  getPrimaryDataset, latestScore, loadState, localDateKey, createSessionId, sortDatasetsNewestFirst, timerSecondsFor, type LifecyclePhase,
  type PracticeSession, type SessionAnswer, type Word, LEGACY_ATTEMPTS_KEY,
} from './domain'

type View = 'home' | 'practice' | 'history'
type Child = { id: string; name: string; grade: string; color: string; initials: string }

const children: Child[] = [
  { id: 'maya', name: 'Maya', grade: 'Kindergarten', color: 'coral', initials: 'M' },
  { id: 'eli', name: 'Eli', grade: 'Grade 2', color: 'blue', initials: 'E' },
]

const REVIEW_INSTRUCTION = 'If you cheat, you are just cheating yourself. Answer whether you got it right or wrong honestly, to improve your score.'

function localStorageGet(key: string) { try { return window.localStorage.getItem(key) } catch { return null } }
function localStorageSet(key: string, value: string) { try { window.localStorage.setItem(key, value) } catch { /* optional persistence */ } }
function shuffle<T>(items: T[]) { const output = [...items]; for (let index = output.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(Math.random() * (index + 1)); [output[index], output[swapIndex]] = [output[swapIndex], output[index]] } return output }
type SpeechPart = { text: string; rate: number; lang?: string }
let stopActiveSpeech: (() => void) | null = null

function playSpeechSequence(parts: SpeechPart[], pauseMs = AUDIO_PAUSE_MS) {
  if (!('speechSynthesis' in window)) return
  stopActiveSpeech?.(); window.speechSynthesis.cancel()
  let partIndex = 0; let pauseTimer: number | undefined; let cancelled = false
  const playNext = () => {
    if (cancelled || partIndex >= parts.length) return
    const part = parts[partIndex]; partIndex += 1
    const utterance = new SpeechSynthesisUtterance(part.text); const language = part.lang || 'zh-CN'
    utterance.lang = language; utterance.rate = part.rate; utterance.pitch = 1
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()))
    if (voice) utterance.voice = voice
    utterance.onend = () => { if (!cancelled && partIndex < parts.length) pauseTimer = window.setTimeout(playNext, pauseMs) }
    utterance.onerror = () => { if (!cancelled) playNext() }
    window.speechSynthesis.speak(utterance)
  }
  playNext()
  const stop = () => { cancelled = true; if (pauseTimer) window.clearTimeout(pauseTimer); window.speechSynthesis.cancel() }
  stopActiveSpeech = stop
  return stop
}

function speakWord(word: Word, warmup: boolean) { return playSpeechSequence(audioPartsForWord(word, warmup)) }
function speakReviewInstruction() { return playSpeechSequence([{ text: REVIEW_INSTRUCTION, rate: 0.9, lang: 'en-GB' }], 0) }
function lifecycleLabel(lifecycle: DatasetLifecycle) { return lifecycle === 'acquisition' ? 'Acquisition' : lifecycle === 'test-review' ? 'Test Review' : lifecycle === 'future' ? 'Future' : 'Archived' }
function phaseLabel(phase: LifecyclePhase) { return phase === 'test-review' ? 'Test Review' : phase === 'warmup' ? 'Warmup' : 'Acquisition' }

function App() {
  const [view, setView] = useState<View>('home')
  const [selectedChildId, setSelectedChildId] = useState(() => localStorageGet('weekly-dictation-child') || children[0].id)
  const [state, setState] = useState<AppState>(() => loadState(localStorageGet(APP_STATE_KEY), localStorageGet(LEGACY_ATTEMPTS_KEY)) || createInitialState())
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [showChildMenu, setShowChildMenu] = useState(false); const [showProfiles, setShowProfiles] = useState(false); const [completedSummary, setCompletedSummary] = useState<string | null>(null)
  const selectedChild = children.find((child) => child.id === selectedChildId) || children[0]
  const primaryContext = useMemo(() => getPrimaryDataset(state.datasets, new Date()), [state.datasets])
  const fallbackDataset = useMemo(() => sortDatasetsNewestFirst(state.datasets)[0] || null, [state.datasets])
  const primaryDataset = primaryContext?.dataset || fallbackDataset; const primaryPhase = primaryContext?.phase || 'acquisition'

  useEffect(() => { localStorageSet('weekly-dictation-child', selectedChildId) }, [selectedChildId])
  useEffect(() => { localStorageSet(APP_STATE_KEY, JSON.stringify(state)) }, [state])

  const chooseChild = (childId: string) => { setSelectedChildId(childId); setShowChildMenu(false); setShowProfiles(false); setSession(null); setView('home') }
  const startPractice = useCallback(() => {
    if (!primaryDataset) return
    const warmup = buildWarmupSelection({ datasets: state.datasets, results: state.results, warmupSessions: state.warmupSessions, childId: selectedChild.id })
    setCompletedSummary(null); setSession({ id: createSessionId(), childId: selectedChild.id, grade: selectedChild.grade, primaryDatasetId: primaryDataset.id, primaryPhase, segment: 'warmup', stage: 'warmup-intro', queue: shuffle(warmup.words), warmupQueue: warmup.words, primaryQueue: shuffle(primaryDataset.words), index: 0, startedAt: new Date().toISOString(), warmupAnswers: [], primaryAnswers: [] }); setView('practice')
  }, [primaryDataset, primaryPhase, selectedChild, state.datasets, state.results, state.warmupSessions])
  const exitPractice = () => { setSession(null); setView('home') }
  const beginWarmup = () => setSession((current) => current && current.stage === 'warmup-intro' ? { ...current, stage: 'interstitial', index: 0 } : current)
  const completeInterstitial = () => setSession((current) => current && current.stage === 'interstitial' ? { ...current, stage: 'dictation' } : current)
  const completeDictationWord = () => setSession((current) => {
    if (!current || current.stage !== 'dictation') return current
    if (current.index < current.queue.length - 1) return { ...current, stage: 'interstitial', index: current.index + 1 }
    if (current.segment === 'warmup') return { ...current, stage: 'review', index: 0 }
    return { ...current, stage: 'complete' }
  })
  const startPrimaryReview = () => setSession((current) => current && current.stage === 'complete' ? { ...current, stage: 'review', index: 0 } : current)
  const completeSession = (finished: PracticeSession) => { setState((current) => commitCompletedSession(current, finished)); setCompletedSummary('Practice complete. Your warmup and dataset results are saved.'); setSession(null); setView('home') }
  const answer = (correct: boolean) => setSession((current) => {
    if (!current || current.stage !== 'review') return current
    const response: SessionAnswer = { word: current.queue[current.index], correct, revealMethod: 'timer' }; const isWarmup = current.segment === 'warmup'; const answers = isWarmup ? [...current.warmupAnswers, response] : [...current.primaryAnswers, response]
    if (current.index < current.queue.length - 1) return isWarmup ? { ...current, warmupAnswers: answers, index: current.index + 1 } : { ...current, primaryAnswers: answers, index: current.index + 1 }
    if (isWarmup) return { ...current, segment: 'primary', stage: 'interstitial', queue: current.primaryQueue, index: 0, warmupAnswers: answers }
    const finished = { ...current, primaryAnswers: answers }; completeSession(finished); return null
  })
  const navigate = (nextView: View) => { if (view === 'practice' && nextView !== 'practice') setSession(null); setView(nextView) }

  return <div className="app-shell"><header className="topbar"><button className="brand" onClick={() => navigate('home')} aria-label="Go to home"><span className="brand-mark"><Sparkles size={17} strokeWidth={2.5} /></span><span>weekly<span className="brand-accent">dictation</span></span></button><div className="topbar-actions"><button className="profile-switcher" onClick={() => setShowChildMenu((current) => !current)}><span className={`avatar avatar-${selectedChild.color}`}>{selectedChild.initials}</span><span className="profile-switcher-copy"><small>Practicing as</small>{selectedChild.name}</span><ChevronDown size={16} /></button>{showChildMenu && <div className="child-menu"><p>Switch child</p>{children.map((child) => <button key={child.id} className={child.id === selectedChild.id ? 'selected' : ''} onClick={() => chooseChild(child.id)}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span><strong>{child.name}</strong><small>{child.grade}</small></span>{child.id === selectedChild.id && <Check size={15} />}</button>)}<button className="manage-children" onClick={() => { setShowChildMenu(false); setShowProfiles(true) }}>Manage profiles <ArrowLeft size={14} /></button></div>}</div></header><main className="main-content">{view === 'home' && primaryDataset && <HomeView child={selectedChild} datasets={state.datasets} scores={state.scores} primaryDataset={primaryDataset} primaryPhase={primaryPhase} completedSummary={completedSummary} onStart={startPractice} onHistory={() => setView('history')} onProfiles={() => setShowProfiles(true)} />}{view === 'practice' && session && <PracticeView session={session} datasets={state.datasets} onExit={exitPractice} onReplay={() => session.stage === 'complete' ? speakReviewInstruction() : speakWord(session.queue[session.index], session.segment === 'warmup')} onBeginWarmup={beginWarmup} onInterstitialComplete={completeInterstitial} onDictationComplete={completeDictationWord} onStartReview={startPrimaryReview} onAnswer={answer} />}{view === 'history' && <HistoryView child={selectedChild} datasets={state.datasets} scores={state.scores} legacyCount={state.legacyRecords.length} onBack={() => setView('home')} />}</main>{view !== 'practice' && <nav className="bottom-nav" aria-label="Primary navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><Home size={19} /><span>Practice</span></button><button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><BarChart3 size={19} /><span>Progress</span></button><button onClick={() => setShowProfiles(true)}><Languages size={19} /><span>Profiles</span></button></nav>}{showProfiles && <ProfileModal selectedChildId={selectedChildId} onSelect={chooseChild} onClose={() => setShowProfiles(false)} />}</div>
}

function HomeView({ child, datasets, scores, primaryDataset, primaryPhase, completedSummary, onStart, onHistory, onProfiles }: { child: Child; datasets: Dataset[]; scores: DatasetScore[]; primaryDataset: Dataset; primaryPhase: 'acquisition' | 'test-review'; completedSummary: string | null; onStart: () => void; onHistory: () => void; onProfiles: () => void }) {
  const today = scores.filter((score) => score.childId === child.id && score.sessionDate === localDateKey()).length; const displayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()); const orderedDatasets = sortDatasetsNewestFirst(datasets)
  return <div className="page home-page"><section className="welcome-row"><div><p className="eyebrow">{displayDate}</p><h1>Ready when you are, <em>{child.name}.</em></h1><p className="subhead">Warm up first, then practice the {primaryPhase === 'test-review' ? 'Test Review' : 'Acquisition'} words.</p></div><button className="mini-profile" onClick={onProfiles}><span className={`avatar avatar-${child.color}`}>{child.initials}</span><span>{child.grade}</span><ChevronDown size={15} /></button></section>{completedSummary && <div className="success-banner"><span className="success-icon"><Check size={17} /></span><span><strong>Practice complete!</strong> {completedSummary}</span><button onClick={onHistory}>See progress <ArrowLeft size={14} /></button></div>}<section className="hero-card"><div className="hero-copy"><div className="status-pill"><span className="status-dot" /> {phaseLabel(primaryPhase)} · {primaryDataset.dateRange}</div><h2>Your weekly<br /><span>word practice</span></h2><p>{primaryDataset.words.length} words · required warmup · {primaryDataset.dateRange}</p><button className="primary-button" onClick={onStart}>Start the test <ArrowLeft size={17} /></button></div><div className="hero-illustration" aria-hidden="true"><div className="sun-shape" /><div className="paper-shape"><span>字</span><span>词</span><span>好</span></div><div className="pencil-shape" /><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div></div></section><section className="section-heading"><div><p className="eyebrow">Weekly datasets</p><h2>Every week stays on record</h2></div><button className="text-button" onClick={onHistory}>View progress <ArrowLeft size={15} /></button></section><div className="set-grid">{orderedDatasets.map((dataset, index) => <SetCard key={dataset.id} dataset={dataset} score={latestScore(scores, child.id, dataset.id)} tone={index % 2 === 0 ? 'yellow' : 'lavender'} />)}</div><section className="today-strip"><div className="strip-icon"><Clock3 size={18} /></div><div><strong>{today ? `${today} dataset score${today === 1 ? '' : 's'} recorded today` : 'No dataset scores recorded today'}</strong><span>Scores appear only after the complete relevant dataset is reviewed.</span></div><div className="strip-arrow">→</div></section></div>
}

function SetCard({ dataset, score, tone }: { dataset: Dataset; score: DatasetScore | null; tone: 'yellow' | 'lavender' }) { const lifecycle = datasetLifecycle(dataset, new Date()); return <article className={`set-card set-${tone}`}><div className="set-card-top"><span className="set-label">{lifecycleLabel(lifecycle)}</span><span className="score-badge">{score ? `${score.percent}% · ${phaseLabel(score.phase)}` : 'Not scored'}</span></div><h3>{dataset.dateRange}</h3><p className="set-date">{dataset.description} · {dataset.words.length} words</p><div className="set-footer"><span>{dataset.grade}</span><div className="tiny-progress"><span style={{ width: `${score?.percent || 0}%` }} /></div></div></article> }

function PracticeView({ session, datasets, onExit, onReplay, onBeginWarmup, onInterstitialComplete, onDictationComplete, onStartReview, onAnswer }: { session: PracticeSession; datasets: Dataset[]; onExit: () => void; onReplay: () => void; onBeginWarmup: () => void; onInterstitialComplete: () => void; onDictationComplete: () => void; onStartReview: () => void; onAnswer: (correct: boolean) => void }) {
  const term = session.queue[session.index]; const dataset = datasets.find((item) => item.id === term?.datasetId); const [seconds, setSeconds] = useState(20); const advanceGuard = useRef<string | null>(null); const isWarmup = session.segment === 'warmup'; const timerSeconds = timerSecondsFor(session.segment, session.primaryPhase); const stageKey = `${session.id}:${session.segment}:${session.stage}:${session.index}`
  useEffect(() => { advanceGuard.current = null }, [stageKey])
  useEffect(() => { if (session.stage === 'warmup-intro') return; if (session.stage === 'interstitial') { const transition = window.setTimeout(onInterstitialComplete, 1500); return () => window.clearTimeout(transition) } if (session.stage === 'complete') { const stop = speakReviewInstruction(); return () => stop?.() } setSeconds(session.stage === 'dictation' ? timerSeconds : 0); const stop = speakWord(term, isWarmup); return () => stop?.() }, [stageKey, session.stage, term, isWarmup, timerSeconds, onInterstitialComplete])
  useEffect(() => { if (session.stage !== 'dictation') return; const timer = window.setInterval(() => setSeconds((value) => { if (value <= 1) { window.clearInterval(timer); if (advanceGuard.current === stageKey) return 0; advanceGuard.current = stageKey; onDictationComplete(); return 0 } return value - 1 }), 1000); return () => window.clearInterval(timer) }, [session.stage, stageKey, onDictationComplete])
  const progress = session.segment === 'warmup' ? Math.round((session.index / Math.max(session.queue.length, 1)) * 25) : session.stage === 'complete' ? 50 : 50 + Math.round((session.index / Math.max(session.queue.length, 1)) * 50); const count = session.stage === 'complete' ? 'Test complete' : session.segment === 'warmup' ? `Warmup ${session.index + 1}` : `Word ${session.index + 1}`
  return <div className="practice-page"><div className="practice-top"><button className="back-button" onClick={onExit}><X size={18} /> Exit practice</button><span className="practice-count">{count}<span>{session.stage === 'dictation' || session.stage === 'review' ? ` of ${session.queue.length}` : ''}</span></span></div><div className="practice-progress"><span style={{ width: `${progress}%` }} /></div><section className={`prompt-card ${session.stage === 'warmup-intro' || session.stage === 'interstitial' || session.stage === 'complete' ? 'interstitial-card' : ''}`}>
    {session.stage === 'warmup-intro' && <><div className="interstitial-mark"><Sparkles size={25} /></div><p className="eyebrow">Required before every session</p><h1>Warm up</h1><p className="practice-helper">Let’s get ready to warm up.</p><button className="primary-button" onClick={onBeginWarmup}>Begin warmup <ArrowLeft size={17} /></button></>}
    {session.stage === 'interstitial' && <><div className="interstitial-mark"><Volume2 size={25} /></div><p className="eyebrow">{isWarmup ? 'Warm up' : phaseLabel(session.primaryPhase)}</p><h1>{isWarmup ? `Warmup word ${session.index + 1}` : `Word ${session.index + 1}`}</h1><p className="practice-helper">Listen carefully, then write what you hear.</p></>}
    {session.stage === 'complete' && <><div className="complete-mark"><Check size={27} /></div><p className="eyebrow">Dictation finished · {dataset?.dateRange}</p><h1>Test complete</h1><p className="review-instruction">{REVIEW_INSTRUCTION}</p><button className="primary-button review-start-button" onClick={onStartReview}>Start review <ArrowLeft size={17} /></button><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay instructions</button></>}
    {session.stage === 'dictation' && <><div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup' : phaseLabel(session.primaryPhase)} · {dataset?.dateRange}</span><span className="timer"><Clock3 size={15} /> 00:{String(seconds).padStart(2, '0')}</span></div><div className="speaker-orb"><div className="orb-ring" /><Volume2 size={32} strokeWidth={1.7} /></div><h1>Listen, then write<br /><span>what you hear.</span></h1><p className="practice-helper">Write the word on paper. The answer will be reviewed after the complete set is heard.</p><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay sequence</button><p className="dictation-status">The next word begins when the timer ends.</p></>}
    {session.stage === 'review' && <><div className="prompt-meta"><span className={`set-chip chip-${isWarmup ? 'warmup' : session.primaryPhase}`}>{isWarmup ? 'Warmup review' : `${phaseLabel(session.primaryPhase)} review`} · {dataset?.dateRange}</span><span className="review-label">Check your paper</span></div><div className="review-heading"><p className="answer-label">The word was</p><div className="answer-word">{term.text}</div></div><button className="replay-button" onClick={onReplay}><RotateCcw size={16} /> Replay word sequence</button><div className="context-box"><span>In a sentence</span><p>{term.sentence}</p></div><div className="answer-actions"><button className="wrong-button" onClick={() => onAnswer(false)}><X size={17} /> I got it wrong</button><button className="right-button" onClick={() => onAnswer(true)}><Check size={17} /> I got it right</button></div><p className="answer-note">Be honest with yourself — that’s how you grow.</p></>}
  </section><p className="practice-footnote"><Headphones size={14} /> Mandarin audio plays automatically · You can replay it anytime</p></div>
}

function HistoryView({ child, datasets, scores, legacyCount, onBack }: { child: Child; datasets: Dataset[]; scores: DatasetScore[]; legacyCount: number; onBack: () => void }) { const ordered = sortDatasetsNewestFirst(datasets); return <div className="page history-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to practice</button><div className="history-heading"><div><p className="eyebrow">Progress for {child.name}</p><h1>Small steps,<br /><em>real progress.</em></h1></div><div className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</div></div>{legacyCount > 0 && <div className="history-note"><History size={17} /><span>{legacyCount} legacy result{legacyCount === 1 ? '' : 's'} preserved without an invented date range.</span></div>}{ordered.map((dataset) => <DatasetGraph key={dataset.id} dataset={dataset} scores={scores.filter((score) => score.childId === child.id && score.datasetId === dataset.id)} />)}</div> }
function DatasetGraph({ dataset, scores }: { dataset: Dataset; scores: DatasetScore[] }) { const orderedScores = [...scores].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)); return <section className="dataset-graph progress-card"><div className="progress-card-heading"><div><span className="eyebrow">{dataset.dateRange} · {dataset.grade}</span><h2>{dataset.description}</h2></div><BarChart3 size={22} /></div>{orderedScores.length === 0 ? <p className="empty-graph">No complete dataset review has been scored yet.</p> : <div className="score-list">{orderedScores.map((score) => <div className="score-row" key={score.id}><div className={`score-dot dot-${score.phase}`} /><div className="score-row-copy"><strong>{score.sessionDate}</strong><span>{phaseLabel(score.phase)} · {score.correct}/{score.wordCount} correct</span></div><div className="score-bar"><span style={{ width: `${score.percent}%` }} /></div><strong className="score-number">{score.percent}%</strong></div>)}</div>}</section> }
function ProfileModal({ selectedChildId, onSelect, onClose }: { selectedChildId: string; onSelect: (id: string) => void; onClose: () => void }) { return <div className="modal-backdrop" onClick={onClose}><div className="profile-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Family profiles</p><h2>Who is practicing?</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="profile-grid">{children.map((child) => <button key={child.id} className={`profile-card ${child.id === selectedChildId ? 'active' : ''}`} onClick={() => { onSelect(child.id); onClose() }}><span className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</span><strong>{child.name}</strong><span>{child.grade}</span>{child.id === selectedChildId && <span className="profile-check"><Check size={14} /></span>}</button>)}</div><button className="modal-secondary" onClick={onClose}><LogOut size={15} /> Parent settings coming in Stage 2</button></div></div> }

export default App
