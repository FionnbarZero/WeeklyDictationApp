import { PracticeView, type PracticeViewProps } from '../practice/PracticeView.tsx'
import type { WritingProgress } from '../application/writingAcquisition/contracts.ts'
import { teachingPosition } from '../application/writingAcquisition/progress.ts'
import { writingCharacterGuides, writingTeacherStepCount } from '../application/writingAcquisition/lesson.ts'
import { StrokeTeacher } from '../strokeTeacherPrototype/StrokeTeacher.tsx'
import { FIVE_STEP_SEQUENCE, SIX_STEP_SEQUENCE } from '../strokeTeacherPrototype/model.ts'
import '../strokeTeacherPrototype/preview.css'

export default function Grade2WritingPractice({
  progress,
  onTeachingStep,
  ...props
}: PracticeViewProps & {
  progress?: WritingProgress
  onTeachingStep: (step: number) => Promise<void>
}) {
  const position = progress && props.session.segment === 'primary' ? teachingPosition(progress) : null
  const target = position && progress?.lesson.targets[position.targetIndex]
  return (
    <div
      className="grade2-writing-pilot"
      data-report-screen={position ? 'Writing stroke teacher' : 'Writing acquisition'}
    >
      {position && target ? (
        <div className="st-original-stage">
          <main className="st-original-content">
            <StrokeTeacher
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
      ) : (
        <PracticeView {...props} />
      )}
    </div>
  )
}
