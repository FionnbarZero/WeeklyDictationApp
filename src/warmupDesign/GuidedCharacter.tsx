import { useState } from 'react'
import { teacherProfileForGrade } from '../strokeTeacherPrototype/gradeProfiles.ts'
import { strokeFeedback } from '../strokeTeacherPrototype/model.ts'
import type { StrokeOrderGameRound, StrokePoint } from '../strokeTeacherPrototype/original/contracts.ts'
import { DrawingTools, StrokePad } from '../strokeTeacherPrototype/original/StrokeUI.tsx'

export function GuidedCharacter({
  round,
  grade,
  paused,
  onComplete,
}: {
  round: StrokeOrderGameRound
  grade: string
  paused: boolean
  onComplete: () => void
}) {
  const [drawing, setDrawing] = useState<StrokePoint[][]>([])
  const [message, setMessage] = useState('Start at 1. Follow the strokes in order.')
  const [hint, setHint] = useState(false)
  const [animation, setAnimation] = useState(0)
  const [reset, setReset] = useState(0)
  const profile = teacherProfileForGrade(grade)
  const complete = drawing.length === round.strokes.length
  return (
    <div className="lg-stroke-workspace warmup-guide">
      <StrokePad
        round={round}
        strokes={drawing}
        onStrokesChange={paused ? undefined : setDrawing}
        showGuide
        animationKey={animation}
        animationStepSeconds={animation ? profile.animationStepSeconds : 0}
        resetKey={reset + Number(paused)}
        label="Trace the numbered strokes"
        hintStrokeIndex={hint && !complete ? drawing.length : undefined}
        validateStroke={(stroke, index) =>
          !paused &&
          index < round.strokes.length &&
          strokeFeedback(stroke, round.strokes, index, profile.assessment) === null
        }
        onStrokeAccepted={() => {
          setHint(false)
          setMessage(
            drawing.length + 1 === round.strokes.length ? 'Character complete!' : `Next: stroke ${drawing.length + 2}.`,
          )
        }}
        onStrokeRejected={(stroke) => {
          if (complete) return
          setHint(true)
          setMessage(
            strokeFeedback(stroke, round.strokes, drawing.length, profile.assessment) || 'Try this stroke again.',
          )
        }}
      />
      <div className="lg-stroke-actions">
        <p className={`lg-stroke-status${hint ? ' is-error' : ''}`} role="status">
          <strong>
            {drawing.length} / {round.strokes.length} strokes
          </strong>
          <span>{message}</span>
        </p>
        <DrawingTools
          drawing={drawing}
          setDrawing={(next) => {
            if (!paused) setDrawing(next)
          }}
          onReset={() => {
            setHint(false)
            setMessage('Follow the next numbered stroke.')
            setReset((n) => n + 1)
          }}
        />
        <button type="button" className="lg-stroke-replay" disabled={paused} onClick={() => setAnimation((n) => n + 1)}>
          Replay strokes
        </button>
        <button type="button" className="lg-primary" disabled={!complete || paused} onClick={onComplete}>
          {(round.wordCharacterIndex ?? 0) + 1 < (round.wordCharacterCount ?? 1)
            ? 'Next character'
            : 'Write the whole word'}
        </button>
      </div>
    </div>
  )
}
