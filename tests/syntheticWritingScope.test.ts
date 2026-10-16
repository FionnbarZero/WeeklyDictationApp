import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanSyntheticWritingFamily, syntheticWritingScope } from '../scripts/syntheticWritingScope.ts'

const uid = 'syntheticWritingAccount123456'
const email = 'ninja-writing-12345678-1234-1234-1234-123456789abc@example.invalid'
const scope = () => syntheticWritingScope(uid, email, email)
test('synthetic cleanup requires exact new-account email and bounded identity', () => {
  assert.throws(() => syntheticWritingScope('../real', email, email))
  assert.throws(() => syntheticWritingScope(uid, 'other@example.invalid', email))
  assert.throws(() => syntheticWritingScope(uid, 'real@example.com', 'real@example.com'))
  const s = scope()
  for (const name of [
    s.family + '-other',
    s.family + '/../another',
    s.user + '/private',
    s.family.replace(uid, 'other'),
  ])
    assert.throws(() => s.url(name))
  assert.ok(s.url(s.family + '/children/child').endsWith('/children/child'))
})
test('cleanup refuses unrelated listed children before issuing any delete', async () => {
  const calls: string[] = []
  const s = scope()
  await assert.rejects(
    cleanSyntheticWritingFamily(s, async (url, options) => {
      calls.push(options?.method || 'GET')
      return Response.json(
        String(url).endsWith(':listCollectionIds')
          ? { collectionIds: ['children'] }
          : { documents: [{ name: s.family.replace(uid, 'anotherFamily') + '/children/child' }] },
      )
    }),
    /Unrelated/,
  )
  assert.ok(!calls.includes('DELETE'))
})
test('cleanup rejects error and paginated reads instead of reporting success', async () => {
  await assert.rejects(
    cleanSyntheticWritingFamily(scope(), async () => new Response('{}', { status: 403 })),
    /403/,
  )
  await assert.rejects(
    cleanSyntheticWritingFamily(scope(), async () => Response.json({ nextPageToken: 'more' })),
    /size/,
  )
})
test('cleanup removes only exact owned roots and verifies both are gone', async () => {
  const s = scope(),
    deleted: string[] = []
  const count = await cleanSyntheticWritingFamily(s, async (url, options) => {
    if (options?.method === 'POST') return Response.json({})
    if (options?.method === 'DELETE') {
      deleted.push(String(url))
      return Response.json({})
    }
    return new Response('{}', { status: 404 })
  })
  assert.equal(count, 2)
  assert.deepEqual(deleted, [s.url(s.family), s.url(s.user)])
})
