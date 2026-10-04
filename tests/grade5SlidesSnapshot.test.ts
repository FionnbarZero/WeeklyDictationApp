import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fetchAutomaticGrade5Curriculum } from '../src/automaticGrade5Curriculum.ts'
import { GRADE5_DECK_ID } from '../src/config.ts'
import {
  GRADE5_CURRICULUM_SNAPSHOT_SCHEMA,
  parseGrade5CurriculumSnapshot,
} from '../src/curriculum/grade5CurriculumSnapshot.ts'
import {
  buildGrade5CurriculumSnapshot,
  fetchGrade5CurriculumSnapshot,
  readGrade5CurriculumSnapshot,
} from '../scripts/grade5SlidesSnapshot.ts'

const snapshotPath = new URL('../public/curriculum/grade5-presentation.json', import.meta.url)

test('the reviewed Grade 5 snapshot validates lifecycle cohorts and public book links', async () => {
  const { snapshot, extraction } = await readGrade5CurriculumSnapshot(snapshotPath.pathname)
  assert.equal(snapshot.source.documentId, GRADE5_DECK_ID)
  assert.equal(extraction.classification.selectedCandidates.length, 4)
  assert.equal(extraction.progressionEvidence.length, 4)
  assert.equal(
    extraction.issues.some((issue) => issue.severity === 'error'),
    false,
  )
  assert.ok(extraction.resources.length >= 4)
  assert.ok(extraction.resources.every((resource) => resource.url.startsWith('https://')))
})

test('the browser accepts only the registered same-origin Grade 5 snapshot', async () => {
  const raw = await readFile(snapshotPath, 'utf8')
  const loaded = await fetchAutomaticGrade5Curriculum({
    baseUrl: '/',
    fetchImpl: async (input) => {
      assert.equal(input, '/curriculum/grade5-presentation.json')
      return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  assert.equal(loaded.extraction.classification.selectedCandidates.length, 4)
})

test('the browser rejects Grade 5 snapshot tampering and another deck', async () => {
  const raw = await readFile(snapshotPath, 'utf8')
  const tampered = JSON.parse(raw)
  tampered.presentation.slides[0].pageElements[0].shape.text.textElements[0].textRun.content += 'change'
  await assert.rejects(
    fetchAutomaticGrade5Curriculum({
      baseUrl: '/',
      fetchImpl: async () => new Response(JSON.stringify(tampered), { status: 200 }),
    }),
    /checksum/i,
  )
  const snapshot = JSON.parse(raw)
  snapshot.source.documentId = 'wrong-deck'
  assert.throws(() => parseGrade5CurriculumSnapshot(snapshot), /invalid source metadata/i)
})

test('the trusted Grade 5 snapshot job preserves the reviewed Slides payload', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/grade5-presentation.json', import.meta.url), 'utf8'))
  const expected = buildGrade5CurriculumSnapshot(fixture, '2026-10-04T00:00:00.000Z')
  const result = await fetchGrade5CurriculumSnapshot(
    { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    {
      googleAccessToken: async () => 'read-only-token',
      fetchGooglePresentation: async (presentationId, token) => {
        assert.equal(presentationId, GRADE5_DECK_ID)
        assert.equal(token, 'read-only-token')
        return fixture
      },
      now: () => new Date('2026-10-04T00:00:00.000Z'),
    },
  )
  assert.equal(result.snapshot.schema, GRADE5_CURRICULUM_SNAPSHOT_SCHEMA)
  assert.equal(result.snapshot.source.contentSha256, expected.source.contentSha256)
  assert.deepEqual(result.snapshot.presentation, expected.presentation)
})
