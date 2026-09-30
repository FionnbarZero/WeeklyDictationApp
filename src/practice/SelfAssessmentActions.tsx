import { Check, X } from 'lucide-react'

export type SelfAssessmentActionsProps = {
  onIncorrect: () => void
  onCorrect: () => void
  incorrectLabel?: string
  correctLabel?: string
  disabled?: boolean
}

export function SelfAssessmentActions({
  onIncorrect,
  onCorrect,
  incorrectLabel = 'I got it wrong',
  correctLabel = 'I got it right',
  disabled = false,
}: SelfAssessmentActionsProps) {
  return <div className="answer-actions">
    <button className="wrong-button" type="button" disabled={disabled} onClick={onIncorrect}>
      <X size={17} /> {incorrectLabel}
    </button>
    <button className="right-button" type="button" disabled={disabled} onClick={onCorrect}>
      <Check size={17} /> {correctLabel}
    </button>
  </div>
}
