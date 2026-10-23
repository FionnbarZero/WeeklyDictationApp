import type { WritingProgress } from '../application/writingAcquisition/contracts.ts'
import { writingCharacterGuides, writingTeacherStepCount } from '../application/writingAcquisition/lesson.ts'
import { teachingPosition } from '../application/writingAcquisition/progress.ts'
import { PracticeView, type PracticeViewProps } from '../practice/PracticeView.tsx'
import { FIVE_STEP_SEQUENCE, SIX_STEP_SEQUENCE } from '../strokeTeacherPrototype/model.ts'
import { StrokeTeacher } from '../strokeTeacherPrototype/StrokeTeacher.tsx'
import { StrokeTeacherRecovery } from '../strokeTeacherPrototype/StrokeTeacherRecovery.tsx'
import '../strokeTeacherPrototype/preview.css'
import { useEffect } from 'react'
import { hasFamilyActivityOwner } from '../activity/activityLifecycle.ts'
import { regressionPreview } from '../regressionPreview/policy.ts'
import { SlayWritingAcquisition } from './SlayWritingAcquisition.tsx'
import '../regressionPreview/styles.css'

export default function Grade2WritingPractice({
  progress,
  onTeachingStep,
  ...props
}: PracticeViewProps & {
  progress?: WritingProgress
  onTeachingStep: (step: number) => Promise<void>
}) {
  const writingStage = props.session.segment === 'primary' && props.session.primaryPhase === 'acquisition'
  const fullWritingFrame = writingStage || regressionPreview
  useEffect(() => {
    if (!fullWritingFrame || !hasFamilyActivityOwner()) return
    const frame = window.frameElement!
    frame.setAttribute('data-writing-stage', 'true')
    return () => frame.removeAttribute('data-writing-stage')
  }, [fullWritingFrame])
  const position = progress && props.session.segment === 'primary' ? teachingPosition(progress) : null
  const target = position && progress?.lesson.targets[position.targetIndex]
  const teacher =
    position && target ? (
      <div className="st-original-stage">
        <main className="st-original-content">
          <StrokeTeacher
            grade={props.session.grade}
            key={`${props.session.id}:${position.targetId}:${position.characterIndex}`}
            targetId={target.id}
            character={[...target.text][position.characterIndex]}
            characterIndex={position.characterIndex}
            word={target.text}
            pinyin={target.pinyin}
            meaning={target.meaning}
            strokes={writingCharacterGuides(target.text)[position.characterIndex]}
            initialStep={position.step}
            sequence={
              progress && writingTeacherStepCount(progress.lesson) === 5 ? FIVE_STEP_SEQUENCE : SIX_STEP_SEQUENCE
            }
            onStepComplete={onTeachingStep}
            onComplete={() => undefined}
            onExit={props.onExit}
          />
        </main>
      </div>
    ) : null
  return (
    <div
      className="grade2-writing-pilot"
      data-report-screen={position ? 'Writing stroke teacher' : 'Writing acquisition'}
    >
      {position && target ? (
        import.meta.env.VITE_W1_CURRICULUM_PREVIEW === 'true' && props.session.grade === 'Grade 2' ? (
          <StrokeTeacherRecovery
            key={`${props.session.id}:${position.targetId}:${position.characterIndex}`}
            step={position.step}
            onExit={props.onExit}
          >
            {teacher}
          </StrokeTeacherRecovery>
        ) : (
          teacher
        )
      ) : writingStage ? (
        <SlayWritingAcquisition {...props} />
      ) : (
        <PracticeView {...props} />
      )}
    </div>
  )
}
