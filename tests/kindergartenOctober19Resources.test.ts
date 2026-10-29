import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { kindergartenAudioForText } from '../src/audio/kindergartenAudio.ts'
import {
  createWritingLesson,
  KINDERGARTEN_WRITING_POLICY,
  writingCharacterGuides,
} from '../src/application/writingAcquisition/lesson.ts'
import { inspectSnapshot, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import { kindergartenReadingAcquisitionPathway } from '../src/kindergartenLab/readingPractice.ts'
import {
  kindergartenWritingDatasetForLab,
  kindergartenWritingUnavailableReason,
} from '../src/kindergartenLab/acquisitionLab.ts'

const snapshot = JSON.parse(
  readFileSync(new URL('./fixtures/dojo-launch-2026-10-16/kindergarten.json', import.meta.url), 'utf8'),
) as CurriculumSnapshot
const candidate = inspectSnapshot(snapshot).candidates.find((item) => item.normalizedStartDate === '2026-10-19')!

test('October 19 Kindergarten writing supports both actual source targets without changing native policy', () => {
  assert.deepEqual(
    candidate.tier1.map((target) => target.text),
    ['虫', '小'],
  )
  assert.equal(kindergartenWritingUnavailableReason(candidate), null)
  const lesson = createWritingLesson(kindergartenWritingDatasetForLab(candidate), KINDERGARTEN_WRITING_POLICY)
  assert.deepEqual(
    lesson.targets.map((target) => target.text),
    ['虫', '小'],
  )
  assert.equal(lesson.policy, KINDERGARTEN_WRITING_POLICY)
  assert.equal(writingCharacterGuides('虫')[0].length, 6)
  assert.equal(writingCharacterGuides('小')[0].length, 3)
})

test('October 19 reading uses its three real targets with individual cached recordings', () => {
  const pathway = kindergartenReadingAcquisitionPathway(candidate)
  assert.equal(pathway.available, true)
  assert.deepEqual(
    pathway.cohorts[0].targets.map((target) => target.text),
    ['你', '家', '森林'],
  )
  for (const target of [...candidate.tier1, ...candidate.tier2]) {
    const audio = kindergartenAudioForText(target.text)
    assert.ok(audio?.storagePath, `Missing recording for ${target.text}`)
    const bytes = readFileSync(new URL(`../public/${audio.storagePath}`, import.meta.url))
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE')
    assert.ok(bytes.length > 4096 && bytes.subarray(4096).some((value) => value !== 0))
  }
})

test('adding October 19 resources does not replace the October 12 curriculum or activate targets early', () => {
  const { datasets } = inspectSnapshot(snapshot)
  const select = (day: string) =>
    datasets.filter((item) => item.startDate <= day).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  assert.equal(select('2026-10-18').startDate, '2026-10-12')
  assert.deepEqual(
    select('2026-10-18').words.map((word) => word.text),
    ['土', '花'],
  )
  assert.equal(select('2026-10-19').startDate, '2026-10-19')
  assert.deepEqual(
    select('2026-10-19').words.map((word) => word.text),
    ['虫', '小'],
  )
})
