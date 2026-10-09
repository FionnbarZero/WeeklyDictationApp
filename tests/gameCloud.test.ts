import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { plainValue, type FirestoreValue } from '../src/firestoreClient.ts'
import { inspectSnapshot } from '../src/familyBeta/curriculum.ts'
import { reinforcementGames } from '../src/familyBeta/gamePools.ts'
import { createGameCloudRepository } from '../src/ninjaSkills/gameCloud.ts'
import {
  checkpointGameAnswer,
  retireGameCheckpoint,
  serializeGameRecord,
  startGameCheckpoint,
  type GameCheckpoint,
} from '../src/ninjaSkills/progress.ts'

const firstTime = '2026-10-09T01:00:00.000Z'
const secondTime = '2026-10-09T01:01:00.000Z'

function fixture() {
  const datasets = inspectSnapshot(
    JSON.parse(readFileSync(new URL('../public/curriculum/beta/grade5.json', import.meta.url), 'utf8')),
  ).datasets
  const capability = reinforcementGames(datasets, '2026-10-05', 'Grade 5').find(
    ({ capability: value }) => value.status === 'ready' && value.pack.moduleId === 'memory-flip',
  )!.capability
  if (capability.status !== 'ready') throw new Error('Missing game cloud fixture.')
  return startGameCheckpoint(
    { childId: 'child', grade: 'Grade 5', week: '2026-10-05', gameId: 'memory-flip' },
    capability.pack,
    'attempt-one',
    'writer-one',
    firstTime,
  )
}

function reviewed(value: GameCheckpoint) {
  const pair = 'pairs' in value.pack ? value.pack.pairs[0] : null
  if (!pair) throw new Error('Expected pair fixture.')
  return checkpointGameAnswer(
    value,
    {
      gameId: value.pack.moduleId,
      promptId: pair.id,
      targetId: pair.targetId,
      correct: true,
      assessmentMode: 'automatic',
      response: [`${pair.id}:left`, `${pair.id}:right`],
    },
    secondTime,
  )
}

type StoredDocument = { name: string; fields: Record<string, FirestoreValue>; updateTime: string }

function firestoreRest() {
  const documents = new Map<string, StoredDocument>()
  let revision = 0
  const calls: { method: string; url: string }[] = []
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    calls.push({ method, url: url.toString() })
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer token')
    assert.equal(new Headers(init.headers).get('X-Firebase-AppCheck'), 'app-check')
    const apiPath = decodeURIComponent(url.pathname.replace(/^\/v1\//, ''))
    if (apiPath.endsWith('/documents:batchGet')) {
      const request = JSON.parse(String(init.body)) as { documents: string[] }
      assert.equal(request.documents.length, 1)
      const name = request.documents[0]
      const found = documents.get(name)
      return json([
        found
          ? { found, readTime: secondTime }
          : { missing: name, readTime: secondTime },
      ])
    }
    if (apiPath.endsWith('/documents:commit')) {
      const request = JSON.parse(String(init.body)) as {
        writes: {
          update: { name: string; fields: Record<string, FirestoreValue> }
          currentDocument: { exists?: boolean; updateTime?: string }
        }[]
      }
      assert.equal(request.writes.length, 1)
      const write = request.writes[0]
      const name = write.update.name
      const old = documents.get(name)
      if (
        (write.currentDocument.exists === false && old) ||
        (write.currentDocument.updateTime && old?.updateTime !== write.currentDocument.updateTime)
      )
        return json({}, 412)
      if (write.currentDocument.updateTime && !old) return json({}, 412)
      const updateTime = `2026-10-09T01:02:${String(revision++).padStart(2, '0')}.000Z`
      documents.set(name, { name, fields: write.update.fields, updateTime })
      return json({ writeResults: [{ updateTime }], commitTime: updateTime })
    }
    if (method === 'PATCH') {
      const name = apiPath
      const old = documents.get(name)
      const mustNotExist = url.searchParams.get('currentDocument.exists') === 'false'
      const expectedVersion = url.searchParams.get('currentDocument.updateTime')
      if ((mustNotExist && old) || (expectedVersion && old?.updateTime !== expectedVersion)) return json({}, 412)
      if (expectedVersion && !old) return json({}, 412)
      const request = JSON.parse(String(init.body)) as { fields: Record<string, FirestoreValue> }
      const updateTime = `2026-10-09T01:02:${String(revision++).padStart(2, '0')}.000Z`
      const document = { name, fields: request.fields, updateTime }
      documents.set(name, document)
      return json(document)
    }
    if (method === 'GET') {
      const prefix = `${apiPath}/`
      const all = [...documents.values()]
        .filter((document) => document.name.startsWith(prefix) && !document.name.slice(prefix.length).includes('/'))
        .sort((a, b) => a.name.localeCompare(b.name))
      const offset = Number(url.searchParams.get('pageToken') || 0)
      const size = Number(url.searchParams.get('pageSize') || 10)
      const page = all.slice(offset, offset + size)
      return json({
        documents: page,
        ...(offset + size < all.length ? { nextPageToken: String(offset + size) } : {}),
      })
    }
    return json({}, 404)
  }
  return { documents, calls, fetchImpl }
}

test('game cloud transport uses exact conditional readback and immutable per-run retirements', async () => {
  const server = firestoreRest()
  const repository = createGameCloudRepository({
    projectId: 'weekly-dictation-test',
    familyId: 'family',
    token: async () => 'token',
    stillOwner: () => true,
    endpoint: 'http://127.0.0.1:8080',
    fetchImpl: server.fetchImpl,
    appCheckHeaders: async () => ({ 'X-Firebase-AppCheck': 'app-check' }),
  })
  const initial = fixture()
  const created = await repository.writeCheckpoint(initial, null)
  assert.deepEqual(created.value, initial)
  const online = await repository.readCheckpoint(initial.scope)
  assert.equal(online?.version, created.version)
  assert.deepEqual(online?.value, initial)

  const next = reviewed(initial)
  const updated = await repository.writeCheckpoint(next, created.version)
  assert.deepEqual(updated.value, next)
  await assert.rejects(repository.writeCheckpoint(initial, created.version), /not confirmed exactly/)

  const retirement = retireGameCheckpoint(next, secondTime)
  assert.deepEqual(await repository.saveRetirement(retirement), retirement)
  assert.deepEqual(await repository.saveRetirement(retirement), retirement, 'an identical retry is idempotent')
  assert.deepEqual(await repository.readRetirement(next.scope, next.runId), retirement)
  await assert.rejects(repository.writeCheckpoint(next, updated.version), /discarded game run/)

  const retirements = await repository.listRetirementPage('child')
  assert.deepEqual(retirements.retirements, [retirement])
  const checkpoints = await repository.listCheckpointPage('child')
  assert.deepEqual(checkpoints.checkpoints, [next])
  assert.ok(server.calls.some(({ url }) => url.includes('betaGameRetirements')))
})

test('game cloud transport rejects changed ownership and malformed readback without acknowledging data', async () => {
  let owner = true
  const server = firestoreRest()
  const repository = createGameCloudRepository({
    projectId: 'weekly-dictation-test',
    familyId: 'family',
    token: async () => {
      owner = false
      return 'token'
    },
    stillOwner: () => owner,
    endpoint: 'http://localhost:8080',
    fetchImpl: server.fetchImpl,
  })
  await assert.rejects(repository.readCheckpoint(fixture().scope), /account changed/)

  owner = true
  const corruptServer = firestoreRest()
  const initial = fixture()
  const corruptRepository = createGameCloudRepository({
    projectId: 'weekly-dictation-test',
    familyId: 'family',
    token: async () => 'token',
    stillOwner: () => true,
    endpoint: 'http://localhost:8080',
    appCheckHeaders: async () => ({ 'X-Firebase-AppCheck': 'app-check' }),
    fetchImpl: async (input, init) => {
      const response = await corruptServer.fetchImpl(input, init)
      if (!String(input).endsWith('documents:batchGet')) return response
      const raw = (await response.json()) as { found?: StoredDocument; missing?: string; readTime: string }[]
      if (raw[0]?.found) raw[0].found.fields.payload = { stringValue: serializeGameRecord({ altered: true }) }
      return new Response(JSON.stringify(raw), { status: response.status })
    },
  })
  await assert.rejects(corruptRepository.writeCheckpoint(initial, null), /Unsupported game record fields/)
  assert.ok(
    [...corruptServer.documents.values()].some((document) =>
      Object.values(document.fields).some((value) => plainValue(value) === serializeGameRecord(initial)),
    ),
    'the mock confirms a server write existed but the client did not acknowledge corrupt readback',
  )
})
