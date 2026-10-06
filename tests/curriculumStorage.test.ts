import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createGoogleCurriculumStorage } from '../backend/curriculumStorage.ts'
import { createCurriculumService } from '../backend/curriculumServer.ts'
import { buildCurriculumSnapshot } from '../backend/betaCurriculum.ts'
import { BETA_GRADES, type BetaGrade } from '../src/familyBeta/model.ts'
import { gradeSlugs, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'

async function fixture(grade: BetaGrade) {
  return JSON.parse(
    await readFile(new URL(`../public/curriculum/beta/${gradeSlugs[grade]}.json`, import.meta.url), 'utf8'),
  ) as CurriculumSnapshot
}

test('durable storage pins reads to a generation and publishes with compare-and-swap', async () => {
  const old = await fixture('Grade 5')
  const next = { ...old, retrievedAt: new Date().toISOString() }
  const calls: string[] = []
  const storage = createGoogleCurriculumStorage(
    'test-curriculum',
    async () => 'test-token',
    async (input, init) => {
      const url = String(input)
      calls.push(url)
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-token')
      if (url.includes('/upload/')) {
        assert.match(url, /ifGenerationMatch=17/)
        assert.equal(init?.body, JSON.stringify(next))
        return Response.json({ generation: '18' })
      }
      if (url.includes('alt=media')) {
        assert.match(url, /generation=17/)
        return Response.json(old)
      }
      return Response.json({ generation: '17' })
    },
  )
  assert.deepEqual(await storage.read('Grade 5'), old)
  await storage.publish(next)
  assert.equal(calls.filter((c) => c.includes('/upload/')).length, 1)
})

test('storage refuses lost weeks, corruption, and failed or conflicting writes', async () => {
  const old = await fixture('Grade 2')
  let uploads = 0
  let corrupt = false
  const storage = createGoogleCurriculumStorage(
    'test-curriculum',
    async () => 'test-token',
    async (input) => {
      const url = String(input)
      if (url.includes('/upload/')) {
        uploads++
        return new Response('', { status: 412 })
      }
      if (url.includes('alt=media')) return Response.json(corrupt ? { ...old, contentSha256: 'a'.repeat(64) } : old)
      return Response.json({ generation: '17' })
    },
  )
  if (old.payload.sourceType !== 'google-slides') throw new Error('Wrong fixture')
  const partial = buildCurriculumSnapshot('Grade 2', { ...old.payload, slides: old.payload.slides!.slice(0, 1) }, '')
  await assert.rejects(storage.publish(partial), /remove a valid week/)
  assert.equal(uploads, 0)
  await assert.rejects(storage.publish({ ...old, retrievedAt: new Date().toISOString() }), /previous version retained/)
  corrupt = true
  await assert.rejects(storage.read('Grade 2'), /checksum/)
})

test('a new service instance serves durable lessons during Google outage, exposes warnings, and has no write routes', async () => {
  const snapshots = new Map(await Promise.all(BETA_GRADES.map(async (g) => [g, await fixture(g)] as const)))
  let writes = 0
  const service = createCurriculumService({
    directory: '/unused',
    storage: {
      async read(grade) {
        return snapshots.get(grade) || null
      },
      async publish() {
        writes++
        throw new Error('Should not publish without Google')
      },
    },
  })
  await new Promise<void>((resolve) => service.server.listen(0, '127.0.0.1', resolve))
  try {
    const address = service.server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test port')
    const base = `http://127.0.0.1:${address.port}`
    for (const grade of BETA_GRADES) {
      const response = await fetch(`${base}/curriculum/beta/${gradeSlugs[grade]}.json`)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
      assert.match(response.headers.get('access-control-expose-headers') || '', /X-Curriculum-Warning/)
      assert.equal(response.headers.get('x-curriculum-warning'), 'refresh-unavailable')
      assert.deepEqual(await response.json(), snapshots.get(grade))
    }
    assert.equal((await fetch(`${base}/run`, { method: 'POST' })).status, 405)
    assert.equal((await fetch(`${base}/secrets`)).status, 404)
    assert.equal(writes, 0)
  } finally {
    await new Promise<void>((resolve, reject) => service.server.close((error) => (error ? reject(error) : resolve())))
  }
})
