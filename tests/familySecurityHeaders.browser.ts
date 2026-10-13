// Explicit local provider/browser gate; never starts a remote Worker or contacts
// Firebase. Run with NINJA_WRANGLER_BIN pointing to the reviewed Wrangler CLI.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { packageOfflineShell } from '../scripts/familyOfflineShell.ts'
import { familySecurityHeaders } from '../scripts/familySecurityHeaders.ts'

test('actual local Cloudflare parser and browser enforce frame boundaries without cache overlap', {
  timeout: 60000,
}, async (t) => {
  const cli = process.env.NINJA_WRANGLER_BIN
  assert.ok(cli, 'Supply the reviewed local Wrangler CLI path; no automatic installation or remote fallback.')
  const directory = mkdtempSync(join(tmpdir(), 'dojo-security-local-'))
  const cleanup: Array<() => unknown | Promise<unknown>> = []
  t.after(async () => {
    try {
      for (const close of cleanup.reverse()) await close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  const assets = join(directory, 'public')
  mkdirSync(join(assets, 'assets'), { recursive: true })
  writeFileSync(
    join(assets, '_headers'),
    familySecurityHeaders(['assets/probe-Abcd1234.js', 'assets/curriculum-Abcd1234.json']),
  )
  writeFileSync(join(assets, 'assets/curriculum-Abcd1234.json'), '{}')
  writeFileSync(join(assets, 'assets/probe-Abcd1234.js'), 'window.probeLoaded=true;')
  writeFileSync(
    join(assets, 'index.html'),
    '<!doctype html><html><head></head><body><iframe src="/family-game.html"></iframe></body></html>',
  )
  writeFileSync(
    join(assets, 'child.html'),
    '<!doctype html><html><head><script src="/assets/probe-Abcd1234.js"></script></head><body>local child</body></html>',
  )
  writeFileSync(join(assets, 'family-beta-manifest.json'), '{}')
  for (const entry of [
    'family-beta-preview.html',
    'kindergarten-learning-lab.html',
    'grade5-learning-hub.html',
    'family-game.html',
  ]) {
    writeFileSync(
      join(assets, entry),
      '<!doctype html><html><head><script src="/assets/probe-Abcd1234.js"></script></head><body>local child</body></html>',
    )
  }
  packageOfflineShell(assets, 'synthetic-security-test')
  const reserve = createServer()
  await new Promise<void>((done) => reserve.listen(0, '127.0.0.1', done))
  const port = (reserve.address() as { port: number }).port
  await new Promise<void>((done) => reserve.close(() => done()))
  const base = `http://127.0.0.1:${port}`
  const provider = spawn(
    process.execPath,
    [
      resolve(cli),
      'dev',
      '--local',
      '--assets',
      assets,
      '--name',
      'dojo-security-local',
      '--compatibility-date',
      '2026-10-04',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--inspector-port',
      '0',
    ],
    {
      cwd: directory,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  provider.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  provider.stderr.on('data', (chunk) => {
    output += String(chunk)
  })
  cleanup.push(async () => {
    if (provider.exitCode === null) {
      const exited = new Promise<void>((done) => provider.once('exit', () => done()))
      provider.kill('SIGTERM')
      await exited
    }
  })
  let ready = false
  for (let count = 0; count < 150; count++) {
    if (provider.exitCode !== null) throw new Error(`Local provider stopped: ${output}`)
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(300) })).ok
    } catch {
      /* local startup */
    }
    if (ready) break
    await new Promise((done) => setTimeout(done, 100))
  }
  assert.ok(ready, `Local provider was not ready: ${output}`)
  for (const path of [
    '/',
    '/child.html',
    '/child',
    '/family-beta-manifest.json',
    '/family-offline-sw.js',
    '/offline-registration.js',
    '/missing',
    '/assets/missing.js',
    '/assets/private.json',
    '/assets/curriculum-Abcd1234.json',
  ]) {
    const response = await fetch(base + path)
    assert.equal(response.headers.get('cache-control'), 'no-store', path)
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN', path)
  }
  const asset = await fetch(base + '/assets/probe-Abcd1234.js')
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const foreign = createServer((_req, res) => res.end(`<iframe src="${base}/child"></iframe>`))
  await new Promise<void>((done) => foreign.listen(0, '127.0.0.1', done))
  cleanup.push(() => new Promise<void>((done) => foreign.close(() => done())))
  const browser = await chromium.launch({ headless: true })
  cleanup.push(() => browser.close())
  const context = await browser.newContext()
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  await page.goto(base)
  await page.frameLocator('iframe').getByText('local child').waitFor()
  assert.equal(await page.frames()[1].evaluate(() => (window as unknown as { probeLoaded: boolean }).probeLoaded), true)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true)
  await context.setOffline(true)
  await page.reload()
  await page.frameLocator('iframe').getByText('local child').waitFor()
  const offlineHeaders = await page.evaluate(async () => {
    const entry = await fetch('/family-game.html')
    const script = await fetch('/assets/probe-Abcd1234.js')
    return {
      frame: entry.headers.get('x-frame-options'),
      csp: entry.headers.get('content-security-policy'),
      entryCache: entry.headers.get('cache-control'),
      assetCache: script.headers.get('cache-control'),
    }
  })
  assert.equal(offlineHeaders.frame, 'SAMEORIGIN')
  assert.match(offlineHeaders.csp ?? '', /frame-ancestors 'self'/)
  assert.equal(offlineHeaders.entryCache, 'no-store')
  assert.equal(offlineHeaders.assetCache, 'public, max-age=31536000, immutable')
  await context.setOffline(false)
  const refused = page.waitForEvent('console', {
    predicate: (msg) => /frame-ancestors|X-Frame-Options/.test(msg.text()),
  })
  await page.goto(`http://127.0.0.1:${(foreign.address() as { port: number }).port}`)
  await refused
  assert.equal(await page.frameLocator('iframe').getByText('local child').count(), 0)
})
