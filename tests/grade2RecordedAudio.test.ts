import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { hydrateAutomaticGrade2Curriculum } from '../src/automaticGrade2Curriculum.ts'
import { recordedMandarinFileName } from '../src/audio/recordedMandarinAudio.ts'
import { parseGrade2CurriculumSnapshot } from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { createInitialState } from '../src/domain.ts'

test('every reviewed Grade 2 vocabulary and Familiar DT term has playable packaged audio', () => {
  const snapshot = parseGrade2CurriculumSnapshot(
    JSON.parse(readFileSync(new URL('../public/curriculum/grade2-presentation.json', import.meta.url), 'utf8')),
  )
  const state = hydrateAutomaticGrade2Curriculum(createInitialState(), snapshot)
  const curriculumTerms = state.datasets.flatMap((dataset) =>
    Object.values(dataset.vocabulary || { tier1: dataset.words, tier2: [], tier3: [] })
      .flat()
      .map((word) => word.text),
  )
  const terms = new Set([
    ...curriculumTerms,
    ...grade2AcquisitionStrategy.familiarDtTargets.map((word) => word.text),
  ])

  assert.equal(terms.size, 86)
  for (const term of terms) {
    const audio = readFileSync(
      new URL(`../public/audio/mandarin/${recordedMandarinFileName(term)}`, import.meta.url),
    )
    assert.equal(audio.subarray(0, 4).toString('ascii'), 'RIFF', `Missing WAV header for ${term}`)
    assert.ok(audio.byteLength > 4096, `Packaged audio is empty for ${term}`)
  }
})
