import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the Kindergarten learning lab uses an explicit public-preview gate and stays outside production entry points', () => {
  const productionEntries = [source('index.html'), source('src/main.tsx'), source('src/App.tsx')].join('\n')
  const harnessHtml = source('kindergarten-learning-lab.html')
  const harnessSource = source('src/kindergartenLearningLabHarness.tsx')

  assert.doesNotMatch(productionEntries, /kindergarten-learning-lab|kindergartenLearningLabHarness|kindergartenLab\//)
  assert.match(harnessHtml, /kindergarten-lab-root/)
  assert.match(harnessHtml, /src\/kindergartenLearningLabHarness\.tsx/)
  assert.match(harnessSource, /import\.meta\.env\.DEV/)
  assert.match(harnessSource, /VITE_PUBLIC_PREVIEW/)
  assert.match(harnessSource, /new URL\('\.\.\/tests\/fixtures\/kindergarten-workbook\.json', import\.meta\.url\)\.href/)
  assert.match(harnessSource, /tests\/fixtures\/kindergarten-workbook\.json/)
  assert.match(harnessSource, /kindergartenCurrentSourceWeek/)
  assert.match(harnessSource, /Defaults to the authoritative top spreadsheet tab/)
  assert.doesNotMatch(harnessSource, /from ['"].*(firebase|firestore)|localStorage\.|googleapis|fetch\(['"]https:/i)
})

test('the public preview build publishes only the explicit testing entry points under the repository base path', () => {
  const viteConfig = source('vite.config.ts')
  const previewEnvironment = source('.env.public-preview')
  const packageJson = source('package.json')
  const testingPage = source('testing.html')

  assert.match(viteConfig, /mode === 'public-preview' \? '\/WeeklyDictationApp\/' : '\/'/)
  assert.match(viteConfig, /grade5LearningHub: page\('\.\/grade5-learning-hub\.html'\)/)
  assert.match(viteConfig, /kindergartenLearningLab: page\('\.\/kindergarten-learning-lab\.html'\)/)
  assert.match(viteConfig, /testing: page\('\.\/testing\.html'\)/)
  assert.match(previewEnvironment, /^VITE_PUBLIC_PREVIEW=true\s*$/)
  assert.match(packageJson, /vite build --mode public-preview/)
  assert.match(testingPage, /Open Grade 5/)
  assert.match(testingPage, /Open Kindergarten lab/)
})

test('Kindergarten writing uses the shared PracticeView with an independent strategy', () => {
  const appSource = source('src/App.tsx')
  const harnessSource = source('src/kindergartenLearningLabHarness.tsx')
  const strategySource = source('src/acquisition/strategies/kindergarten.ts')
  const labAdapter = source('src/kindergartenLab/acquisitionLab.ts')
  const registry = source('src/practice/profiles/registry.ts')

  assert.match(appSource, /import type \{ PracticeAnswer \} from '\.\/practice\/PracticeView'/)
  assert.match(appSource, /import\('\.\/practice\/PracticeView\.tsx'\)[\s\S]*module\.PracticeView/)
  assert.match(harnessSource, /import \{ PracticeView, type PracticeAnswer \} from '\.\/practice\/PracticeView\.tsx'/)
  assert.match(harnessSource, /<PracticeView/)
  assert.match(harnessSource, /deferred-writing-test-review/)
  assert.match(labAdapter, /startAcquisition/)
  assert.match(labAdapter, /transitionAcquisition/)
  assert.doesNotMatch(strategySource, /strategies\/grade2|grade2AcquisitionStrategy/)
  assert.match(registry, /kindergartenWritingPracticeProfile/)
  assert.match(appSource, /productionSourceIsActive\(selectedChild\?\.grade, selectedChild\?\.schoolYear\)/)
  assert.doesNotMatch(`${harnessSource}\n${labAdapter}`, /from ['"].*(firebase|firestore)|localStorage\.|createScore|saveSession/i)
})

test('Kindergarten uses the shared four-path hub with games, separate reading paths, review, mastery, and session scores', () => {
  const harnessSource = source('src/kindergartenLearningLabHarness.tsx')
  const hubModel = source('src/kindergartenLab/learningHub.ts')
  const sharedPathNames = source('src/learningHub/activityNames.ts')
  const games = source('src/kindergartenLab/games.tsx')
  const readingPractice = source('src/kindergartenLab/readingPractice.ts')
  const skyWriting = source('src/skywriting/SkyWriting.tsx')
  const unitReview = source('src/kindergartenLab/unitReview.ts')
  const productionEntries = [source('src/main.tsx'), source('src/App.tsx'), source('src/practice/profiles/registry.ts')].join('\n')

  assert.match(harnessSource, /<LearningHub model=\{hubModel\}/)
  assert.match(harnessSource, /selectWarmupWords/)
  assert.match(harnessSource, /NinjaRecord/)
  assert.match(harnessSource, /<Tier2ReadingPractice/)
  assert.match(harnessSource, /kindergartenReadingAcquisitionPathway/)
  assert.match(harnessSource, /kindergartenReadingReviewPathway/)
  assert.match(harnessSource, /kindergartenReadingMasteryPathway/)
  assert.match(harnessSource, /from '\.\/skywriting\/index\.ts'/)
  assert.match(sharedPathNames, /Enter the Dojo/)
  assert.match(sharedPathNames, /Practice your Ninja Skills/)
  assert.match(sharedPathNames, /The Final Boss Test/)
  assert.match(sharedPathNames, /Enter the Spirit Realm/)
  assert.match(games, /Listening Lily Pads/)
  assert.match(games, /Memory Lanterns/)
  assert.doesNotMatch(games, /Sky Writing/)
  assert.match(skyWriting, /Sky Writing/)
  assert.match(readingPractice, /dataset\.vocabulary!\.tier2/)
  assert.match(unitReview, /explicit development fixture/i)
  assert.match(unitReview, /__kindergarten-unit-1-review-lab__/)
  assert.doesNotMatch(productionEntries, /KINDERGARTEN_UNIT_ONE_LAB_FIXTURE|kindergartenUnitReviewForLab/)
  assert.doesNotMatch(`${harnessSource}\n${hubModel}\n${games}\n${readingPractice}\n${skyWriting}\n${unitReview}`, /from ['"].*(firebase|firestore)|localStorage\.|googleapis/i)
})

test('the shared PracticeView timer override is optional and leaves production callers unchanged', () => {
  const practiceView = source('src/practice/PracticeView.tsx')
  const appSource = source('src/App.tsx')

  assert.match(practiceView, /timerSecondsOverride\?: number/)
  assert.match(practiceView, /acquisitionPrompt\?\.timerSeconds \|\| timerSecondsOverride \|\| timerSecondsFor/)
  assert.doesNotMatch(appSource, /timerSecondsOverride/)
})
