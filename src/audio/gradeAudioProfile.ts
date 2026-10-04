export type GradeAudioProfile = {
  readonly grade: 'Kindergarten' | 'Grade 2' | 'Grade 5'
  readonly dictationRate: number
  readonly readingRate: number
  readonly masteryRate: number
  readonly instructionRate: number
  readonly segmentGapMs: number
}

const profiles: Readonly<Record<GradeAudioProfile['grade'], GradeAudioProfile>> = {
  Kindergarten: {
    grade: 'Kindergarten',
    dictationRate: 1.5,
    readingRate: 1.5,
    masteryRate: 1.5,
    instructionRate: 0.9,
    segmentGapMs: 750,
  },
  'Grade 2': {
    grade: 'Grade 2',
    dictationRate: 0.25,
    readingRate: 0.25,
    masteryRate: 0.25,
    instructionRate: 0.9,
    segmentGapMs: 750,
  },
  'Grade 5': {
    grade: 'Grade 5',
    dictationRate: 0.25,
    readingRate: 0.25,
    masteryRate: 0.25,
    instructionRate: 0.9,
    segmentGapMs: 750,
  },
}

export function gradeAudioProfileFor(grade: string): GradeAudioProfile {
  const profile = profiles[grade as GradeAudioProfile['grade']]
  if (!profile) throw new Error(`Audio behavior is not configured for ${grade}.`)
  return profile
}
