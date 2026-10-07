import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { packageOfflineShell } from '../scripts/familyOfflineShell.ts'

function fixture(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'dojo-shell-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const entry of [
    'index.html',
    'family-beta-preview.html',
    'kindergarten-learning-lab.html',
    'grade5-learning-hub.html',
    'family-game.html',
  ])
    writeFileSync(join(directory, entry), '<head></head><body>original version</body>')
  mkdirSync(join(directory, 'assets'))
  writeFileSync(join(directory, 'assets', 'lesson-v1.js'), 'original engine')
  writeFileSync(join(directory, 'private.json'), 'never cache')
  packageOfflineShell(directory, 'revision-a')
  const listeners = new Map<string, (event: unknown) => void>()
  const entries = new Map<string, Response>()
  const deleted: string[] = []
  const fetched: string[] = []
  let corrupt = false
  const caches = {
    open: async () => ({
      put: async (url: URL, response: Response) => {
        entries.set(url.href, response)
      },
      match: async (url: URL) => entries.get(url.href)?.clone(),
    }),
    delete: async (key: string) => {
      deleted.push(key)
      entries.clear()
    },
    keys: async () => ['ninja-dojo-shell-v1:revision-a', 'ninja-dojo-shell-v1:revision-old', 'unrelated-cache'],
  }
  const source = readFileSync(join(directory, 'family-offline-sw.js'), 'utf8')
  runInNewContext(source, {
    URL,
    Response,
    Uint8Array,
    crypto,
    caches,
    self: {
      registration: { scope: 'https://dojo.example/' },
      addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    },
    fetch: async (url: URL) => {
      fetched.push(url.pathname)
      const response = new Response(corrupt ? 'unexpected newer build' : readFileSync(join(directory, url.pathname)))
      Object.defineProperty(response, 'url', { value: url.href })
      return response
    },
  })
  const lifecycle = async (name: string) => {
    let promise: Promise<void> | undefined
    listeners.get(name)!({
      waitUntil: (value: Promise<void>) => {
        promise = value
      },
    })
    await promise
  }
  const request = async (url: string, mode = 'navigate', method = 'GET') => {
    let response: Promise<Response> | undefined
    listeners.get('fetch')!({
      request: { url, mode, method },
      respondWith: (value: Promise<Response>) => {
        response = value
      },
    })
    return response
  }
  return {
    entries,
    fetched,
    deleted,
    lifecycle,
    request,
    source,
    corrupt: () => {
      corrupt = true
    },
  }
}
test('offline shell validates exact package hashes and handles clean/query grade URLs only', async (t) => {
  const shell = fixture(t)
  await shell.lifecycle('install')
  assert.equal(shell.fetched.includes('/private.json'), false)
  for (const url of [
    'https://dojo.example/?grade=grade5',
    'https://dojo.example/family-beta-preview?grade=kindergarten',
    'https://dojo.example/index.html?family-preview=1',
  ])
    assert.match(await (await shell.request(url))!.text(), /original version/)
  assert.equal(
    await (await shell.request('https://dojo.example/assets/lesson-v1.js', 'cors'))!.text(),
    'original engine',
  )
  for (const url of [
    'https://firestore.googleapis.com/documents',
    'https://dojo.example/curriculum/beta/grade5.json',
    'https://dojo.example/private.json',
    'https://dojo.example/unknown',
  ])
    assert.equal(await shell.request(url), undefined)
  assert.equal(await shell.request('https://dojo.example/index.html', 'navigate', 'POST'), undefined)
})
test('incomplete or mixed-version package cannot install an offline shell', async (t) => {
  const shell = fixture(t)
  shell.corrupt()
  await assert.rejects(shell.lifecycle('install'), /checksum/)
  assert.equal(shell.entries.size, 0)
  assert.deepEqual(shell.deleted, ['ninja-dojo-shell-v1:revision-a'])
})
test('updates do not take over active lessons; activation cleans only owned old shell caches', async (t) => {
  const shell = fixture(t)
  assert.doesNotMatch(shell.source, /self\.(skipWaiting|clients\.claim)\(/)
  await shell.lifecycle('activate')
  assert.deepEqual(shell.deleted, ['ninja-dojo-shell-v1:revision-old'])
})
