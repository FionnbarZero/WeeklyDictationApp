import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { artifactFileRecords, fileTreeSha256 } from '../scripts/familyBetaRelease.ts'
import { prepareOfflineRollback, rollbackGuard } from '../scripts/familyOfflineRollback.ts'

test('rollback package validates its input, guards every older entry, and preserves the original artifact', (t) => {
  const original = mkdtempSync(join(tmpdir(), 'dojo-rollback-input-'))
  t.after(() => rmSync(original, { recursive: true, force: true }))
  mkdirSync(join(original, 'assets'))
  writeFileSync(join(original, 'assets', 'old.js'), 'window.oldEngineExecuted = true')
  for (const name of [
    'index.html',
    'family-beta-preview.html',
    'kindergarten-learning-lab.html',
    'grade5-learning-hub.html',
    'family-game.html',
  ])
    writeFileSync(
      join(original, name),
      '<html><head><script>window.oldInline = true</script><script type="module" crossorigin src="./assets/old.js"></script></head><body>old</body></html>',
    )
  const files = artifactFileRecords(original)
  const source = {
    schema: 1,
    grade: 'Family',
    canonicalOrigin: 'https://ninjadojo.meghangames.com',
    firebaseProject: 'weeklydictationapp',
    sourceRevision: 'a'.repeat(40),
    files,
    fileTreeSha256: fileTreeSha256(files),
  }
  writeFileSync(join(original, 'family-beta-manifest.json'), JSON.stringify(source))
  const { directory, manifest } = prepareOfflineRollback(original, 'b'.repeat(40))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  assert.deepEqual(artifactFileRecords(original), files)
  assert.equal(fileTreeSha256(artifactFileRecords(directory)), manifest.fileTreeSha256)
  assert.equal(manifest.previousFileTreeSha256, source.fileTreeSha256)
  assert.equal(manifest.rollbackCompatibilityRevision, 'b'.repeat(40))
  const entry = readFileSync(join(directory, 'index.html'), 'utf8')
  assert.match(entry, /<head><script src="\.\/rollback-guard.js"/)
  assert.match(entry, /if \(!window.__dojoRollbackPreserve\) await import/)
  assert.match(entry, /if \(!window.__dojoRollbackPreserve\) \{window.oldInline/)
  assert.match(readFileSync(join(directory, 'family-offline-sw.js'), 'utf8'), /rollback-guard.js/)
  writeFileSync(join(original, 'assets', 'old.js'), 'changed')
  assert.throws(() => prepareOfflineRollback(original, 'b'.repeat(40)), /integrity/)
})

for (const key of [
  'family-beta-acquisition-v1:lesson',
  'family-beta-activity:child:weekly-dictation-state-v2',
  'family-beta-activity:child:lesson-retirement-v1:lesson',
  'family-beta-activity:child:lesson-workspace-v1',
]) {
  test(`rollback guard preserves newer records without reading credentials or writing storage: ${key}`, () => {
    const values = new Map([
      [key, '{"lessonSnapshot":{}}'],
      ['weekly-dictation-auth-v1', 'never-read'],
    ])
    let ready: (() => void) | undefined
    const document = {
      title: '',
      body: { innerHTML: '' },
      addEventListener: (_event: string, fn: () => void) => {
        ready = fn
      },
    }
    const window = { __dojoRollbackPreserve: false }
    runInNewContext(rollbackGuard, {
      document,
      window,
      localStorage: {
        length: values.size,
        key: (i: number) => [...values.keys()][i],
        getItem: (k: string) => {
          assert.notEqual(k, 'weekly-dictation-auth-v1')
          return values.get(k)
        },
      },
    })
    assert.equal(window.__dojoRollbackPreserve, true)
    ready!()
    assert.match(document.body.innerHTML, /Your saved work is preserved/)
    assert.match(document.body.innerHTML, /close all Ninja Dojo tabs/)
    assert.equal(values.size, 2)
  })
}

test('rollback guard preserves an oversized acquisition history without parsing or rewriting it', () => {
  const key = 'family-beta-acquisition-v1:lesson'
  const oversized = JSON.stringify({
    sessionId: 'saved-lesson',
    lessonSnapshot: { curriculumRevision: '2026-10-08' },
    reviewedTrials: Array.from({ length: 501 }, (_, i) => ({ sessionId: 'saved-lesson', reviewedAt: `2026-10-08T00:00:${String(i % 60).padStart(2, '0')}.000Z` })),
  })
  const values = new Map([[key, oversized], ['weekly-dictation-auth-v1', 'never-read']])
  let ready: (() => void) | undefined
  const document = {
    title: '',
    body: { innerHTML: '' },
    addEventListener: (_event: string, fn: () => void) => { ready = fn },
  }
  const window = { __dojoRollbackPreserve: false }
  runInNewContext(rollbackGuard, {
    document,
    window,
    localStorage: {
      length: values.size,
      key: (i: number) => [...values.keys()][i] ?? null,
      getItem: (storedKey: string) => {
        assert.notEqual(storedKey, 'weekly-dictation-auth-v1')
        return values.get(storedKey)
      },
    },
  })
  assert.equal(window.__dojoRollbackPreserve, true)
  ready!()
  assert.match(document.body.innerHTML, /Your saved work is preserved/)
  assert.equal(values.get(key), oversized)
})
