import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the Grade 5 learning hub remains development-only and outside production entry points', () => {
  const productionEntries = [source('index.html'), source('src/main.tsx'), source('src/App.tsx')].join('\n')
  const harnessHtml = source('grade5-learning-hub.html')
  const harnessSource = source('src/grade5LearningHubHarness.ts')
  const hubModel = source('src/grade5Lab/learningHub.ts')

  assert.doesNotMatch(productionEntries, /grade5-learning-hub|grade5LearningHubHarness|grade5Lab\/learningHub/)
  assert.match(harnessHtml, /Development-only child experience/)
  assert.match(harnessHtml, /src\/grade5LearningHubHarness\.ts/)
  assert.match(harnessSource, /import\.meta\.env\.DEV/)
  assert.match(harnessSource, /tests\/fixtures\/grade5-presentation\.json/)
  assert.doesNotMatch(`${harnessSource}\n${hubModel}`, /firebase|firestore|localStorage|googleapis/i)
  assert.doesNotMatch(hubModel, /from ['"]\.\.\/App|from ['"]\.\.\/domain/)
})

test('the Grade 5 learning hub only previews portable requests and never implements practice engines', () => {
  const harnessSource = source('src/grade5LearningHubHarness.ts')
  const hubModel = source('src/grade5Lab/learningHub.ts')

  assert.match(harnessSource, /not connected yet/i)
  assert.doesNotMatch(`${harnessSource}\n${hubModel}`, /startAcquisition|completeAcquisition|createScore|saveSession/)
})
