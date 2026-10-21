import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import { validateWeeklyDatasetCandidate } from '../src/curriculum/canonical.ts'
import { datasetFromCanonicalCandidate } from '../src/curriculum/datasetProjection.ts'
import type { OwnerAssessmentPayload, SlidesPresentationPayload } from '../src/curriculum/model.ts'
import { type CurriculumSnapshot, inspectSnapshot, validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { TARGETS } from '../src/grade5PresentationPreview/assessmentData.ts'
import {
  buildGrade5AssessmentPayload,
  extractGrade5Assessment,
  GRADE5_ASSESSMENT_SOURCE_ID,
  isGrade5AssessmentCandidate,
} from '../src/grade5PresentationPreview/assessmentSource.ts'
import { grade5PresentationPreview } from '../src/grade5PresentationPreview/policy.ts'
import { learningModuleCapability, learningModuleCohortFromCandidate } from '../src/ninjaSkills/content.ts'
import { NINJA_SKILLS_PROFILES } from '../src/ninjaSkills/profiles.ts'

function baselineSnapshot(): CurriculumSnapshot & { payload: SlidesPresentationPayload } {
  return JSON.parse(readFileSync(new URL('./fixtures/dojo-launch-2026-10-16/grade5.json', import.meta.url), 'utf8'))
}

test('approved PDF source retains the actual baseline and shares exactly eight ordered reading/writing targets', () => {
  const baseline = baselineSnapshot().payload
  const before = structuredClone(baseline)
  const payload = buildGrade5AssessmentPayload(baseline)
  const extraction = extractGrade5Assessment(payload)
  const assessment = extraction.classification.selectedCandidates.find(isGrade5AssessmentCandidate)!
  assert.deepEqual(payload.baseline, before)
  assert.notEqual(payload.baseline, baseline)
  assert.deepEqual(baseline, before)
  assert.deepEqual(validateWeeklyDatasetCandidate(assessment), [])
  assert.equal(assessment.status, 'valid')
  assert.equal(assessment.datasetId, 'grade-5__2026-27__2026-10-19__2026-10-23')
  assert.equal(assessment.source.sourceType, 'owner-assessment')
  assert.equal(assessment.source.sourceDocumentId, GRADE5_ASSESSMENT_SOURCE_ID)
  assert.deepEqual(
    assessment.tier1.map((target) => target.text),
    TARGETS.map((target) => target.text),
  )
  assert.deepEqual(
    assessment.tier2.map((target) => target.text),
    TARGETS.map((target) => target.text),
  )
  assert.notEqual(assessment.tier1[0].targetOccurrenceId, assessment.tier2[0].targetOccurrenceId)
  for (const [index, target] of TARGETS.entries()) {
    const expected = {
      meaning: target.meaning,
      pinyinText: target.pinyin,
      context: { sentence: target.sentence, tokens: [...target.tokens] },
    }
    assert.deepEqual(assessment.tier1[index].learningModule, expected)
    assert.deepEqual(assessment.tier2[index].learningModule, expected)
    assert.equal(expected.context.tokens.join(''), target.sentence)
  }
})

test('original historical weeks, resource links and progression remain available with scheduled PDF activation', () => {
  const payload = buildGrade5AssessmentPayload(baselineSnapshot().payload)
  const before = extractGrade5Presentation(payload.baseline)
  const after = extractGrade5Assessment(payload)
  assert.deepEqual(
    after.classification.selectedCandidates.filter((candidate) => !isGrade5AssessmentCandidate(candidate)),
    before.classification.selectedCandidates,
  )
  assert.deepEqual(after.resources, before.resources)
  assert.deepEqual(after.progressionEvidence.slice(0, -1), before.progressionEvidence)
  assert.equal(after.progressionEvidence.at(-1)?.effectiveDate, '2026-10-19')
  assert.equal(after.progressionEvidence.at(-1)?.source.sourceType, 'owner-assessment')
})

test('game capabilities use only the approved eight meanings and exact source sentences', () => {
  const extraction = extractGrade5Assessment(buildGrade5AssessmentPayload(baselineSnapshot().payload))
  const candidate = extraction.classification.selectedCandidates.find(isGrade5AssessmentCandidate)!
  const cohort = learningModuleCohortFromCandidate(candidate)!
  const profile = NINJA_SKILLS_PROFILES['Grade 5']
  const sushi = learningModuleCapability('sentence-scramble', cohort, {
    ...profile,
    maximumItems: { ...profile.maximumItems, 'sentence-scramble': 8 },
  })
  assert.equal(sushi.status, 'ready')
  if (sushi.status !== 'ready' || sushi.pack.moduleId !== 'sentence-scramble') throw new Error('Missing approved game')
  assert.deepEqual(
    cohort.terms.filter((term) => term.tier === 'tier-1').map((term) => [term.text, term.meaning]),
    TARGETS.map((target) => [target.text, target.meaning]),
  )
  assert.equal(sushi.pack.rounds.length, 8)
  assert.deepEqual(
    sushi.pack.rounds.map((round) => round.targetText),
    TARGETS.map((target) => target.sentence),
  )
})

test('source identity, ordering, definitions, sentence text and token boundaries cannot drift from approval', () => {
  const original = buildGrade5AssessmentPayload(baselineSnapshot().payload)
  const edits: Array<(payload: OwnerAssessmentPayload) => void> = [
    (p) => {
      p.documentId = 'another-document'
    },
    (p) => {
      p.page = 1
    },
    (p) => {
      p.startDate = '2026-10-12'
    },
    (p) => {
      p.endDate = '2026-10-30'
    },
    (p) => {
      p.assessmentId = 'unapproved'
    },
    (p) => {
      p.baseline.presentationId = 'another-deck'
    },
    (p) => {
      p.baseline.slides = []
    },
    (p) => {
      p.targets.pop()
    },
    (p) => {
      p.targets.reverse()
    },
    (p) => {
      p.targets[0].meaning = 'changed'
    },
    (p) => {
      p.targets[0].pinyin = 'changed'
    },
    (p) => {
      p.targets[3].sentence = p.targets[3].sentence.replace('是', '')
    },
    (p) => {
      p.targets[0].tokens = [p.targets[0].sentence]
    },
  ]
  for (const edit of edits) {
    const payload = structuredClone(original)
    edit(payload)
    assert.throws(() => extractGrade5Assessment(payload), /approved|baseline/)
  }
})

test('ordinary curriculum validation keeps the PDF source disabled and verifies the composite checksum', async () => {
  assert.equal(grade5PresentationPreview, false)
  const original = baselineSnapshot()
  const payload = buildGrade5AssessmentPayload(original.payload)
  const snapshot: CurriculumSnapshot = {
    ...original,
    sourceId: GRADE5_ASSESSMENT_SOURCE_ID,
    payload,
    contentSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  }
  assert.throws(() => inspectSnapshot(snapshot), /source identity/)
  await assert.rejects(validateCurriculum(JSON.stringify(snapshot), 'Grade 5'), /source identity/)
  payload.targets[0].meaning = 'tampered'
  await assert.rejects(validateCurriculum(JSON.stringify(snapshot), 'Grade 5'), /checksum/)
  const ordinary = await validateCurriculum(JSON.stringify(original), 'Grade 5')
  assert.deepEqual(
    ordinary.datasets,
    ordinary.candidates
      .filter((candidate) => candidate.status === 'valid')
      .map((candidate) => datasetFromCanonicalCandidate(candidate)),
  )
  assert.ok(ordinary.datasets.every((dataset) => dataset.source?.sourceType === 'google-slides'))
})

test('enabled presentation validates the real snapshot and builds repeatable eight-word native games', async () => {
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'import.meta.env.VITE_GRADE5_PRESENTATION_PREVIEW': JSON.stringify('true') },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('./fixtures/grade5PresentationRuntime.ts', import.meta.url)),
        formats: ['es'],
      },
    },
  })
  const outputs = Array.isArray(built) ? built : [built]
  const chunk = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((output) => output.type === 'chunk' && output.isEntry)
  assert.ok(chunk && chunk.type === 'chunk')
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`)
  assert.equal(runtime.grade5PresentationPreview, true)
  const original = baselineSnapshot()
  const payload = buildGrade5AssessmentPayload(original.payload)
  const snapshot: CurriculumSnapshot = {
    ...original,
    sourceId: GRADE5_ASSESSMENT_SOURCE_ID,
    payload,
    contentSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  }
  const loaded = await runtime.validateCurriculum(JSON.stringify(snapshot), 'Grade 5')
  const dataset = loaded.datasets.find(
    (item: { source?: { sourceType: string } }) => item.source?.sourceType === 'owner-assessment',
  )
  assert.ok(dataset)
  assert.deepEqual(
    dataset.words.map((word: { sentence: string }) => word.sentence),
    TARGETS.map((target) => target.sentence),
  )
  const cohort = runtime.learningModuleCohortFromDatasets('assessment', 'October 23', [dataset])
  for (const visit of [0, 1, 2]) {
    const match = runtime.learningModuleCapability(
      'speed-match',
      cohort,
      runtime.NINJA_SKILLS_PROFILES['Grade 5'],
      visit,
    )
    assert.equal(match.status, 'ready')
    assert.equal(match.pack.pairs.length, 8)
    assert.deepEqual(
      match.pack.pairs.map((pair: { left: { label: string }; right: { label: string } }) => [
        pair.left.label,
        pair.right.label,
      ]),
      TARGETS.map((target) => [target.text, target.meaning]),
    )
  }
  const changed = structuredClone(snapshot)
  changed.grade = 'Grade 2'
  assert.throws(() => runtime.inspectSnapshot(changed), /source identity/)
})
