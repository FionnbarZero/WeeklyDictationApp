import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
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
  let currentCache = ''
  const caches = {
    open: async (name: string) => {
      currentCache = name
      return {
        put: async (url: URL, response: Response) => {
          entries.set(url.href, response)
        },
        match: async (url: URL) => entries.get(url.href)?.clone(),
      }
    },
    delete: async (key: string) => {
      deleted.push(key)
      if (key === currentCache) entries.clear()
    },
    keys: async () => [
      currentCache,
      'ninja-dojo-shell-v1:%2F:revision-old',
      'ninja-dojo-shell-v1:%2Fanother-app%2F:revision-old',
      'unrelated-cache',
    ],
  }
  const source = readFileSync(join(directory, 'family-offline-sw.js'), 'utf8')
  runInNewContext(source, {
    URL,
    Response,
    Headers,
    Uint8Array,
    crypto,
    caches,
    self: {
      registration: { scope: 'https://dojo.example/' },
      addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    },
    fetch: async (url: URL) => {
      fetched.push(url.pathname)
      const response = new Response(corrupt ? 'unexpected newer build' : readFileSync(join(directory, url.pathname)), {
        headers: { 'Content-Encoding': 'gzip', 'Content-Length': '1' },
      })
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
    directory,
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
  assert.equal(
    (await shell.request('https://dojo.example/assets/lesson-v1.js', 'cors'))!.headers.get('Content-Encoding'),
    null,
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
  assert.equal(shell.deleted.length, 1)
  assert.match(shell.deleted[0], /^ninja-dojo-shell-v1:%2F:revision-a:[a-f0-9]{64}$/)
})
test('updates do not take over active lessons; activation cleans only owned old shell caches', async (t) => {
  const shell = fixture(t)
  assert.doesNotMatch(shell.source, /self\.(skipWaiting|clients\.claim)\(/)
  await shell.lifecycle('install')
  await shell.lifecycle('activate')
  assert.deepEqual(shell.deleted, ['ninja-dojo-shell-v1:%2F:revision-old'])
  assert.match(await (await shell.request('https://dojo.example/'))!.text(), /original version/)
})

test('repackaging an alias updates integrity metadata without duplicating the registration', (t) => {
  const shell = fixture(t)
  const page = join(shell.directory, 'family-beta-preview.html')
  writeFileSync(page, readFileSync(page, 'utf8').replace('<head>', '<head><script>/* grade selector */</script>'))
  packageOfflineShell(shell.directory, 'revision-a')
  assert.equal(readFileSync(page, 'utf8').match(/offline-registration.js/g)?.length, 1)
  assert.notEqual(readFileSync(join(shell.directory, 'family-offline-sw.js'), 'utf8'), shell.source)
  const rebuilt = readFileSync(join(shell.directory, 'family-offline-sw.js'), 'utf8')
  packageOfflineShell(shell.directory, 'revision-a')
  assert.equal(readFileSync(join(shell.directory, 'family-offline-sw.js'), 'utf8'), rebuilt)
})
