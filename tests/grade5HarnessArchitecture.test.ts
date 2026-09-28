import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the Grade 5 source harness is isolated from production application entry points', () => {
  const productionEntries = [source('index.html'), source('src/main.tsx'), source('src/App.tsx')].join('\n')
  const harnessHtml = source('grade5-source-harness.html')
  const harnessSource = source('src/grade5SourceHarness.ts')

  assert.doesNotMatch(productionEntries, /grade5-source-harness|grade5SourceHarness/)
  assert.match(harnessHtml, /Development-only source harness/)
  assert.match(harnessHtml, /src\/grade5SourceHarness\.ts/)
  assert.match(harnessSource, /import\.meta\.env\.DEV/)
  assert.match(harnessSource, /tests\/fixtures\/grade5-presentation\.json/)
  assert.doesNotMatch(harnessSource, /firebase|firestore|googleapis|fetch\(['"]https:/i)
})
