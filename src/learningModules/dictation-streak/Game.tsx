import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Headphones, PencilLine } from 'lucide-react'
import type { LearningGameBaseProps, PlayLearningAudio, ProductionGameRound } from './runtime/contracts'
import { ProductionRunner } from './runtime/ProductionGameShared'
import { findCharacterCorrections, isCorrectCharacterAt, isExactPinyin, isPinyinPrefix, normalizePinyin } from './runtime/pinyin'
import { validDictationRound } from './runtime/model'

const HANZI_CHARACTER = /[\u3400-\u9fff]/u

function shuffledStepCandidates(round: ProductionGameRound) {
  const targetCharacters = Array.from(round.targetText.trim())
  return (round.pinyinSteps || []).map((step, stepIndex) => {
    const candidates = Array.from(new Set([...step.candidates, targetCharacters[stepIndex]].filter(Boolean)))
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]]
    }
    return candidates
  })
}

function WrongCharacterCard({ response, target }: {
  readonly response: string
  readonly target: string
}) {
  const corrections = findCharacterCorrections(response, target)
  return <div className="lg-dictation-wrong-feedback" role="alert" aria-live="assertive">
    <div className="lg-dictation-wrong-card">
      <span>Wrong {corrections.length === 1 ? 'character' : 'characters'}</span>
      <div className="lg-character-corrections">
        {corrections.map((correction) => <div className="lg-character-correction" key={correction.index}>
          <span><small>You chose</small><s lang="zh-Hans">{correction.chosen}</s></span>
          <i aria-hidden="true">→</i>
          <span className="is-correct"><small>Correct character</small><strong lang="zh-Hans">{correction.correct}</strong></span>
        </div>)}
      </div>
      <b>Study the correction, then try the word again.</b>
    </div>
  </div>
}

function DictationConsole({ round, playAudio, streak, onAssess }: {
  readonly round: ProductionGameRound
  readonly playAudio: PlayLearningAudio
  readonly streak: number
  readonly onAssess: (correct: boolean, response?: string) => void
}) {
  const [answer, setAnswer] = useState('')
  const [audioError, setAudioError] = useState(false)
  const [spellingMessage, setSpellingMessage] = useState('')
  const [correctionPinyin, setCorrectionPinyin] = useState('')
  const [characterCorrection, setCharacterCorrection] = useState<{ readonly chosen: string; readonly correct: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const spellingErrorsRef = useRef(0)
  const composingRef = useRef(false)
  const messageTimerRef = useRef<number | undefined>(undefined)
  const restartTimerRef = useRef<number | undefined>(undefined)
  const stepCandidates = useMemo(() => shuffledStepCandidates(round), [round])
  const guidedPinyin = Boolean(round.pinyinSteps)
  const selectedCharacters = Array.from(answer).filter((character) => HANZI_CHARACTER.test(character)).join('')
  const pinyinInput = Array.from(answer).filter((character) => !HANZI_CHARACTER.test(character)).join('')
  const currentStepIndex = Array.from(selectedCharacters).length
  const currentStep = round.pinyinSteps?.[currentStepIndex]
  const candidates = stepCandidates[currentStepIndex] || []
  const showCandidates = Boolean(currentStep && isExactPinyin(pinyinInput, currentStep.pinyin))
  const wordComplete = guidedPinyin
    ? currentStepIndex === round.pinyinSteps?.length && !pinyinInput.trim()
    : selectedCharacters.length === Array.from(round.targetText.trim()).length && !pinyinInput.trim()

  async function speakWord() {
    setAudioError(false)
    try {
      await playAudio(round.audioText || round.targetText)
    } catch {
      setAudioError(true)
    }
  }

  useEffect(() => {
    let active = true
    setAudioError(false)
    Promise.resolve(playAudio(round.audioText || round.targetText)).catch(() => {
      if (active) setAudioError(true)
    })
    return () => { active = false }
  }, [playAudio, round.audioText, round.id, round.targetText])

  useEffect(() => () => {
    if (messageTimerRef.current !== undefined) window.clearTimeout(messageTimerRef.current)
    if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current)
  }, [])

  function speakFeedback(message: string) {
    try {
      void Promise.resolve(playAudio(message, 'en-US')).catch(() => undefined)
    } catch {
      // Spoken coaching is helpful, but it must never trap the learner.
    }
  }

  function focusAtEnd() {
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      input?.focus()
      input?.setSelectionRange(input.value.length, input.value.length)
    })
  }

  function restartTrial() {
    setAnswer('')
    setCorrectionPinyin('')
    setCharacterCorrection(null)
    setSpellingMessage('')
    spellingErrorsRef.current = 0
    try {
      void Promise.resolve(playAudio(round.audioText || round.targetText)).catch(() => undefined)
    } catch {
      // The typing trial can continue if replay is unavailable.
    }
    focusAtEnd()
  }

  function handleSpellingError(stepPinyin: string) {
    spellingErrorsRef.current += 1
    setAnswer(selectedCharacters)
    if (messageTimerRef.current !== undefined) window.clearTimeout(messageTimerRef.current)

    if (spellingErrorsRef.current === 1) {
      setSpellingMessage('Uh oh! Check your spelling!')
      speakFeedback('Uh oh! Check your spelling!')
      messageTimerRef.current = window.setTimeout(() => setSpellingMessage(''), 1800)
      focusAtEnd()
      return
    }

    setSpellingMessage('')
    setCorrectionPinyin(stepPinyin)
    speakFeedback('Try again!')
    restartTimerRef.current = window.setTimeout(restartTrial, 2300)
  }

  function updateAnswer(nextAnswer: string) {
    setAnswer(nextAnswer)
    if (composingRef.current || correctionPinyin || characterCorrection) return
    if (!guidedPinyin) return
    const nextSelectedCharacters = Array.from(nextAnswer).filter((character) => HANZI_CHARACTER.test(character)).join('')
    const nextPinyinInput = Array.from(nextAnswer).filter((character) => !HANZI_CHARACTER.test(character)).join('')
    const nextStep = round.pinyinSteps?.[Array.from(nextSelectedCharacters).length]
    if (nextPinyinInput && nextStep && !isPinyinPrefix(nextPinyinInput, nextStep.pinyin)) {
      handleSpellingError(nextStep.pinyin)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const response = answer.trim()
    if (!response || !wordComplete) return
    onAssess(response === round.targetText.trim(), response)
  }

  function selectCandidate(candidate: string) {
    const correctCharacter = Array.from(round.targetText.trim())[currentStepIndex]
    if (correctCharacter && !isCorrectCharacterAt(candidate, round.targetText, currentStepIndex)) {
      setAnswer(selectedCharacters)
      setSpellingMessage('')
      setCharacterCorrection({ chosen: candidate, correct: correctCharacter })
      speakFeedback('Wrong character. Try again!')
      restartTimerRef.current = window.setTimeout(restartTrial, 2300)
      return
    }
    setAnswer(selectedCharacters + candidate)
    setSpellingMessage('')
    focusAtEnd()
  }

  return <form className="lg-dictation-console" onSubmit={submit}>
    <div className="lg-sonic-display" aria-hidden="true">
      <i /><i /><i /><i /><i /><i /><i /><i /><i />
      <span>{streak ? `${streak}×` : 'GO'}</span>
    </div>
    <p className="lg-kicker">Incoming transmission</p>
    <h2>{round.instruction || 'Hear it. Type the Pinyin. Choose the characters.'}</h2>
    <button className="lg-audio" type="button" onClick={() => void speakWord()}><Headphones size={20} /> Replay transmission</button>
    {audioError && <p className="lg-audio-error" role="alert">The word could not play. Press Replay transmission to try again.</p>}
    <label className="lg-answer-terminal">
      <span>{guidedPinyin ? 'Type Pinyin, then choose the characters' : 'Type the Chinese characters'}</span>
      <input
        ref={inputRef}
        value={answer}
        onChange={(event) => updateAnswer(event.target.value)}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={(event) => {
          composingRef.current = false
          updateAnswer(event.currentTarget.value)
        }}
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        lang="zh-Hans"
        placeholder={guidedPinyin ? 'Start typing Pinyin' : 'Use your Chinese keyboard'}
        disabled={Boolean(correctionPinyin || characterCorrection)}
      />
      <i aria-hidden="true" />
    </label>
    {showCandidates && <div className="lg-pinyin-candidates" role="listbox" aria-label={`Chinese candidates for character ${currentStepIndex + 1}`}>
      <span>Choose character {currentStepIndex + 1} of {round.pinyinSteps?.length}</span>
      <div>{candidates.map((candidate) => <button key={candidate} type="button" role="option" aria-selected={answer === candidate} onClick={() => selectCandidate(candidate)}>{candidate}</button>)}</div>
    </div>}
    {spellingMessage && <p className="lg-spelling-alert" role="alert">{spellingMessage}</p>}
    {!wordComplete && <p className="lg-pinyin-hint">{guidedPinyin
      ? currentStepIndex
        ? `Character ${currentStepIndex} selected. Type the next Pinyin syllable.`
        : 'Type the first Pinyin syllable. Choose one character at a time.'
      : 'Use a Chinese keyboard to enter the complete word.'}</p>}
    {wordComplete && <p className="lg-pinyin-hint is-complete">Word assembled. Check the characters when you are ready.</p>}
    <button className="lg-primary lg-launch-answer" type="submit" disabled={!wordComplete}><PencilLine size={18} /> Check characters</button>
    {correctionPinyin && <div className="lg-pinyin-correction-backdrop" role="alert" aria-live="assertive">
      <div className="lg-pinyin-correction-card">
        <span>Correct Pinyin</span>
        <strong lang="zh-Latn-pinyin">{correctionPinyin}</strong>
        <small>{normalizePinyin(correctionPinyin)}</small>
        <b>Try again</b>
      </div>
    </div>}
    {characterCorrection && <div className="lg-pinyin-correction-backdrop" role="alert" aria-live="assertive">
      <div className="lg-pinyin-correction-card lg-character-correction-card">
        <span>Wrong character</span>
        <strong lang="zh-Hans">{characterCorrection.correct}</strong>
        <small>Correct character</small>
        <b>Try again</b>
      </div>
    </div>}
  </form>
}

export function DictationStreak({
  rounds,
  playAudio,
  ...props
}: LearningGameBaseProps & {
  readonly rounds: readonly ProductionGameRound[]
  readonly playAudio: PlayLearningAudio
}) {
  return <ProductionRunner
    {...props}
    rounds={rounds}
    playAudio={playAudio}
    gameId="dictation-streak"
    defaultTitle="Dictation Streak"
    defaultEyebrow="Tier 1 · Writing"
    completionMessage="Every writing target is complete."
    validateRound={validDictationRound}
    invalidContentMessage="Each guided Dictation prompt needs one valid Pinyin step per Chinese character. Prompts without Pinyin steps remain available for direct Chinese-keyboard entry."
    feedbackAnswer={(round) => <span className="lg-dictation-answer-key"><b lang="zh-Hans">{round.targetText}</b>{round.pinyinText && <><i aria-hidden="true">·</i><span lang="zh-Latn-pinyin">{round.pinyinText}</span></>}</span>}
    incorrectFeedback={(round, response) => <WrongCharacterCard response={response} target={round.targetText} />}
    incorrectFeedbackDuration={2800}
    prompt={(round, controls) => <DictationConsole
      round={round}
      playAudio={controls.playAudio!}
      streak={controls.streak}
      onAssess={controls.assess}
    />}
  />
}
