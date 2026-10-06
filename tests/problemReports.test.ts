import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exportProblemReports,
  problemReportsEmailUrl,
  readProblemReports,
  REPORT_PREFIX,
  saveProblemReport,
  type ProblemReport,
} from '../src/familyBeta/problemReports.ts'

function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => entries.clear(),
  }
}
const report: ProblemReport = {
  schema: 1,
  id: 'example',
  capturedAt: '2026-10-05T10:00:00.000Z',
  savedAt: '2026-10-05T10:01:00.000Z',
  category: 'Sound or microphone',
  description: 'The word did not play.',
  context: { grade: 'Grade 2', activity: 'Writing practice' },
}
test('email draft contains the complete report and no preset recipient or send action', () => {
  const special = { ...report, description: '牛 & 羊?\nNo sound + delayed movement #1' }
  const second = { ...report, id: 'second' }
  const url = new URL(problemReportsEmailUrl([special, second]))
  assert.equal(url.protocol, 'mailto:')
  assert.equal(url.pathname, '')
  assert.match(url.searchParams.get('subject')!, /2 saved problem/)
  assert.deepEqual(JSON.parse(url.searchParams.get('body')!).reports, [special, second])
})
test('reports survive reload, remain separate from progress, and export together', () => {
  const storage = memoryStorage()
  storage.setItem('child-progress', 'private scores')
  saveProblemReport(storage, report)
  saveProblemReport(storage, { ...report, id: 'second' })
  const reports = readProblemReports(storage)
  assert.equal(reports.length, 2)
  const exported = exportProblemReports(reports)
  assert.equal(JSON.parse(exported).reports[0].description, report.description)
  assert.ok(!exported.includes('private scores'))
  assert.equal(storage.getItem('child-progress'), 'private scores')
})
test('duplicate saves are idempotent and cannot overwrite a different report', () => {
  const storage = memoryStorage()
  saveProblemReport(storage, report)
  saveProblemReport(storage, report)
  assert.equal(readProblemReports(storage).length, 1)
  assert.throws(() => saveProblemReport(storage, { ...report, description: 'Changed' }))
  assert.throws(() => saveProblemReport(storage, { ...report, id: 'empty', description: '  ' }))
})
test('corrupt reports are preserved instead of silently discarded', () => {
  const storage = memoryStorage()
  storage.setItem(REPORT_PREFIX + 'broken', '{broken')
  assert.throws(() => readProblemReports(storage))
  assert.equal(storage.getItem(REPORT_PREFIX + 'broken'), '{broken')
})
test('storage failure is not reported as success', () => {
  const storage = memoryStorage()
  storage.setItem = () => {
    throw new Error('Quota exceeded')
  }
  assert.throws(() => saveProblemReport(storage, report), /Quota exceeded/)
})
