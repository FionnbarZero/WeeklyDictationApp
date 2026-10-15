import { PracticeView, type PracticeViewProps } from '../practice/PracticeView.tsx'
import { LearningGameShell } from '../strokeTeacherPrototype/original/GameShell.tsx'
// Reuse the frozen, owner-approved comparison styling verbatim.
import './slayAcquisitionMockup.css'
import './slayWritingIntegration.css'

export function SlayWritingAcquisition(props: PracticeViewProps) {
  const flow = props.session.acquisition
  const count = props.session.primaryQueue.length
  return (
    <div id="slay-acquisition-root" className="slay-writing-integration">
      <header className="slay-comparison-banner">
        <strong>Grade 2 · Learn to Write</strong>
      </header>
      <LearningGameShell
        gameId="stroke-order-slay-grade-2"
        title="Writing Dojo · Slay style"
        eyebrow="Grade 2 writing acquisition"
        progress={`${Math.min((flow?.targetIndex || 0) + 1, count)}/${count} words`}
        onExit={props.onExit}
      >
        <PracticeView {...props} />
      </LearningGameShell>
    </div>
  )
}
