import assert from 'node:assert/strict'
import test from 'node:test'
import { playCachedWordAudio, promptAudioStarted, stopPromptAudio } from '../src/audio/promptAudio.ts'
import type { Word } from '../src/domain/contracts.ts'

type Listener = () => void

class FakeAudio {
  src = ''
  playbackRate = 1
  preload = ''
  playCount = 0
  pauseCount = 0
  loadCount = 0
  rejectPlay = false
  readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as Listener
    const listeners = this.listeners.get(type) || new Set<Listener>()
    listeners.add(callback)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener as Listener)
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) || []) listener()
  }

  load() {
    this.loadCount += 1
  }
  pause() {
    this.pauseCount += 1
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
  play() {
    this.playCount += 1
    return this.rejectPlay ? Promise.reject(new Error('blocked')) : Promise.resolve()
  }
}

const word: Word = {
  id: 'kindergarten-three',
  text: '三',
  sentence: '',
  datasetId: 'kindergarten-week-3',
  audio: { storagePath: 'audio/kindergarten/u4e09.wav', voice: 'test' },
}

test('cached prompt audio plays the approved recording three times with one-second pauses', async () => {
  const audio = new FakeAudio()
  const timers: Array<() => void> = []
  const attempt = playCachedWordAudio(word, false, {
    createAudio: () => audio,
    resolveUrl: (path) => `https://example.test/${path}`,
    setTimer: (callback, delay) => {
      assert.equal(delay, 1000)
      timers.push(callback)
      return timers.length
    },
  })

  await promptAudioStarted(attempt)
  assert.equal(audio.src, 'https://example.test/audio/kindergarten/u4e09.wav')
  assert.equal(audio.playCount, 1)
  assert.equal(audio.playbackRate, 1)

  audio.emit('ended')
  timers.shift()?.()
  audio.emit('ended')
  timers.shift()?.()
  audio.emit('ended')
  assert.equal(audio.playCount, 3)
  assert.equal(timers.length, 0)

  stopPromptAudio(attempt)
  assert.equal(audio.pauseCount, 1)
  assert.equal(audio.src, '')
})

test('warmup cached audio uses the planned faster playback rate', async () => {
  const audio = new FakeAudio()
  const attempt = playCachedWordAudio(word, true, { createAudio: () => audio, resolveUrl: (path) => path })
  await promptAudioStarted(attempt)
  assert.equal(audio.playbackRate, 1.5)
  stopPromptAudio(attempt)
})

test('missing and failed recordings reject with a visible-actionable error', async () => {
  const missing = playCachedWordAudio({ ...word, audio: undefined }, false, { createAudio: () => new FakeAudio() })
  await assert.rejects(promptAudioStarted(missing), /No approved audio recording/)

  const audio = new FakeAudio()
  audio.rejectPlay = true
  const failed = playCachedWordAudio(word, false, { createAudio: () => audio, resolveUrl: (path) => path })
  await assert.rejects(promptAudioStarted(failed), /Tap Replay sequence/)
  stopPromptAudio(failed)
})
