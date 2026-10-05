import assert from 'node:assert/strict'
import test from 'node:test'
import {
  playCachedWordAudio,
  playCachedWordAudioOnce,
  playReadingTeachingSequence,
  promptAudioCompleted,
  promptAudioStarted,
  stopPromptAudio,
} from '../src/audio/promptAudio.ts'
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

test('reading teaching plays a cached English announcement before the Mandarin sequence without browser voices', async () => {
  const audios: FakeAudio[] = []
  const timers: Array<() => void> = []
  const flushPlan = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  const completion = playReadingTeachingSequence(word, {
    newTargetAnnouncement: "Let's learn a new word.",
    newTargetAnnouncementStoragePath: 'audio/kindergarten/instructions/lets-learn-a-new-word.wav',
    createAudio: () => {
      const audio = new FakeAudio()
      audios.push(audio)
      return audio
    },
    resolveUrl: (path) => path,
    setTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
  })

  assert.equal(audios[0].src, 'audio/kindergarten/instructions/lets-learn-a-new-word.wav')
  audios[0].emit('ended')
  await flushPlan()
  assert.equal(audios[1].src, 'audio/kindergarten/u4e09.wav')

  for (let index = 1; index < 4; index += 1) {
    audios[index].emit('ended')
    await flushPlan()
    if (index < 3) {
      timers.shift()?.()
      await flushPlan()
    }
  }
  await completion

  assert.deepEqual(audios.map((audio) => audio.src), [
    'audio/kindergarten/instructions/lets-learn-a-new-word.wav',
    'audio/kindergarten/u4e09.wav',
    'audio/kindergarten/u4e09.wav',
    'audio/kindergarten/u4e09.wav',
  ])
})

test('reading teaching applies the grade-owned English instruction rate', async () => {
  const spokenRates: number[] = []
  const speech = {
    cancel() {},
    getVoices: () => [],
    resume() {},
    speak(utterance: SpeechSynthesisUtterance) {
      spokenRates.push(utterance.rate)
      utterance.onstart?.({} as SpeechSynthesisEvent)
      utterance.onend?.({} as SpeechSynthesisEvent)
    },
  } as unknown as SpeechSynthesis

  await playReadingTeachingSequence({ ...word, audio: undefined }, {
    instructionRate: 0.8,
    playbackRate: 0.25,
    createUtterance: (text) => ({ text } as SpeechSynthesisUtterance),
    pauseMs: 0,
    speech,
    voiceLoadTimeoutMs: 0,
  })

  assert.deepEqual(spokenRates, [0.8, 0.25, 0.25, 0.25])
})

test('cached prompt audio plays the approved recording three times with 0.75-second pauses', async () => {
  const audio = new FakeAudio()
  const timers: Array<() => void> = []
  const attempt = playCachedWordAudio(word, false, {
    createAudio: () => audio,
    resolveUrl: (path) => `https://example.test/${path}`,
    setTimer: (callback, delay) => {
      assert.equal(delay, 750)
      timers.push(callback)
      return timers.length
    },
  })

  await promptAudioStarted(attempt)
  assert.equal(audio.src, 'https://example.test/audio/kindergarten/u4e09.wav')
  assert.equal(audio.playCount, 1)
  assert.equal(audio.playbackRate, 1)

  audio.emit('ended')
  await Promise.resolve()
  timers.shift()?.()
  await Promise.resolve()
  audio.emit('ended')
  await Promise.resolve()
  timers.shift()?.()
  await Promise.resolve()
  audio.emit('ended')
  assert.equal(audio.playCount, 3)
  assert.equal(timers.length, 0)

  stopPromptAudio(attempt)
  assert.equal(audio.pauseCount, 0)
})

test('an approved context produces word, context, word, word at one rate with 0.75-second gaps', async () => {
  const audios: FakeAudio[] = []
  const timers: Array<() => void> = []
  const contextualWord: Word = {
    ...word,
    sentence: '我有三只猫',
    audio: {
      storagePath: 'audio/kindergarten/u4e09.wav',
      contextStoragePath: 'audio/kindergarten/context/u4e09.wav',
      voice: 'test',
      contextVoice: 'test',
    },
  }
  const attempt = playCachedWordAudio(contextualWord, false, {
    playbackRate: 1.5,
    sentenceRate: 1.5,
    createAudio: () => {
      const audio = new FakeAudio()
      audios.push(audio)
      return audio
    },
    resolveUrl: (path) => path,
    setTimer: (callback, delay) => {
      assert.equal(delay, 750)
      timers.push(callback)
      return timers.length
    },
  })

  await promptAudioStarted(attempt)
  for (let index = 0; index < 4; index += 1) {
    audios[index].emit('ended')
    await Promise.resolve()
    if (index < 3) {
      timers.shift()?.()
      await Promise.resolve()
    }
  }
  await promptAudioCompleted(attempt)

  assert.deepEqual(audios.map((audio) => audio.src), [
    'audio/kindergarten/u4e09.wav',
    'audio/kindergarten/context/u4e09.wav',
    'audio/kindergarten/u4e09.wav',
    'audio/kindergarten/u4e09.wav',
  ])
  assert.ok(audios.every((audio) => audio.playbackRate === 1.5))
})

test('the legacy warmup flag cannot change Mandarin speed implicitly', async () => {
  const audio = new FakeAudio()
  const attempt = playCachedWordAudio(word, true, { createAudio: () => audio, resolveUrl: (path) => path })
  await promptAudioStarted(attempt)
  assert.equal(audio.playbackRate, 1)
  stopPromptAudio(attempt)
})

test('one-shot cached audio resolves only after the correct pronunciation finishes', async () => {
  const audio = new FakeAudio()
  let finished = false
  const playback = playCachedWordAudioOnce(word, {
    createAudio: () => audio,
    resolveUrl: (path) => `https://example.test/${path}`,
  }).then(() => {
    finished = true
  })

  await Promise.resolve()
  assert.equal(audio.src, 'https://example.test/audio/kindergarten/u4e09.wav')
  assert.equal(audio.playCount, 1)
  assert.equal(finished, false)

  audio.emit('ended')
  await playback
  assert.equal(finished, true)
})

test('missing and failed recordings reject with a visible actionable error when fallback is unavailable', async () => {
  const missing = playCachedWordAudio({ ...word, audio: undefined }, false, { createAudio: () => new FakeAudio() })
  await assert.rejects(promptAudioStarted(missing), /ask a teacher for help/)

  const audio = new FakeAudio()
  audio.rejectPlay = true
  const failed = playCachedWordAudio(word, false, { createAudio: () => audio, resolveUrl: (path) => path })
  await assert.rejects(promptAudioStarted(failed), /ask a teacher for help/)
  stopPromptAudio(failed)
})

test('a failed cached recording immediately falls back to browser speech for the same segment', async () => {
  const audio = new FakeAudio()
  audio.rejectPlay = true
  const spoken: string[] = []
  const speech = {
    cancel() {},
    getVoices: () => [],
    resume() {},
    speak(utterance: SpeechSynthesisUtterance) {
      spoken.push(utterance.text)
      utterance.onstart?.({} as SpeechSynthesisEvent)
      utterance.onend?.({} as SpeechSynthesisEvent)
    },
  } as unknown as SpeechSynthesis
  const attempt = playCachedWordAudioOnce(word, {
    createAudio: () => audio,
    createUtterance: (text) => ({ text } as SpeechSynthesisUtterance),
    resolveUrl: (path) => path,
    speech,
    voiceLoadTimeoutMs: 0,
  })

  await attempt
  assert.deepEqual(spoken, ['三'])
})

test('browser fallback waits for the preferred female Mandarin voice before speaking', async () => {
  const audio = new FakeAudio()
  audio.rejectPlay = true
  const listeners = new Set<() => void>()
  const spokenVoices: string[] = []
  let voices: SpeechSynthesisVoice[] = []
  const tingting = { name: 'Tingting', lang: 'zh-CN' } as SpeechSynthesisVoice
  const speech = {
    addEventListener(type: string, listener: () => void) {
      if (type === 'voiceschanged') listeners.add(listener)
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === 'voiceschanged') listeners.delete(listener)
    },
    cancel() {},
    getVoices: () => voices,
    resume() {},
    speak(utterance: SpeechSynthesisUtterance) {
      spokenVoices.push(utterance.voice?.name || 'default')
      utterance.onstart?.({} as SpeechSynthesisEvent)
      utterance.onend?.({} as SpeechSynthesisEvent)
    },
  } as unknown as SpeechSynthesis
  const playback = playCachedWordAudioOnce(word, {
    createAudio: () => audio,
    createUtterance: (text) => ({ text } as SpeechSynthesisUtterance),
    resolveUrl: (path) => path,
    speech,
    voiceLoadTimeoutMs: 5_000,
  })

  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(spokenVoices, [])
  voices = [tingting]
  for (const listener of listeners) listener()
  await playback
  assert.deepEqual(spokenVoices, ['Tingting'])
  assert.equal(listeners.size, 0)
})
