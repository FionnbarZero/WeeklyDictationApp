import { useState, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import type {
  ContextGameRound,
  LearningGameAttempt,
  LearningGameBaseProps,
  LearningGameId,
  PlayLearningAudio,
  SelectionGameRound,
} from './contracts.ts'
import { summarizeLearningGame, validContextRounds, validSelectionRounds } from './model.ts'
import {
  LearningGameComplete,
  LearningGameEmpty,
  LearningGameShell,
} from './GameShell.tsx'

type SelectionGameProps = LearningGameBaseProps & {
  readonly rounds: readonly SelectionGameRound[]
  readonly playAudio?: PlayLearningAudio
}

type SelectionRunnerProps = SelectionGameProps & {
  readonly gameId: Extract<LearningGameId, 'target-blast' | 'lily-pad-path' | 'context-gap-dash'>
  readonly defaultTitle: string
  readonly defaultEyebrow: string
  readonly renderCue: (
    round: SelectionGameRound,
    index: number,
    total: number,
    selectedChoiceId: string | null,
  ) => ReactNode
  readonly choiceClassName?: string
  readonly completionMessage: string
  readonly validateRounds?: (rounds: readonly SelectionGameRound[]) => boolean
}

function SelectionRunner({
  gameId,
  defaultTitle,
  defaultEyebrow,
  renderCue,
  choiceClassName = '',
  completionMessage,
  validateRounds = validSelectionRounds,
  rounds,
  playAudio,
  title,
  eyebrow,
  onExit,
  onAttempt,
  onComplete,
}: SelectionRunnerProps) {
  const [index, setIndex] = useState(0)
  const [attempts, setAttempts] = useState<readonly LearningGameAttempt[]>([])
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const round = rounds[index]
  const valid = validateRounds(rounds)
  const complete = valid && index >= rounds.length

  function choose(choiceId: string) {
    if (!round || selectedChoiceId) return
    const correct = choiceId === round.correctChoiceId
    const attempt: LearningGameAttempt = {
      gameId,
      promptId: round.id,
      targetId: round.targetId,
      correct,
      response: choiceId,
      assessmentMode: 'automatic',
    }
    setSelectedChoiceId(choiceId)
    setAttempts((current) => [...current, attempt])
    const nextStreak = correct ? streak + 1 : 0
    setStreak(nextStreak)
    setBestStreak((current) => Math.max(current, nextStreak))
    onAttempt?.(attempt)
  }

  function advance() {
    setIndex((current) => current + 1)
    setSelectedChoiceId(null)
  }

  const summary = summarizeLearningGame(gameId, attempts)
  return <LearningGameShell
    title={title || defaultTitle}
    eyebrow={eyebrow || defaultEyebrow}
    progress={`${Math.min(index + (selectedChoiceId ? 1 : 0), rounds.length)}/${rounds.length}`}
    onExit={onExit}
  >
    {!valid ? <LearningGameEmpty onExit={onExit} /> : complete ? <LearningGameComplete
      summary={summary}
      message={completionMessage}
      onDone={() => onComplete(summary)}
    /> : round ? <section className={`lg-card ${choiceClassName}`}>
      {renderCue(round, index, rounds.length, selectedChoiceId)}
      {round.audioText && playAudio && <button className="lg-audio" type="button" onClick={() => void playAudio(round.audioText!)}><Volume2 size={20} /> Hear the prompt</button>}
      <div className="lg-stat-row">
        <span><strong>{streak}</strong> streak</span>
        <span><strong>{bestStreak}</strong> best</span>
      </div>
      <div className="lg-choice-grid" role="group" aria-label="Answer choices">
        {round.choices.map((choice) => {
          const selected = selectedChoiceId === choice.id
          const answer = Boolean(selectedChoiceId) && round.correctChoiceId === choice.id
          return <button
            key={choice.id}
            type="button"
            className={`lg-choice${selected ? choice.id === round.correctChoiceId ? ' is-correct' : ' is-incorrect' : ''}${answer ? ' is-answer' : ''}`}
            disabled={Boolean(selectedChoiceId)}
            aria-label={choice.accessibleLabel || choice.label}
            onClick={() => choose(choice.id)}
          >{choice.label}</button>
        })}
      </div>
      {selectedChoiceId && <div className={`lg-feedback is-${selectedChoiceId === round.correctChoiceId ? 'correct' : 'incorrect'}`} role="status">
        <strong>{selectedChoiceId === round.correctChoiceId ? 'Correct!' : 'Good try—the answer is highlighted.'}</strong>
        <button className="lg-primary" type="button" onClick={advance}>{index + 1 === rounds.length ? 'See result' : 'Next'}</button>
      </div>}
    </section> : null}
  </LearningGameShell>
}

export function TargetBlast(props: SelectionGameProps) {
  return <SelectionRunner
    {...props}
    gameId="target-blast"
    defaultTitle="Target Blast"
    defaultEyebrow="Receptive challenge"
    choiceClassName="lg-blast-card"
    completionMessage="You found the correct targets."
    renderCue={(round, index, total) => <>
      <p className="lg-round-label">Target {index + 1} of {total}</p>
      <div className="lg-game-mark" aria-hidden="true">☄️</div>
      <h2>{round.cueText || 'Blast the correct answer'}</h2>
    </>}
  />
}

export function LilyPadPath(props: SelectionGameProps) {
  return <SelectionRunner
    {...props}
    gameId="lily-pad-path"
    defaultTitle="Lily-Pad Path"
    defaultEyebrow="Receptive challenge"
    choiceClassName="lg-lily-card"
    completionMessage="You crossed the whole path."
    renderCue={(round, index, total) => <>
      <p className="lg-round-label">Step {index + 1} of {total}</p>
      <div className="lg-path" aria-label={`${index} of ${total} path steps complete`}>
        {Array.from({ length: total }, (_, step) => <span key={step} className={step < index ? 'is-complete' : step === index ? 'is-current' : ''}>●</span>)}
      </div>
      <div className="lg-game-mark" aria-hidden="true">🐸</div>
      <h2>{round.cueText || 'Choose the next safe lily pad'}</h2>
    </>}
  />
}

export function ContextGapDash({ rounds, ...props }: Omit<SelectionGameProps, 'rounds'> & { readonly rounds: readonly ContextGameRound[] }) {
  return <SelectionRunner
    {...props}
    rounds={rounds}
    gameId="context-gap-dash"
    defaultTitle="Context Gap Dash"
    defaultEyebrow="Tier 2 · Reading"
    choiceClassName="lg-context-card"
    completionMessage="You completed every approved sentence."
    validateRounds={(values) => validContextRounds(values as readonly ContextGameRound[])}
    renderCue={(round, _index, _total, selectedChoiceId) => {
      const context = round as ContextGameRound
      const selected = context.choices.find((choice) => choice.id === selectedChoiceId)
      return <>
        <p className="lg-round-label">Read the sentence and fill the gap</p>
        <p className="lg-context-sentence" lang="zh-Hans">{context.sentenceBefore}<span aria-label={selected ? `selected word ${selected.label}` : 'missing word'}>{selected?.label || '____'}</span>{context.sentenceAfter}</p>
      </>
    }}
  />
}
