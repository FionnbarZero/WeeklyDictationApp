import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SheetsWorkbookPayload, SlidesPresentationPayload } from '../src/curriculum/model.ts'
import { inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'
import {
  beginWritingStroke,
  cancelWritingStroke,
  clearWritingPad,
  emptyWritingPadState,
  endWritingStroke,
  extendWritingStroke,
  normalizedWritingPoint,
  pauseTapWritingStroke,
  setWritingPadTypedText,
  undoWritingStroke,
  writingPadHasInk,
} from '../src/skywriting/model.ts'
import { grade5SkyWritingAcquisitionAudioSequence, grade5SkyWritingAcquisitionSample } from '../src/skywriting/grade5AcquisitionSample.ts'
import { skyWritingCrossGradeSample } from '../src/skywriting/harnessSample.ts'
import { grade2DeckProfile, importWeeklyDatasets } from '../src/slidesImporter.ts'

const first = { x: 0.2, y: 0.3 }
const second = { x: 0.5, y: 0.7 }

test('writing coordinates are normalized and clamped to the visible pad', () => {
  const bounds = { left: 100, top: 50, width: 400, height: 200 }
  assert.deepEqual(normalizedWritingPoint(300, 150, bounds), { x: 0.5, y: 0.5 })
  assert.deepEqual(normalizedWritingPoint(20, 400, bounds), { x: 0, y: 1 })
})

test('press-and-drag collects one in-memory stroke until release', () => {
  let state = beginWritingStroke(emptyWritingPadState, first, 'press-and-drag')
  state = extendWritingStroke(state, second)
  assert.equal(writingPadHasInk(state), true)
  assert.deepEqual(state.activeStroke, [first, second])

  state = endWritingStroke(state, 'press-and-drag')
  assert.equal(state.activeStroke, null)
  assert.deepEqual(state.strokes, [[first, second]])
})

test('trackpad mode splits strokes on a brief lift and stays ready for the next stroke', () => {
  let state = beginWritingStroke(emptyWritingPadState, first, 'tap-to-draw')
  assert.equal(state.tapDrawing, true)
  state = extendWritingStroke(state, second)
  state = pauseTapWritingStroke(state)
  assert.equal(state.tapDrawing, true)
  assert.equal(state.activeStroke, null)
  assert.deepEqual(state.strokes, [[first, second]])

  const nextStrokeStart = { x: 0.7, y: 0.2 }
  state = extendWritingStroke(state, nextStrokeStart)
  assert.deepEqual(state.activeStroke, [nextStrokeStart])

  state = beginWritingStroke(state, nextStrokeStart, 'tap-to-draw')
  assert.equal(state.tapDrawing, false)
  assert.deepEqual(state.strokes, [[first, second], [nextStrokeStart]])
})

test('interruption, undo, and clear leave no active pencil state behind', () => {
  let state = beginWritingStroke(emptyWritingPadState, first, 'tap-to-draw')
  state = extendWritingStroke(state, second)
  state = cancelWritingStroke(state)
  assert.equal(state.tapDrawing, false)
  assert.equal(state.strokes.length, 1)

  state = undoWritingStroke(state)
  assert.equal(writingPadHasInk(state), false)
  assert.deepEqual(clearWritingPad(), emptyWritingPadState)
})

test('a keyboard or switch-input response counts as in-memory writing and clears safely', () => {
  const typed = setWritingPadTypedText(emptyWritingPadState, '需要')
  assert.equal(writingPadHasInk(typed), true)
  assert.equal(typed.typedText, '需要')
  assert.deepEqual(setWritingPadTypedText(typed, ''), emptyWritingPadState)
  assert.deepEqual(clearWritingPad(), emptyWritingPadState)
})

test('Sky Writing is a standalone source module with no Kindergarten or persistence dependency', () => {
  const entry = readFileSync(new URL('../src/skywriting/index.ts', import.meta.url), 'utf8')
  const activity = readFileSync(new URL('../src/skywriting/SkyWriting.tsx', import.meta.url), 'utf8')
  const acquisition = readFileSync(new URL('../src/skywriting/skywritingacquisition.tsx', import.meta.url), 'utf8')
  const component = readFileSync(new URL('../src/skywriting/WritingPad.tsx', import.meta.url), 'utf8')
  const model = readFileSync(new URL('../src/skywriting/model.ts', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/skywriting/skywriting.css', import.meta.url), 'utf8')
  const moduleSource = `${entry}\n${activity}\n${acquisition}\n${component}\n${model}`

  assert.match(entry, /export \{ SkyWriting \}/)
  assert.match(entry, /export \{ WritingPad \}/)
  assert.match(entry, /export \{ SkyWritingAcquisition \}/)
  assert.match(component, /onPointerDown/)
  assert.match(component, /onPointerCancel/)
  assert.match(component, /writingLanes/)
  assert.match(component, /traceText\?: string/)
  assert.match(component, /traceFont\?: WritingPadTraceFont/)
  assert.match(component, /padState\?: WritingPadState/)
  assert.match(component, /onPadStateChange\?: \(update: WritingPadStateUpdater\)/)
  assert.match(component, /!hasInk && !traceText/)
  assert.match(component, /skywriting-trace-character/)
  assert.match(component, /const point = eventPoint\(event\)[\s\S]*beginWritingStroke\(current, point/)
  assert.doesNotMatch(component, /setPad\([^\n]*eventPoint\(event\)/)
  assert.match(activity, /<SkyWritingAcquisition/)
  assert.match(activity, /skywriting-promptbar/)
  assert.match(acquisition, /phase: SkyWritingAcquisitionPhase/)
  assert.match(acquisition, /skywriting-workspace skywriting-acquisition/)
  assert.match(acquisition, /data-character-count=\{characterCount\}/)
  assert.match(acquisition, /characterCount=\{characterCount\}/)
  assert.match(acquisition, /traceText=\{reviewing \|\| !traceTarget \? undefined : word\}/)
  assert.match(acquisition, /traceFont="songti"/)
  assert.match(acquisition, /padState=\{padState\}/)
  assert.match(acquisition, /onPadStateChange=\{onPadStateChange\}/)
  assert.match(acquisition, /Your writing/)
  assert.match(acquisition, /Correct word/)
  assert.doesNotMatch(acquisition, /setTimeout|speechSynthesis|\bspeak\b|PromptCountdown/)
  assert.doesNotMatch(activity, /Air or paper|Write on screen/)
  assert.doesNotMatch(component, /Trackpad lift mode/)
  assert.match(styles, /touch-action: none/)
  assert.match(styles, /font-family: "Songti SC", STSong, SimSun, serif/)
  assert.match(styles, /font-weight: 300/)
  assert.match(styles, /font-size: clamp\(18rem, 25vw, 22rem\)/)
  assert.match(styles, /height: 100dvh/)
  assert.match(styles, /overflow: hidden/)
  assert.match(styles, /\.skywriting-pad-frame \{[^}]*height: 100%/)
  assert.doesNotMatch(moduleSource, /kindergartenLab|localStorage|sessionStorage|indexedDB|fetch\(|firebase|firestore|XMLHttpRequest/i)
})

test('every shared Tier 1 writing activity uses the Songti Sky Writing response', () => {
  const practiceView = readFileSync(new URL('../src/practice/PracticeView.tsx', import.meta.url), 'utf8')
  const testReviewCollector = readFileSync(new URL('../src/testReview/WritingResponseCollector.tsx', import.meta.url), 'utf8')
  const finalReview = readFileSync(new URL('../src/testReview/FinalReviewPage.tsx', import.meta.url), 'utf8')
  const productionApp = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const kindergarten = readFileSync(new URL('../src/kindergartenLearningLabHarness.tsx', import.meta.url), 'utf8')
  const grade5 = readFileSync(new URL('../src/grade5LearningHubHarness.tsx', import.meta.url), 'utf8')

  assert.match(practiceView, /import \{ SkyWritingAcquisition, emptyWritingPadState/)
  assert.match(practiceView, /phase="writing" traceTarget=\{showCopy\}/)
  assert.match(practiceView, /phase="review" traceTarget=\{showCopy\}/)
  assert.match(practiceView, /session\.segment.*session\.primaryPhase/)
  assert.match(practiceView, /setWritingByResponse/)
  assert.match(practiceView, /writingByResponse\[writingResponseId\]/)
  assert.match(practiceView, /Your writing stays on this device only\./)
  assert.doesNotMatch(practiceView, /write the word on paper|check your paper/i)
  assert.match(testReviewCollector, /<SkyWritingAcquisition/)
  assert.match(testReviewCollector, /phase="writing"/)
  assert.match(finalReview, /<SkyWritingAcquisition/)
  assert.match(finalReview, /phase="review"/)
  assert.doesNotMatch(`${testReviewCollector}\n${finalReview}`, /write the response on paper|check your paper/i)
  assert.match(productionApp, /<PracticeView\s+session=\{session\}/)
  assert.match(kindergarten, /<PracticeView/)
  assert.match(grade5, /<PracticeView/)
})

test('the cross-grade harness uses exactly ten distinct source-derived Tier 1 targets', () => {
  const kindergartenPayload = JSON.parse(readFileSync(new URL('./fixtures/kindergarten-workbook.json', import.meta.url), 'utf8')) as SheetsWorkbookPayload
  const grade2Payload = JSON.parse(readFileSync(new URL('./fixtures/grade2-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
  const grade5Payload = JSON.parse(readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
  const sourcePools = new Map([
    ['Kindergarten', new Set(inspectKindergartenWorkbook(kindergartenPayload).flatMap((candidate) => candidate.tier1.map((target) => target.text)))],
    ['Grade 2', new Set(importWeeklyDatasets(grade2Payload, [], grade2DeckProfile).datasets.flatMap((dataset) => dataset.words.map((word) => word.text)))],
    ['Grade 5', new Set(extractGrade5Presentation(grade5Payload).candidates.flatMap((candidate) => candidate.tier1.map((target) => target.text)))],
  ])

  assert.equal(skyWritingCrossGradeSample.length, 10)
  assert.equal(new Set(skyWritingCrossGradeSample.map((target) => target.text)).size, 10)
  assert.ok(skyWritingCrossGradeSample.some((target) => [...target.text].length >= 4), 'The sample must exercise a complex multi-character word.')
  assert.deepEqual(Object.fromEntries(['Kindergarten', 'Grade 2', 'Grade 5'].map((grade) => [grade, skyWritingCrossGradeSample.filter((target) => target.grade === grade).length])), {
    Kindergarten: 3,
    'Grade 2': 4,
    'Grade 5': 3,
  })
  for (const target of skyWritingCrossGradeSample) assert.equal(sourcePools.get(target.grade)?.has(target.text), true, `${target.text} must come from the ${target.grade} Tier 1 fixture`)
})

test('the cross-grade harness is development-only, session-only, and runs all ten targets', () => {
  const html = readFileSync(new URL('../skywriting-harness.html', import.meta.url), 'utf8')
  const harness = readFileSync(new URL('../src/skywritingHarness.tsx', import.meta.url), 'utf8')
  const productionEntries = [
    readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ].join('\n')

  assert.match(html, /skywriting-harness-root/)
  assert.match(html, /src\/skywritingHarness\.tsx/)
  assert.match(harness, /import\.meta\.env\.DEV/)
  assert.match(harness, /maxRounds=\{skyWritingCrossGradeSample\.length\}/)
  assert.match(harness, /result\.assessments/)
  assert.match(harness, /get\('start'\) === 'writing'/)
  assert.doesNotMatch(productionEntries, /skywritingHarness|skywriting-harness/)
  assert.doesNotMatch(harness, /localStorage|sessionStorage|indexedDB|fetch\(|firebase|firestore|XMLHttpRequest/i)
})

test('the Sky Writing Acquisition prototype uses exactly three source-derived Grade 5 Tier 1 targets', () => {
  const payload = JSON.parse(readFileSync(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8')) as SlidesPresentationPayload
  const sourceWords = new Set(extractGrade5Presentation(payload).candidates.flatMap((candidate) => candidate.tier1.map((target) => target.text)))

  assert.equal(grade5SkyWritingAcquisitionSample.length, 3)
  assert.equal(new Set(grade5SkyWritingAcquisitionSample.map((target) => target.text)).size, 3)
  assert.ok(grade5SkyWritingAcquisitionSample.some((target) => [...target.text].length >= 4))
  for (const target of grade5SkyWritingAcquisitionSample) {
    assert.equal(target.sourceFixture, 'grade5-presentation.json')
    assert.equal(sourceWords.has(target.text), true, `${target.text} must be a Grade 5 Tier 1 fixture target`)
    assert.deepEqual(grade5SkyWritingAcquisitionAudioSequence(target), [target.text, target.prototypeSentence, target.text, target.text])
  }
})

test('the Grade 5 Sky Writing Acquisition harness is development-only and controls the response phase externally', () => {
  const html = readFileSync(new URL('../skywriting-acquisition-harness.html', import.meta.url), 'utf8')
  const harness = readFileSync(new URL('../src/skywritingAcquisitionHarness.tsx', import.meta.url), 'utf8')
  const productionEntries = [
    readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ].join('\n')

  assert.match(html, /skywriting-acquisition-harness-root/)
  assert.match(html, /src\/skywritingAcquisitionHarness\.tsx/)
  assert.match(harness, /import\.meta\.env\.DEV/)
  assert.match(harness, /<SkyWritingAcquisition/)
  assert.match(harness, /setPhase\('review'\)/)
  assert.match(harness, /grade5SkyWritingAcquisitionSample/)
  assert.match(harness, /playAcquisitionSequence/)
  assert.doesNotMatch(productionEntries, /skywritingAcquisitionHarness|skywriting-acquisition-harness/)
  assert.doesNotMatch(harness, /localStorage|sessionStorage|indexedDB|fetch\(|firebase|firestore|XMLHttpRequest/i)
})

test('the development font study compares Songti SC Light and Kaiti SC Regular with identical targets', () => {
  const html = readFileSync(new URL('../skywriting-font-comparison.html', import.meta.url), 'utf8')
  const comparison = readFileSync(new URL('../src/skywritingFontComparison.tsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/skywritingFontComparison.css', import.meta.url), 'utf8')
  const moduleStyles = readFileSync(new URL('../src/skywriting/skywriting.css', import.meta.url), 'utf8')
  const productionEntries = [
    readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ].join('\n')

  assert.match(html, /skywriting-font-comparison-root/)
  assert.match(comparison, /grade5SkyWritingAcquisitionSample\.map/)
  assert.match(comparison, /Songti SC Light/)
  assert.match(comparison, /Kaiti SC Regular/)
  assert.match(comparison, /<WritingPad/)
  assert.match(comparison, /traceFont=\{font\.id\}/)
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(moduleStyles, /font-family: "Songti SC", STSong, SimSun, serif;[^}]*font-weight: 300/)
  assert.match(moduleStyles, /font-family: "Kaiti SC", STKaiti, KaiTi, serif;[^}]*font-weight: 400/)
  assert.doesNotMatch(productionEntries, /skywritingFontComparison|skywriting-font-comparison/)
})
