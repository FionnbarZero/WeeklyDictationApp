import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the Kindergarten source harness is development-only and isolated from production entry points', () => {
  const productionEntries = [source('index.html'), source('src/main.tsx'), source('src/App.tsx')].join('\n')
  const harnessHtml = source('kindergarten-source-harness.html')
  const harnessSource = source('src/kindergartenSourceHarness.ts')

  assert.doesNotMatch(productionEntries, /kindergarten-source-harness|kindergartenSourceHarness|kindergartenSheetsImporter/)
  assert.match(harnessHtml, /Development-only source harness/)
  assert.match(harnessHtml, /src\/kindergartenSourceHarness\.ts/)
  assert.match(harnessHtml, /does not contact Google or write application data/)
  assert.match(harnessSource, /import\.meta\.env\.DEV/)
  assert.match(harnessSource, /tests\/fixtures\/kindergarten-workbook\.json/)
  assert.doesNotMatch(harnessSource, /firebase|firestore|googleapis|localStorage|fetch\(['"]https:/i)
})
