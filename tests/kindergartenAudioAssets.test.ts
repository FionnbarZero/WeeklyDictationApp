import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import {
  kindergartenAudioForText,
  kindergartenInstructionAudio,
  withKindergartenAudio,
} from '../src/audio/kindergartenAudio.ts'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import type { Word } from '../src/domain/contracts.ts'

const manifestPath = new URL('../src/audio/kindergarten/manifest.json', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  sourceSpreadsheetId: string
  voice: { provider: string; languageCode: string; productionCandidates: string[] }
  instructions: Record<string, { text: string; storagePath: string; voice: string; languageCode: string }>
  assets: Record<string, { storagePath: string }>
  contexts: Record<string, { storagePath: string; targetOccurrenceIds: string[] }>
}
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8'),
) as Omit<SheetsWorkbookPayload, 'sourceType'>

test('every authoritative Kindergarten reading and writing target plus Familiar DT has a cached recording', () => {
  const authoritativeTargets = inspectKindergartenWorkbook(fixture).flatMap((candidate) =>
    [...candidate.tier1, ...candidate.tier2].map((target) => target.text),
  )
  const familiarTargets = kindergartenAcquisitionStrategy.familiarDtTargets.map((target) => target.text)
  const required = new Set([...authoritativeTargets, ...familiarTargets])

  assert.equal(manifest.sourceSpreadsheetId, fixture.spreadsheetId)
  assert.equal(manifest.voice.languageCode, 'zh-CN')
  assert.deepEqual(manifest.voice.productionCandidates, ['cmn-CN-Wavenet-A', 'cmn-CN-Wavenet-D'])
  for (const text of required) {
    assert.ok(kindergartenAudioForText(text)?.storagePath, `Missing cached audio metadata for ${text}`)
  }
})

test('adding Kindergarten isolated-word audio preserves separately generated context audio', () => {
  const word: Word = {
    id: 'context-audio-fixture',
    text: '九',
    sentence: '我有九本书',
    datasetId: 'fixture',
    audio: {
      contextStoragePath: 'audio/kindergarten/context/approved.wav',
      contextVoice: 'approved-context-voice',
    },
  }
  const enriched = withKindergartenAudio(word)
  assert.ok(enriched.audio?.storagePath?.endsWith('.wav'))
  assert.equal(enriched.audio?.contextStoragePath, 'audio/kindergarten/context/approved.wav')
  assert.equal(enriched.audio?.contextVoice, 'approved-context-voice')
})

test('the first-new-target English instruction has a cached Irish-English recording', () => {
  const instruction = kindergartenInstructionAudio('newTarget')
  assert.equal(instruction.text, "Let's learn a new word.")
  assert.equal(instruction.voice, 'Moira')
  assert.equal(instruction.languageCode, 'en-IE')
  const path = new URL(`../public/${instruction.storagePath}`, import.meta.url)
  assert.equal(existsSync(path), true)
  const bytes = readFileSync(path)
  assert.ok(bytes.length > 4096)
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE')
})

test('the cached Kindergarten audio manifest points only to non-empty PCM WAVE files', () => {
  for (const [text, asset] of Object.entries(manifest.assets)) {
    const path = new URL(`../public/${asset.storagePath}`, import.meta.url)
    assert.equal(existsSync(path), true, `Missing cached audio file for ${text}`)
    const bytes = readFileSync(path)
    assert.ok(bytes.length > 4096, `Cached audio file for ${text} has no audio payload`)
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE')
    assert.ok(
      bytes.subarray(4096).some((byte) => byte !== 0),
      `Cached audio file for ${text} is silent`,
    )
  }
})
