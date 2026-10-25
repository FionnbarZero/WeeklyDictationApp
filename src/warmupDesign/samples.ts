import grade2 from '../../tests/fixtures/dojo-launch-2026-10-16/grade2.json' with { type: 'json' }
import grade5 from '../../tests/fixtures/dojo-launch-2026-10-16/grade5.json' with { type: 'json' }
import kindergarten from '../../tests/fixtures/dojo-launch-2026-10-16/kindergarten.json' with { type: 'json' }
import { writingCharacterGuides } from '../application/writingAcquisition/lesson.ts'
import { withKindergartenAudio } from '../audio/kindergartenAudio.ts'
import { type CurriculumSnapshot, inspectSnapshot } from '../familyBeta/curriculum.ts'

export const warmupGrades = ['Kindergarten', 'Grade 2', 'Grade 5'] as const
export type WarmupGrade = (typeof warmupGrades)[number]
export const warmupSlugs = { Kindergarten: 'kindergarten', 'Grade 2': 'grade2', 'Grade 5': 'grade5' } as const
const sources = { Kindergarten: kindergarten, 'Grade 2': grade2, 'Grade 5': grade5 }
// Explicit teacher-source samples cover one through four characters. They do
// not claim to be the current child/week's scheduled Warmup selection.
const samples = {
  Kindergarten: ['人', '牛'],
  'Grade 2': ['走', '哪里', '有爱心'],
  'Grade 5': ['盐', '用处', '神奇的', '各种各样'],
}
export function warmupSamples(grade: WarmupGrade) {
  const words = inspectSnapshot(sources[grade] as CurriculumSnapshot).datasets.flatMap((d) => d.words)
  return samples[grade].map((text) => {
    const word = words.find((w) => w.tier === 'tier-1' && w.text === text)
    if (!word) throw new Error(`The retained ${grade} sample is unavailable.`)
    return {
      word: grade === 'Kindergarten' ? withKindergartenAudio(word) : word,
      guides: writingCharacterGuides(word.text),
    }
  })
}
