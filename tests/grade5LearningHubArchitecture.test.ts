import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('the Grade 5 learning hub remains development-only and outside production entry points', () => {
  const productionEntries = [source('index.html'), source('src/main.tsx'), source('src/App.tsx')].join('\n')
  const harnessHtml = source('grade5-learning-hub.html')
  const harnessSource = source('src/grade5LearningHubHarness.tsx')
  const hubModel = source('src/grade5Lab/learningHub.ts')

  assert.doesNotMatch(productionEntries, /grade5-learning-hub|grade5LearningHubHarness|grade5Lab\/learningHub/)
  assert.match(harnessHtml, /id="grade5-learning-hub-root"/)
  assert.match(harnessHtml, /id="lab-details" class="lab-details"/)
  assert.match(harnessHtml, /src\/grade5LearningHubHarness\.tsx/)
  assert.match(harnessSource, /import\.meta\.env\.DEV/)
  assert.match(harnessSource, /tests\/fixtures\/grade5-presentation\.json/)
  assert.doesNotMatch(`${harnessSource}\n${hubModel}`, /firebase|firestore|localStorage|googleapis/i)
  assert.doesNotMatch(hubModel, /from ['"]\.\.\/App|from ['"]\.\.\/domain/)
})

test('the Grade 5 landing experience uses the shared child-facing visual language', () => {
  const harnessHtml = source('grade5-learning-hub.html')
  const harnessSource = source('src/grade5LearningHubHarness.tsx')
  const sharedHub = source('src/learningHub/LearningHub.tsx')
  const sharedStyles = source('src/learningHub/learningHub.css')
  const grade5View = source('src/grade5Lab/learningHubView.ts')

  assert.match(harnessHtml, /src\/learningHub\/learningHub\.css/)
  assert.match(harnessSource, /import \{ LearningHub \} from '\.\/learningHub\/LearningHub\.tsx'/)
  assert.match(harnessSource, /<LearningHub model=\{grade5LearningHubView\(learningHubModel\)\}/)
  assert.match(sharedHub, /Ready for your next|model\.title/)
  assert.match(sharedHub, /learning-hub-source-details/)
  assert.match(grade5View, /Choose your path/)
  assert.match(sharedStyles, /\.learning-hub-section-grid/)
  assert.match(sharedStyles, /\.learning-hub-section-card/)
  assert.match(sharedStyles, /\.learning-hub-activity/)
  assert.doesNotMatch(harnessSource, /renderHubHome|renderSectionDetail|sectionVisuals/)
})

test('the Grade 5 learning hub connects separate Tier 1 writing and Tier 2 reading paths without persistence', () => {
  const harnessSource = source('src/grade5LearningHubHarness.tsx')
  const hubModel = source('src/grade5Lab/learningHub.ts')
  const labAdapter = source('src/grade5Lab/acquisitionLab.ts')
  const writingPractice = source('src/grade5Lab/writingPractice.ts')
  const readingPractice = source('src/grade5Lab/readingPractice.ts')
  const profile = source('src/grade5Lab/practiceProfile.ts')

  assert.match(harnessSource, /not connected yet/i)
  assert.match(harnessSource, /startGrade5AcquisitionLab/)
  assert.match(harnessSource, /<Tier2ReadingPractice/)
  assert.match(harnessSource, /grade5LabReadingPathway/)
  assert.match(harnessSource, /grade5LabWarmupSelection/)
  assert.match(harnessSource, /skip-warmup/)
  assert.match(labAdapter, /startAcquisition/)
  assert.match(labAdapter, /transitionAcquisition/)
  assert.doesNotMatch(writingPractice, /selectWarmupWords|grade2PracticeProfile/)
  assert.match(writingPractice, /classification\.selectedCandidates/)
  assert.match(hubModel, /classification\.selectedCandidates/)
  assert.match(writingPractice, /activityKind === 'test-review'/)
  assert.match(readingPractice, /learningChannel === 'tier-2-reading'/)
  assert.match(readingPractice, /activityKind !== 'reacquisition'/)
  assert.match(profile, /grade5AcquisitionStrategy/)
  assert.doesNotMatch(`${harnessSource}\n${hubModel}\n${labAdapter}\n${writingPractice}\n${readingPractice}\n${profile}`, /firebase|firestore|localStorage|createScore|saveSession/i)
  assert.doesNotMatch(`${hubModel}\n${labAdapter}`, /from ['"]\.\.\/App|from ['"]\.\.\/domain/)
})

test('Grade 2 and the Grade 5 lab render the same shared PracticeView component', () => {
  const harnessHtml = source('grade5-learning-hub.html')
  const harnessSource = source('src/grade5LearningHubHarness.tsx')
  const appSource = source('src/App.tsx')
  const practiceView = source('src/practice/PracticeView.tsx')

  assert.match(harnessHtml, /href="\/src\/styles\.css"/)
  assert.match(harnessHtml, /id="practice-panel" class="grade5-practice-stage" hidden/)
  assert.match(harnessHtml, /id="grade5-practice-root"/)
  assert.match(appSource, /import \{ PracticeView \} from '\.\/practice\/PracticeView'/)
  assert.match(harnessSource, /import \{ PracticeView \} from '\.\/practice\/PracticeView\.tsx'/)
  assert.match(appSource, /<PracticeView session=\{session\}/)
  assert.match(harnessSource, /<PracticeView/)
  assert.match(practiceView, /className="practice-page"/)
  assert.match(practiceView, /<PromptCountdown/)
  assert.doesNotMatch(appSource, /function PracticeView/)
  assert.doesNotMatch(harnessHtml, /class="prompt-card"|class="speaker-orb"|class="answer-actions"/)
  assert.match(harnessSource, /hubRootElement\.hidden = true/)
  assert.match(harnessSource, /session=\{activeSession\}/)
  assert.doesNotMatch(harnessSource, /warmupRequired/)
  assert.match(source('src/grade5Lab/learningHub.css'), /body\.practice-active \.grade5-practice-stage/)
  assert.match(source('src/grade5Lab/learningHub.css'), /position: fixed/)
})

test('every Grade 5 harness element lookup has a matching unique HTML element', () => {
  const harnessHtml = source('grade5-learning-hub.html')
  const harnessSource = source('src/grade5LearningHubHarness.tsx')
  const requiredIds = [...harnessSource.matchAll(/requiredElement<[^>]+>\('([^']+)'\)/g)].map((match) => match[1])
  const htmlIds = [...harnessHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])

  assert.equal(new Set(htmlIds).size, htmlIds.length)
  assert.deepEqual(requiredIds.filter((id) => !htmlIds.includes(id)), [])
})
