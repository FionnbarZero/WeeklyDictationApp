// Selected tracing settings from the approved EduGames Stroke Order Slay
// profiles. Sequence, scoring and curriculum remain owned by their controllers.
export const teacherGradeProfiles = {
  Kindergarten: {
    id: 'kinder',
    title: 'Stroke-order Slay - Kinder',
    eyebrow: 'Kinder · Guided Touch Writing',
    animationStepSeconds: 1,
    memoryGuideVisible: true,
    assessment: {
      maximumEndpointDistance: 25,
      minimumLengthRatio: 0.4,
      maximumLengthRatio: 2.1,
      maximumAverageDeviation: 15,
    },
  },
  'Grade 2': {
    id: 'grade-2',
    title: 'Stroke-order Slay - 2nd',
    eyebrow: '2nd Grade · Touch Writing',
    animationStepSeconds: 0.7,
    memoryGuideVisible: false,
    assessment: {
      maximumEndpointDistance: 18,
      minimumLengthRatio: 0.55,
      maximumLengthRatio: 1.8,
      maximumAverageDeviation: 11,
    },
  },
  'Grade 5': {
    id: 'grade-5',
    title: 'Stroke-order Slay - 5th',
    eyebrow: '5th Grade · Precision Writing',
    animationStepSeconds: 0.5,
    memoryGuideVisible: false,
    assessment: {
      maximumEndpointDistance: 12,
      minimumLengthRatio: 0.7,
      maximumLengthRatio: 1.45,
      maximumAverageDeviation: 7,
    },
  },
} as const
export type TeacherGrade = keyof typeof teacherGradeProfiles
export type StrokeAssessmentSettings = {
  readonly maximumEndpointDistance: number
  readonly minimumLengthRatio: number
  readonly maximumLengthRatio: number
  readonly maximumAverageDeviation: number
}

export function teacherProfileForGrade(grade: string) {
  if (!Object.prototype.hasOwnProperty.call(teacherGradeProfiles, grade))
    throw new Error(`Stroke teaching is not configured for ${grade}.`)
  const profile = teacherGradeProfiles[grade as TeacherGrade]
  if (!profile) throw new Error(`Stroke teaching is not configured for ${grade}.`)
  return profile
}
