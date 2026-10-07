import assert from 'node:assert/strict'
import test from 'node:test'
import { createResultRepository } from '../src/familyBeta/cloud.ts'
import { makeResult } from '../src/familyBeta/model.ts'
import { documentValue } from '../src/firestoreClient.ts'

const profile = { id: 'child', nickname: 'Synthetic', grade: 'Grade 5' as const, active: true }
const score = (id: string, at = '2026-10-06T15:00:00.000Z') => makeResult(profile,
  { id, activity: 'Writing Dojo', channel: 'writing', datasetIds: ['week-one'], correct: 1, attempted: 2 }, new Date(at))
const document = (result: ReturnType<typeof score>) => ({ fields: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, documentValue(value)])) })

test('routine result refresh reads one bounded recent page instead of walking the whole history', async () => {
  const requested: URL[] = []
  const repository = createResultRepository({ projectId: 'synthetic', familyId: 'family', token: async () => 'synthetic',
    fetchImpl: async input => {
      const url = new URL(String(input))
      requested.push(url)
      return Response.json(url.searchParams.has('pageToken')
        ? { documents: [document(score('old', '2025-10-06T15:00:00.000Z'))] }
        : { documents: [document(score('recent'))], nextPageToken: 'older-page' })
    },
  })
  const loaded = await repository.list(profile.id)
  assert.equal(requested.length, 1, 'routine sync must not fetch older pages')
  assert.equal(requested[0].searchParams.get('pageSize'), '50')
  assert.equal(requested[0].searchParams.get('orderBy'), 'completedAt desc, __name__ desc')
  assert.deepEqual(loaded.map(r => r.id), ['recent'])
})
