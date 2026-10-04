import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { kindergartenAcquisitionStrategy } from '../src/acquisition/strategies/kindergarten.ts'
import { kindergartenAudioForText } from '../src/audio/kindergartenAudio.ts'
import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'

const manifestPath = new URL('../public/audio/kindergarten/manifest.json', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  sourceSpreadsheetId: string
  voice: { provider: string; languageCode: string; productionReplacement: string }
  assets: Record<string, { storagePath: string }>
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
  assert.equal(manifest.voice.productionReplacement, 'cmn-CN-Wavenet-C')
  for (const text of required) {
    assert.ok(kindergartenAudioForText(text)?.storagePath, `Missing cached audio metadata for ${text}`)
  }
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
