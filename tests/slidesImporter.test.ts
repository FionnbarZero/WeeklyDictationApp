import assert from 'node:assert/strict'
import test from 'node:test'
import { dateRangeFromText, datasetIdFor, extractTier1, importLatestWeeklyDataset, importWeeklyDatasets, parseSlide, grade2DeckProfile, grade5DeckProfile } from '../src/slidesImporter.ts'

test('grade 5 profile keeps the legacy parenthesized date format', () => {
  assert.deepEqual(dateRangeFromText('Week 6 (9/14-18)', grade5DeckProfile), { startDate: '2026-09-14', endDate: '2026-09-18', dateRange: '9/14–9/18' })
})

test('grade 2 profile accepts the live deck date format', () => {
  assert.deepEqual(dateRangeFromText('Week 9/21-9/25', grade2DeckProfile), { startDate: '2026-09-21', endDate: '2026-09-25', dateRange: '9/21–9/25' })
})

test('tier 1 extraction keeps multi-character terms and ignores tiers 2 and 3', () => {
  const text = 'Week 6 (9/14-18)\nMandarin\nThis week: students practiced sentence structures.\nTier 1：怎样、吸收、通过、像、如果\nTier 2：空气、根\nTier 3：光合作用、二氧化碳\nELA'
  assert.deepEqual(extractTier1(text, grade5DeckProfile), ['怎样', '吸收', '通过', '像', '如果'])
})

test('stable dataset IDs use the normalized school year token and permanent dates', () => {
  assert.equal(datasetIdFor(grade2DeckProfile, { startDate: '2026-09-14', endDate: '2026-09-18' }), 'grade-2__2026-27__2026-09-14__2026-09-18')
})

test('incomplete weekly slides are import errors, not workshops', () => {
  const result = parseSlide({ objectId: 'week-2', text: 'Week 2\nMandarin\nContent\nVocabulary\nSentence Frame' }, grade2DeckProfile)
  assert.equal(result.status, 'error')
  assert.match(result.message, /date-range|weekly heading/i)
})

test('explicit writing-workshop markers create a placeholder outcome', () => {
  const result = parseSlide({ objectId: 'workshop', text: 'Week 10/6-10/10\nMandarin\nWriting Workshop\nNo new Tier 1 targets' }, grade2DeckProfile)
  assert.equal(result.status, 'writing-workshop')
  assert.equal(result.dataset?.words.length, 0)
  assert.equal(result.dataset?.isWritingWorkshop, true)
})

test('all valid Grade 2 weekly slides are preserved as separate datasets', () => {
  const presentation = { slides: [
    { objectId: 'g40a01d2cf58_0_10', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如，部分，更，方便，美好\nTier 2: 城市，上班，公园' },
    { objectId: 'g40a01d2cf58_0_0', text: 'Week 9/14-9/18\nMandarin\nTier 1: 出生、但是、运动、地方、不同\nTier 2: 身体、手' },
    { objectId: 'g3fa28218657_0_10', text: 'Week 9/8-9/11\nMandarin\nTier 1: 美国，带，路，到，都\nTier 2: 帮助，找' },
    { objectId: 'g3fa28218657_0_0', text: 'Week 8/31-9/4\nMandarin\nTier 1: 很短、也、笑、学校、说\nTier 2: 爱心、难过' },
  ] }
  const batch = importWeeklyDatasets(presentation, [], grade2DeckProfile)
  assert.equal(batch.status, 'ok')
  assert.equal(batch.datasets.length, 4)
  assert.deepEqual(batch.datasets.map((dataset) => dataset.dateRange), ['8/31–9/4', '9/8–9/11', '9/14–9/18', '9/21–9/25'])
  assert.deepEqual(batch.datasets.map((dataset) => dataset.words.length), [5, 5, 5, 5])
  assert.ok(batch.datasets.every((dataset) => dataset.grade === 'Grade 2' && dataset.schoolYear === '2026–2027'))
})

test('malformed slides are skipped without replacing valid datasets', () => {
  const batch = importWeeklyDatasets({ slides: [
    { objectId: 'valid', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如，部分，更，方便，美好' },
    { objectId: 'malformed', text: 'Week 9/28-10/2\nMandarin\nWriting ideas only' },
  ] }, [], grade2DeckProfile)
  assert.equal(batch.datasets.length, 1)
  assert.equal(batch.outcomes.find((outcome) => outcome.sourceSlideId === 'malformed')?.status, 'error')
})

test('a mismatched presentation identity is rejected before dataset validation', () => {
  const batch = importWeeklyDatasets({ presentationId: 'wrong-deck', slides: [{ objectId: 'valid', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如，部分，更，方便，美好' }] }, [], grade2DeckProfile)
  assert.equal(batch.status, 'error')
  assert.equal(batch.datasets.length, 0)
  assert.match(batch.message, /source deck identity/i)
})

test('newest valid weekly slide wins in compatibility mode and duplicate imports are idempotent', () => {
  const presentation = { slides: [
    { objectId: 'new', text: 'Week 9/21-9/25\nMandarin\nTier 1：比如、部分、更、方便、美好' },
    { objectId: 'old', text: 'Week 9/14-9/18\nMandarin\nTier 1：出生、但是、运动、地方、不同' },
  ] }
  const imported = importLatestWeeklyDataset(presentation, [], grade2DeckProfile)
  assert.equal(imported.status, 'imported')
  assert.equal(imported.sourceSlideId, 'new')
  assert.equal(importLatestWeeklyDataset(presentation, [imported.datasetId!], grade2DeckProfile).status, 'duplicate')
})

test('Google Slides API text runs are traversed from page elements', () => {
  const result = importLatestWeeklyDataset({ slides: [{ objectId: 'api-slide', pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Week 9/21-9/25\nMandarin\nTier 1：比如、部分、更、方便、美好' } }] } } }] }] }, [], grade2DeckProfile)
  assert.equal(result.status, 'imported')
  assert.deepEqual(result.dataset?.words.map((word) => word.text), ['比如', '部分', '更', '方便', '美好'])
})
