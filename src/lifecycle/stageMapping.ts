import type { CurriculumStage, PracticePhase } from './contracts.ts'

export function practicePhaseForStage(stage: CurriculumStage): PracticePhase | null {
  if (stage.kind === 'acquisition') return 'acquisition'
  if (stage.kind === 'test-review') return 'test-review'
  return null
}

export function curriculumStageLabel(stage: CurriculumStage) {
  if (stage.kind === 'test-review') return `Test Review ${stage.cycle}`
  if (stage.kind === 'no-instruction') return 'Writing Workshop'
  if (stage.kind === 'mastery') return 'Mastered'
  if (stage.kind === 'future') return 'Future'
  return 'Acquisition'
}
