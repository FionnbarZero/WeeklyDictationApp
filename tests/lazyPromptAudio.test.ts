import assert from 'node:assert/strict'
import test from 'node:test'
import { playCachedWordAudio } from '../src/audio/lazyPromptAudio.ts'

test('the lazy cached-audio bridge exposes cancellation without an unhandled internal promise', async () => {
  const attempt = playCachedWordAudio({
    id: 'grade-2-word',
    text: '学校',
    sentence: '',
    datasetId: 'grade-2-week',
  })

  const start = assert.rejects(attempt.started, /cancelled/i)
  const completion = assert.rejects(attempt.completed, /cancelled/i)
  attempt.stop()
  await Promise.all([start, completion])
})
