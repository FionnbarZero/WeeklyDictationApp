import { PracticeView, type PracticeViewProps } from '../practice/PracticeView.tsx'
import { teacherProfileForGrade } from '../strokeTeacherPrototype/gradeProfiles.ts'
import { LearningGameShell } from '../strokeTeacherPrototype/original/GameShell.tsx'
// Reuse the frozen, owner-approved comparison styling verbatim.
import './slayAcquisitionMockup.css'
import './slayWritingIntegration.css'

export function SlayWritingAcquisition(props: PracticeViewProps) {
  const flow = props.session.acquisition
  const grade = props.session.grade
  const count = props.session.primaryQueue.length
  return (
    <div id="slay-acquisition-root" className="slay-writing-integration">
      <header className="slay-comparison-banner">
        <strong>{grade} · Learn to Write</strong>
      </header>
      <LearningGameShell
        gameId={`stroke-order-slay-${teacherProfileForGrade(grade).id}`}
        title="Writing Dojo · Slay style"
        eyebrow={`${grade} writing acquisition`}
        progress={`${Math.min((flow?.targetIndex || 0) + 1, count)}/${count} words`}
        onExit={props.onExit}
      >
        <PracticeView {...props} />
      </LearningGameShell>
    </div>
  )
}
