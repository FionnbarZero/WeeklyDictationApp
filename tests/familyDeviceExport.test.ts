import assert from 'node:assert/strict'
import test from 'node:test'
import { deviceExport } from '../src/familyBeta/deviceExport.ts'

test('device export preserves application records without changing storage or exposing unrelated tokens', () => {
  const entries = new Map([
    ['family-beta-preview-results-v1:result', '{damaged-but-preserved'],
    ['family-beta-acquisition-v1:checkpoint', '{"schema":1}'],
    ['family-beta-problem-report-v1:report', '{"description":"audio silent"}'],
    ['weekly-dictation-state-v2', '{"version":2}'],
    ['family-beta-games-v1:family:checkpoint:game', '{damaged-game-preserved'],
    ['firebase:authUser:secret', 'private-token'],
    ['unrelated', 'private-data'],
  ])
  const storage = {
    length: entries.size,
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
  }
  const backup = deviceExport(storage, 'https://example.test')
  assert.equal(backup.origin, 'https://example.test')
  assert.equal(Object.keys(backup.records).length, 5)
  assert.equal(backup.records['family-beta-games-v1:family:checkpoint:game'], '{damaged-game-preserved')
  assert.equal(backup.records['family-beta-preview-results-v1:result'], '{damaged-but-preserved')
  assert.ok(!JSON.stringify(backup).includes('private-token'))
  assert.ok(!JSON.stringify(backup).includes('private-data'))
  assert.equal(entries.size, 7)
})
