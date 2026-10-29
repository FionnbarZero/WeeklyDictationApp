import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareRecordingSource } from '../src/audio/recordingSource.ts'

test('complete recording bytes create one owned URL that is released exactly once', async (t) => {
  const blob = new Blob(['sound'], { type: 'audio/wav' })
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://preview.test/word.wav')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.headers, undefined)
    return new Response(blob)
  })
  const create = t.mock.method(URL, 'createObjectURL', (value) => {
    assert.equal(value.size, blob.size)
    return 'blob:owned-word'
  })
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  const source = await prepareRecordingSource('https://preview.test/word.wav', controller.signal)
  assert.equal(source.url, 'blob:owned-word')
  assert.equal(create.mock.callCount(), 1)
  source.release()
  source.release()
  assert.equal(revoke.mock.callCount(), 1)
  assert.equal(revoke.mock.calls[0].arguments[0], 'blob:owned-word')
})

test('cancelled download cannot allocate a late playback URL', async (t) => {
  const controller = new AbortController()
  let deliver!: (blob: Blob) => void
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    blob: () =>
      new Promise<Blob>((resolve) => {
        deliver = resolve
      }),
  }))
  const create = t.mock.method(URL, 'createObjectURL', () => 'blob:must-not-play')
  const request = prepareRecordingSource('https://preview.test/word.wav', controller.signal)
  await Promise.resolve()
  controller.abort()
  deliver(new Blob(['late sound']))
  await assert.rejects(request, { name: 'AbortError' })
  assert.equal(create.mock.callCount(), 0)
})

test('bad status or empty recording fails without creating an audio URL and permits a fresh retry', async (t) => {
  const controller = new AbortController()
  let attempt = 0
  t.mock.method(globalThis, 'fetch', async () => {
    attempt += 1
    return attempt === 1
      ? new Response('missing', { status: 404 })
      : attempt === 2
        ? new Response('')
        : new Response('sound')
  })
  const create = t.mock.method(URL, 'createObjectURL', () => 'blob:retry')
  t.mock.method(URL, 'revokeObjectURL', () => {})
  await assert.rejects(prepareRecordingSource('https://preview.test/word.wav', controller.signal))
  await assert.rejects(prepareRecordingSource('https://preview.test/word.wav', controller.signal))
  assert.equal(create.mock.callCount(), 0)
  const source = await prepareRecordingSource('https://preview.test/word.wav', controller.signal)
  assert.equal(source.url, 'blob:retry')
  source.release()
})
