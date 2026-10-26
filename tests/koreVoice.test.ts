import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { koreAudioSegments, KORE_VOICE } from '../src/audio/koreVoice.ts'
import { GAME_LANGUAGE } from '../src/ninjaSkills/gameLanguagePreviewCatalog.ts'
import { TARGETS } from '../src/grade5PresentationPreview/assessmentData.ts'
import { dictationAudioText } from '../src/ninjaSkills/dictationContent.ts'
import type { AudioPlanSegment } from '../src/audio/promptAudio.ts'

const segment = (text: string, rate = 0.65): AudioPlanSegment => ({ text, rate, language: 'zh-CN' })
test('Kore replaces older Mandarin clips while English and fallback remain honest', () => {
  const [kore] = koreAudioSegments({ ...segment(' 英雄。 '), storagePath: 'old-voice.wav' })
  assert.match(kore.storagePath!, /^audio\/kore\//)
  assert.equal(kore.rate, 1)
  const english: AudioPlanSegment = { text: 'Listen', language: 'en-IE', rate: 0.9, storagePath: 'english.wav' }
  assert.equal(koreAudioSegments(english)[0], english)
  const [future] = koreAudioSegments({ ...segment('尚未生成的未来提示'), storagePath: 'old-voice.wav' })
  assert.equal(future.storagePath, undefined)
  assert.equal(future.rate, 0.65)
})
test('slow replay is slower once; cached/native rate distinction is preserved', () => {
  assert.equal(koreAudioSegments(segment('英雄', 0.5))[0].rate, 0.5 / 0.65)
  const [writing] = koreAudioSegments({ ...segment('英雄', 1), speechRate: 0.7 })
  assert.equal(writing.rate, 0.7 / 0.65)
  assert.equal(writing.speechRate, 0.7)
})
for (const [grade, rows] of Object.entries(GAME_LANGUAGE)) {
  test(`${grade}: every approved game word, character, sentence and dictation sequence has Kore`, () => {
    for (const [text, , , tokens] of rows) {
      for (const prompt of [text, ...text, tokens.join(''), dictationAudioText(text, tokens.join(''))]) {
        const parts = koreAudioSegments({ ...segment(prompt), pauseAfterMs: 750 })
        assert.ok(
          parts.every((part) => part.storagePath?.startsWith('audio/kore/')),
          prompt,
        )
        assert.equal(parts.at(-1)!.pauseAfterMs, 750)
      }
      const dictation = koreAudioSegments(segment(dictationAudioText(text, tokens.join(''))))
      assert.equal(dictation.length, 4)
      assert.equal(dictation[0].storagePath, dictation[2].storagePath)
      assert.equal(dictation[0].storagePath, dictation[3].storagePath)
    }
  })
}
test('Grade 5 shared assessment keeps complete-word and sentence recordings', () => {
  for (const target of TARGETS)
    for (const text of [target.text, ...target.text, target.sentence])
      assert.ok(
        koreAudioSegments(segment(text)).every((part) => part.storagePath),
        text,
      )
})
test('all Kore files match provider receipts and contain nonempty PCM', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/kore/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.voice, KORE_VOICE)
  assert.equal(manifest.speakingRate, 0.65)
  assert.ok(manifest.assets.length >= 918)
  for (const item of manifest.assets) {
    const bytes = readFileSync(new URL(`../public/audio/kore/${item.file}`, import.meta.url))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
    assert.equal(bytes.length, item.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256)
    assert.ok(item.durationSeconds > 0 && item.rms > 5)
    assert.equal(koreAudioSegments(segment(item.text))[0].storagePath, `audio/kore/${item.file}`)
  }
})
