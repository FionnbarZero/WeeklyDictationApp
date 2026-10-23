import { readFileSync } from 'node:fs'
import {
  createWritingLesson,
  COPY_MEMORY_WRITING_POLICY,
  KINDERGARTEN_WRITING_POLICY,
  GRADE5_WRITING_POLICY,
  writingCharacterGuides,
} from '../src/application/writingAcquisition/lesson.ts'
import { kindergartenAudioForText } from '../src/audio/kindergartenAudio.ts'
import { inspectSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'

const date = process.argv[2] || '2026-10-23'
const result = []
for (const [slug, policy] of [
  ['kindergarten', KINDERGARTEN_WRITING_POLICY],
  ['grade2', COPY_MEMORY_WRITING_POLICY],
  ['grade5', GRADE5_WRITING_POLICY],
] as const) {
  const raw = readFileSync(new URL(`../tests/fixtures/dojo-launch-2026-10-16/${slug}.json`, import.meta.url), 'utf8')
  const snapshot = JSON.parse(raw)
  await validateCurriculum(raw, snapshot.grade)
  const { datasets, warnings } = inspectSnapshot(snapshot)
  const latest = datasets.filter((d) => d.startDate <= date).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  const lessons = datasets.map((d) => {
    let lesson,
      failure = ''
    try {
      lesson = createWritingLesson(d, policy)
    } catch (e) {
      failure = (e as Error).message
    }
    const targets = d.words.map((w) => {
      let guide = true
      try {
        writingCharacterGuides(w.text)
      } catch {
        guide = false
      }
      const t = lesson?.targets.find((t) => t.id === w.id)
      return {
        text: w.text,
        guide,
        pinyin: Boolean(t?.pinyin),
        meaning: Boolean(t?.meaning),
        audio:
          slug === 'kindergarten'
            ? Boolean(kindergartenAudioForText(w.text)?.storagePath)
            : 'Mandarin speech; physical playback not verified',
      }
    })
    return {
      week: d.startDate,
      current: d.id === latest?.id,
      future: d.startDate > date,
      writingLaunchable: !failure && targets.every((t) => t.audio !== false),
      failure,
      targets,
    }
  })
  result.push({ grade: snapshot.grade, sourceHash: snapshot.contentSha256, warnings, lessons })
}
console.log(
  JSON.stringify(
    {
      date,
      scope: 'Retained test curriculum; no family records; metadata gaps are not vocabulary substitutions.',
      grades: result,
    },
    null,
    2,
  ),
)
