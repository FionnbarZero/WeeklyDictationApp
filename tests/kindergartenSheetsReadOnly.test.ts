import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { fetchGoogleSpreadsheet } from '../backend/googleSheets.ts'
import { inspectKindergartenSheetsReadOnly, type ReadOnlySheetsInspectionDependencies } from '../backend/readOnlySheetsInspection.ts'
import { KINDERGARTEN_SHEETS_ID } from '../src/config.ts'

const sourcePath = (relativePath: string) => fileURLToPath(new URL(`../${relativePath}`, import.meta.url))

test('read-only Sheets inspection authenticates, fetches, and normalizes without hydration', async () => {
  const calls: string[] = []
  const dependencies: ReadOnlySheetsInspectionDependencies = {
    googleAccessToken: async () => { calls.push('sheets-auth'); return 'read-token' },
    fetchGoogleSpreadsheet: async (spreadsheetId, token) => {
      calls.push('sheets-read')
      assert.equal(spreadsheetId, KINDERGARTEN_SHEETS_ID)
      assert.equal(token, 'read-token')
      return {
        sourceType: 'google-sheets',
        spreadsheetId,
        sheets: [{ sheetId: 1395217571, title: 'Week 6 09/21', values: [['Mandarin\n- Writing character 九、十、白\n- High frequency word 红色、蓝色']] }],
      }
    },
  }

  const candidates = await inspectKindergartenSheetsReadOnly({
    spreadsheetId: KINDERGARTEN_SHEETS_ID,
    googleOAuth: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
  }, dependencies)

  assert.deepEqual(calls, ['sheets-auth', 'sheets-read'])
  assert.deepEqual(candidates[0].assignedWeek, { startDate: '2026-09-21', endDate: '2026-09-27' })
  assert.deepEqual(candidates[0].tier1.map((term) => term.text), ['九', '十', '白'])
  assert.deepEqual(candidates[0].tier2.map((term) => term.text), ['红色', '蓝色'])
  assert.equal(candidates[0].status, 'malformed')
})

test('read-only inspection rejects an unregistered spreadsheet before authentication', async () => {
  let called = false
  const dependencies: ReadOnlySheetsInspectionDependencies = {
    googleAccessToken: async () => { called = true; return 'token' },
    fetchGoogleSpreadsheet: async () => { called = true; throw new Error('not reached') },
  }
  await assert.rejects(() => inspectKindergartenSheetsReadOnly({
    spreadsheetId: 'different-workbook',
    googleOAuth: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
  }, dependencies), /not the registered Kindergarten workbook/i)
  assert.equal(called, false)
})

test('Google Sheets source fetch uses read-only metadata and bounded batch range requests', async () => {
  const urls: URL[] = []
  const methods: Array<string | undefined> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
    urls.push(url)
    methods.push(init?.method)
    if (url.pathname.endsWith('/values:batchGet')) {
      return new Response(JSON.stringify({ valueRanges: [{ range: "'Week 6 09/21'!A1:V200", values: [['Writing character 九、十']] }] }), { status: 200 })
    }
    return new Response(JSON.stringify({
      spreadsheetId: KINDERGARTEN_SHEETS_ID,
      sheets: [{ properties: { sheetId: 1395217571, title: 'Week 6 09/21', index: 0 } }],
    }), { status: 200 })
  }) as typeof fetch

  const workbook = await fetchGoogleSpreadsheet(KINDERGARTEN_SHEETS_ID, 'token', fetchImpl)
  assert.equal(workbook.sheets?.[0].sheetId, 1395217571)
  assert.deepEqual(methods, [undefined, undefined])
  assert.equal(urls[0].hostname, 'sheets.googleapis.com')
  assert.equal(urls[1].pathname.endsWith('/values:batchGet'), true)
  assert.deepEqual(urls[1].searchParams.getAll('ranges'), ["'Week 6 09/21'!A1:V200"])
})

test('Kindergarten Sheets inspection has no Firestore or application-state write path', () => {
  const sources = [
    readFileSync(sourcePath('backend/googleSheets.ts'), 'utf8'),
    readFileSync(sourcePath('backend/readOnlySheetsInspection.ts'), 'utf8'),
    readFileSync(sourcePath('scripts/inspect-kindergarten-sheets.ts'), 'utf8'),
    readFileSync(sourcePath('src/kindergartenSheetsImporter.ts'), 'utf8'),
  ].join('\n')
  assert.doesNotMatch(sources, /backend\/firestore|\.\/firestore|FIRESTORE_|hydrateLocalState|writeImportBatch|localStorage/)
})
