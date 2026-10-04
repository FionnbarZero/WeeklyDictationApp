import assert from 'node:assert/strict'
import test from 'node:test'
import { gradeAudioProfileFor } from '../src/audio/gradeAudioProfile.ts'

test('grade audio profiles keep Mandarin speed constant within each grade', () => {
  for (const grade of ['Kindergarten', 'Grade 2', 'Grade 5']) {
    const profile = gradeAudioProfileFor(grade)
    assert.equal(profile.dictationRate, profile.readingRate)
    assert.equal(profile.dictationRate, profile.masteryRate)
    assert.equal(profile.segmentGapMs, 750)
  }
})

test('Grade 2 and Grade 5 retain their intentionally slow Mandarin rate', () => {
  assert.equal(gradeAudioProfileFor('Grade 2').dictationRate, 0.25)
  assert.equal(gradeAudioProfileFor('Grade 5').dictationRate, 0.25)
})

test('unsupported grades fail closed instead of inheriting an accidental voice speed', () => {
  assert.throws(() => gradeAudioProfileFor('Grade 3'), /not configured/)
})
