import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { listDatasetReferences, writeImportBatch } from '../backend/firestore.ts'
import { runImportJob, type ImportJobDependencies } from '../backend/importJob.ts'
import { presentationLikeFromGoogleResponse } from '../backend/googleSlides.ts'
import { candidateFromSlide, grade2DeckProfile, importWeeklyDatasets, normalizeImportBatchForComparison } from '../src/slidesImporter.ts'

test('Google Slides API responses become importer-shaped presentation payloads', () => {
  const presentation = presentationLikeFromGoogleResponse({ presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'slide-1', pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Week 9/21-9/25' } }] } } }] }] })
  assert.equal(presentation.presentationId, grade2DeckProfile.sourceDeckId)
  assert.equal(presentation.slides?.[0].objectId, 'slide-1')
  assert.equal((presentation.slides?.[0].pageElements?.[0] as { shape: unknown }).shape !== undefined, true)
})

test('read-only backend shadow output matches local importer after volatile-field normalization', async () => {
  const sourceSlides = [
    { objectId: 'valid-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更、方便、美好' },
    { objectId: 'workshop-slide', text: 'Week 10/5-10/9\nMandarin\nWriting Workshop\nNo new Tier 1 targets' },
    { objectId: 'malformed-slide', text: 'Week 9/28-10/2\nMandarin\nWriting ideas only' },
  ]
  const localPresentation = { presentationId: grade2DeckProfile.sourceDeckId, slides: sourceSlides }
  const googlePresentation = presentationLikeFromGoogleResponse({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: sourceSlides.map(({ objectId, text }) => ({ objectId, pageElements: [{ shape: { text: { textElements: [{ textRun: { content: text } }] } } }] })),
  })
  const localBatch = importWeeklyDatasets(localPresentation, [], grade2DeckProfile)
  const result = await runImportJob({ deckId: grade2DeckProfile.sourceDeckId, projectId: 'project', googleOAuth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }, writeEnabled: false }, {
    googleAccessToken: async () => 'slides-token',
    fetchGooglePresentation: async () => googlePresentation,
    firestoreAccessToken: async () => { throw new Error('Firestore must not be accessed by the shadow path.') },
    listDatasetIds: async () => { throw new Error('Firestore dataset reads must not be accessed by the shadow path.') },
    writeImportBatch: async () => { throw new Error('Firestore writes must not be accessed by the shadow path.') },
  })

  assert.equal(result.written, false)
  assert.deepEqual(normalizeImportBatchForComparison(result.batch), normalizeImportBatchForComparison(localBatch))
})

test('comparison normalization ignores imported timestamps but detects content drift', () => {
  const batch = importWeeklyDatasets({ presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'slide-1', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }] }, [], grade2DeckProfile)
  const timestampOnlyChange = { ...batch, datasets: batch.datasets.map((dataset) => ({ ...dataset, importedAt: '2099-01-01T00:00:00.000Z' })) }
  const contentChange = { ...timestampOnlyChange, datasets: timestampOnlyChange.datasets.map((dataset) => ({ ...dataset, words: dataset.words.map((word, index) => index === 0 ? { ...word, text: '不同' } : word) })) }

  assert.deepEqual(normalizeImportBatchForComparison(timestampOnlyChange), normalizeImportBatchForComparison(batch))
  assert.notDeepEqual(normalizeImportBatchForComparison(contentChange), normalizeImportBatchForComparison(batch))
})

function dependencies(calls: string[]): ImportJobDependencies {
  return {
    googleAccessToken: async () => { calls.push('slides-auth'); return 'slides-token' },
    fetchGooglePresentation: async (_deckId, token) => {
      assert.equal(token, 'slides-token')
      return { presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'valid-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分、更、方便、美好' }] }
    },
    firestoreAccessToken: async () => { calls.push('firestore-auth'); return 'firestore-token' },
    listDatasetIds: async (_projectId, token) => { assert.equal(token, 'firestore-token'); return [] },
    writeImportBatch: async (_projectId, token, batch) => {
      calls.push('firestore-write')
      assert.equal(token, 'firestore-token')
      assert.equal(batch.datasets.length, 1)
      return { written: 7, datasetCount: 1, documentCount: 7 }
    },
  }
}

test('backend validation can run without enabling Firestore writes', async () => {
  const calls: string[] = []
  const result = await runImportJob({ deckId: grade2DeckProfile.sourceDeckId, projectId: 'project', googleOAuth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }, writeEnabled: false }, dependencies(calls))
  assert.equal(result.batch.datasets.length, 1)
  assert.equal(result.written, false)
  assert.deepEqual(calls, ['slides-auth'])
})

test('backend writes only after importer validation and uses a separate Firestore credential', async () => {
  const calls: string[] = []
  const result = await runImportJob({ deckId: grade2DeckProfile.sourceDeckId, projectId: 'project', googleOAuth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }, writeEnabled: true }, dependencies(calls))
  assert.equal(result.written, true)
  assert.deepEqual(calls, ['slides-auth', 'firestore-auth', 'firestore-write'])
})

test('a repeated scheduled run becomes an idempotent duplicate no-op', async () => {
  const calls: string[] = []
  const base = dependencies(calls)
  const result = await runImportJob({ deckId: grade2DeckProfile.sourceDeckId, projectId: 'project', googleOAuth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }, writeEnabled: true }, {
    ...base,
    listDatasetIds: async (_projectId, token) => { assert.equal(token, 'firestore-token'); return ['grade-2__2026-27__2026-09-21__2026-09-25'] },
    writeImportBatch: async (_projectId, token, batch) => { calls.push('firestore-write'); assert.equal(token, 'firestore-token'); assert.equal(batch.datasets.length, 0); assert.equal(batch.outcomes[0].status, 'duplicate'); return { written: 1, datasetCount: 0, documentCount: 1 } },
  })
  assert.equal(result.written, true)
  assert.equal(result.batch.status, 'ok')
  assert.deepEqual(calls, ['slides-auth', 'firestore-auth', 'firestore-write'])
})

test('the trusted command-line write path reads full dataset references', () => {
  const source = readFileSync(new URL('../scripts/import-slides.ts', import.meta.url), 'utf8')
  assert.match(source, /listDatasetReferences/)
  assert.doesNotMatch(source, /listDatasetIds/)
})

test('stored canonical metadata is read for cross-run conflict detection', async () => {
  const references = await listDatasetReferences('project', 'token', async () => new Response(JSON.stringify({
    documents: [{
      name: 'projects/project/databases/(default)/documents/datasets/grade-2__2026-27__2026-09-21__2026-09-25',
      fields: {
        contentFingerprint: { stringValue: 'v2-fnv1a64-stored' },
        candidateStatus: { stringValue: 'valid' },
        instructionalRole: { stringValue: 'weekly-acquisition' },
      },
    }],
  }), { status: 200 }))

  assert.deepEqual(references, [{
    datasetId: 'grade-2__2026-27__2026-09-21__2026-09-25',
    contentFingerprint: 'v2-fnv1a64-stored',
    candidateStatus: 'valid',
    instructionalRole: 'weekly-acquisition',
  }])
})

test('trusted dataset writes persist the canonical fingerprint used by later runs', async () => {
  const batch = importWeeklyDatasets({ presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'persisted', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }] }, [], grade2DeckProfile)
  const commits: Array<Record<string, unknown>> = []
  await writeImportBatch('project', 'token', batch, async (_input, init) => {
    commits.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response('{}', { status: 200 })
  })
  const writes = commits.flatMap((commit) => commit.writes as Array<{ update: { name: string; fields: Record<string, { stringValue?: string }> } }>)
  const datasetWrite = writes.find((write) => write.update.name.endsWith(`/datasets/${batch.datasets[0].id}`))

  assert.equal(datasetWrite?.update.fields.contentFingerprint.stringValue, batch.outcomes[0].contentFingerprint)
  assert.equal(datasetWrite?.update.fields.candidateStatus.stringValue, 'valid')
  assert.equal(datasetWrite?.update.fields.instructionalRole.stringValue, 'weekly-acquisition')
})

test('confirming a stored preview refreshes metadata without rewriting vocabulary', async () => {
  const current = candidateFromSlide({ objectId: 'current-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const batch = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [{ objectId: 'current-slide', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' }],
  }, [{ datasetId: current.datasetId!, contentFingerprint: current.contentFingerprint, candidateStatus: current.status, instructionalRole: 'next-week-preview' }], grade2DeckProfile)
  const commits: Array<Record<string, unknown>> = []
  await writeImportBatch('project', 'token', batch, async (_input, init) => {
    commits.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response('{}', { status: 200 })
  }, '2026-09-26T12:00:00.000Z')
  const writes = commits.flatMap((commit) => commit.writes as Array<{ update: { name: string; fields: Record<string, { stringValue?: string }> }; updateMask?: { fieldPaths: string[] } }>)
  const datasetWrites = writes.filter((write) => write.update.name.includes('/datasets/'))

  assert.equal(batch.datasets.length, 0)
  assert.equal(datasetWrites.length, 1)
  assert.ok(!writes.some((write) => write.update.name.includes('/words/')))
  assert.deepEqual(datasetWrites[0].updateMask?.fieldPaths, ['contentFingerprint', 'candidateStatus', 'instructionalRole', 'confirmationSourceSlideId', 'confirmedAt'])
  assert.equal(datasetWrites[0].update.fields.instructionalRole.stringValue, 'weekly-acquisition')
  assert.equal(datasetWrites[0].update.fields.confirmationSourceSlideId.stringValue, 'current-slide')
})

test('multiple identical current sections produce one stored-preview metadata refresh', async () => {
  const current = candidateFromSlide({ objectId: 'current-a', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const batch = importWeeklyDatasets({
    presentationId: grade2DeckProfile.sourceDeckId,
    slides: [
      { objectId: 'current-b', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
      { objectId: 'current-a', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' },
    ],
  }, [{ datasetId: current.datasetId!, contentFingerprint: current.contentFingerprint, candidateStatus: current.status, instructionalRole: 'next-week-preview' }], grade2DeckProfile)
  const commits: Array<Record<string, unknown>> = []
  await writeImportBatch('project', 'token', batch, async (_input, init) => {
    commits.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response('{}', { status: 200 })
  }, '2026-09-26T12:00:00.000Z')
  const writes = commits.flatMap((commit) => commit.writes as Array<{ update: { name: string; fields: Record<string, { stringValue?: string }> }; updateMask?: { fieldPaths: string[] } }>)
  const datasetWrites = writes.filter((write) => write.update.name.includes('/datasets/'))

  assert.deepEqual(batch.outcomes.map((outcome) => outcome.status), ['duplicate', 'confirmation'])
  assert.equal(batch.outcomes.filter((outcome) => outcome.refreshExistingMetadata).length, 1)
  assert.equal(datasetWrites.length, 1)
  assert.equal(datasetWrites[0].update.fields.confirmationSourceSlideId.stringValue, 'current-a')
})

test('backend preserves an existing dataset when the source fingerprint changes', async () => {
  const calls: string[] = []
  const original = candidateFromSlide({ objectId: 'original', text: 'Week 9/21-9/25\nMandarin\nTier 1: 比如、部分' })
  const base = dependencies(calls)
  const result = await runImportJob({ deckId: grade2DeckProfile.sourceDeckId, projectId: 'project', googleOAuth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }, writeEnabled: true }, {
    ...base,
    fetchGooglePresentation: async () => ({ presentationId: grade2DeckProfile.sourceDeckId, slides: [{ objectId: 'changed', text: 'Week 9/21-9/25\nMandarin\nTier 1: 不同、内容' }] }),
    listDatasetReferences: async () => [{ datasetId: original.datasetId!, contentFingerprint: original.contentFingerprint, candidateStatus: original.status, instructionalRole: original.instructionalRole }],
    writeImportBatch: async () => { calls.push('unexpected-write'); throw new Error('A conflict must not be written.') },
  })

  assert.equal(result.written, false)
  assert.equal(result.batch.outcomes[0].status, 'conflict')
  assert.deepEqual(calls, ['slides-auth', 'firestore-auth'])
})
