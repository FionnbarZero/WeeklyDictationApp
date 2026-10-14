// Explicit local-only acceptance server. Three immutable, verified packages are
// served by the actual provider runtime; this loopback proxy only selects one.
// It never packages dirty source, uploads, or contacts a production backend.
import assert from 'node:assert/strict'
import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, request as forward } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { packageHeaderPolicy } from './canonicalFamilyHeaders.ts'
import { CANONICAL_FAMILY, verifyCanonicalLive } from './canonicalFamilyRelease.ts'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const required = (key: string) => {
  const value = process.env[key]
  assert.ok(value, `Required: ${key}`)
  return value
}
const cli = resolve(required('NINJA_WRANGLER_BIN'))
const candidateRevision = required('FAMILY_SECURITY_REVISION')
const versions = [
  ['candidate', required('FAMILY_SECURITY_CANDIDATE'), required('FAMILY_SECURITY_CANDIDATE_TREE')],
  ['previous', required('FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT'), required('FAMILY_SECURITY_PREVIOUS_TREE')],
  ['rollback', required('FAMILY_SECURITY_RECOVERY'), required('FAMILY_SECURITY_RECOVERY_TREE')],
] as const
const ports = new Map<string, number>()
const children: ChildProcess[] = []
const directory = mkdtempSync(join(tmpdir(), 'dojo-security-provider-'))
let selected = 'candidate'
let shuttingDown = false
const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1:5193')
  if (req.method === 'POST' && url.pathname === '/__rehearsal__/version') {
    const version = url.searchParams.get('version') || ''
    if (!ports.has(version)) {
      res.writeHead(400).end()
      return
    }
    selected = version
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(
      JSON.stringify({ version, candidate: candidateRevision, rollback: required('FAMILY_SECURITY_RECOVERY_TREE') }),
    )
    return
  }
  const port = ports.get(selected)
  if (!port) {
    res.writeHead(503).end()
    return
  }
  const upstream = forward(
    {
      hostname: '127.0.0.1',
      port,
      method: req.method,
      path: url.pathname + url.search,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (response) => {
      // Relative redirects pass through unchanged. Rebase only this provider's
      // own absolute loopback redirects, not unrelated destinations.
      const headers = { ...response.headers }
      if (headers.location?.startsWith(`http://127.0.0.1:${port}/`))
        headers.location = headers.location.replace(`http://127.0.0.1:${port}`, 'http://127.0.0.1:5193')
      res.writeHead(response.statusCode || 502, headers)
      response.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.on('aborted', () => upstream.destroy())
  req.pipe(upstream)
})
async function stop() {
  if (shuttingDown) return
  shuttingDown = true
  server.closeAllConnections()
  server.close()
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return
      await new Promise<void>((done) => {
        const force = setTimeout(() => child.kill('SIGKILL'), 5000)
        child.once('exit', () => {
          clearTimeout(force)
          done()
        })
        child.kill('SIGTERM')
      })
    }),
  )
  rmSync(directory, { recursive: true, force: true })
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void stop().then(() => process.exit(0))
  })
try {
  for (const [name, source, tree] of versions) {
    const manifest = JSON.parse(readFileSync(join(source, 'family-beta-manifest.json'), 'utf8'))
    const files = artifactFileRecords(source)
    assert.equal(manifest.grade, 'Family')
    assert.equal(manifest.canonicalOrigin, 'https://ninjadojo.meghangames.com')
    assert.equal(manifest.firebaseProject, 'weeklydictationapp')
    assert.equal(manifest.fileTreeSha256, tree)
    assert.equal(fileTreeSha256(files), tree)
    assert.deepEqual(files, manifest.files)
    if (name === 'candidate') assert.equal(manifest.sourceRevision, candidateRevision)
    if (name === 'rollback') {
      assert.equal(manifest.rollbackCompatibilityRevision, candidateRevision)
      assert.equal(manifest.previousFileTreeSha256, required('FAMILY_SECURITY_PREVIOUS_TREE'))
    }
    const reserve = createServer()
    await new Promise<void>((done) => reserve.listen(0, '127.0.0.1', done))
    const port = (reserve.address() as { port: number }).port
    await new Promise<void>((done) => reserve.close(() => done()))
    const child = spawn(
      process.execPath,
      [
        cli,
        'dev',
        '--local',
        '--assets',
        resolve(source),
        '--name',
        `dojo-security-${name}`,
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
    children.push(child)
    let output = ''
    let spawnError: Error | undefined
    child.on('error', (error) => {
      spawnError = error
    })
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    let ready = false
    for (let attempt = 0; attempt < 150; attempt++) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(`${name} provider failed: ${output}`)
      try {
        ready = (
          await fetch(`http://127.0.0.1:${port}/family-beta-manifest.json`, { signal: AbortSignal.timeout(500) })
        ).ok
      } catch {
        /* startup */
      }
      if (ready) break
      await new Promise((done) => setTimeout(done, 100))
    }
    assert.ok(ready, `${name} provider did not start: ${output}`)
    const origin = `http://127.0.0.1:${port}`
    const servedManifest = await fetch(`${origin}/family-beta-manifest.json`)
    assert.deepEqual(await servedManifest.json(), manifest)
    const policy = readFileSync(join(source, '_headers'), 'utf8')
    // Exercise the production verifier against the pinned local provider. This
    // adapter is test-only: it may rebase only the expected canonical/loopback
    // origins and never changes response policy, status or asset bytes.
    const localRequest: typeof fetch = async (input, options) => {
      const canonical = new URL(String(input))
      assert.equal(canonical.origin, CANONICAL_FAMILY.origin)
      const result = await fetch(`${origin}${canonical.pathname}${canonical.search}`, options)
      assert.equal(new URL(result.url).origin, origin)
      const headers = new Headers(result.headers)
      const location = headers.get('location')
      if (location?.startsWith(`${origin}/`)) headers.set('location', location.replace(origin, CANONICAL_FAMILY.origin))
      const response = new Response(result.body, { status: result.status, statusText: result.statusText, headers })
      Object.defineProperty(response, 'url', { value: result.url.replace(origin, CANONICAL_FAMILY.origin) })
      return response
    }
    const headerReceipt = await verifyCanonicalLive(
      { directory: source, sourceRevision: manifest.sourceRevision, fileTreeSha256: tree },
      localRequest,
      packageHeaderPolicy(source),
    )
    let publicFiles = 0
    for (const file of files.filter((file) => file.path !== '_headers' && !file.path.startsWith('.'))) {
      const response = await fetch(`${origin}/${file.path}`, { signal: AbortSignal.timeout(5000) })
      assert.equal(new URL(response.url).origin, origin)
      assert.equal(response.status, 200, `${name}/${file.path}`)
      assert.equal(
        createHash('sha256')
          .update(Buffer.from(await response.arrayBuffer()))
          .digest('hex'),
        file.sha256,
        `${name}/${file.path}`,
      )
      for (const header of [
        'Content-Security-Policy',
        'Content-Security-Policy-Report-Only',
        'X-Frame-Options',
        'Cross-Origin-Opener-Policy',
      ]) {
        const expected = policy.match(new RegExp(`^  ${header}: (.+)$`, 'm'))?.[1] ?? null
        assert.equal(response.headers.get(header), expected, `${name}/${file.path}/${header}`)
      }
      if (name === 'candidate')
        assert.equal(
          response.headers.get('cache-control'),
          /^assets\/.*\.(js|css)$/.test(file.path) ? 'public, max-age=31536000, immutable' : 'no-store',
          file.path,
        )
      publicFiles++
    }
    ports.set(name, port)
    console.log(
      JSON.stringify({
        version: name,
        source,
        tree,
        sourceRevision: manifest.sourceRevision,
        verifiedPublicFiles: publicFiles,
        verifiedHeaderResponses: headerReceipt.headerResponses,
      }),
    )
  }
  server.on('error', (error) => {
    console.error(error)
    void stop().then(() => process.exit(1))
  })
  server.listen(5193, '127.0.0.1', () => console.log('Local provider-applied security matrix ready'))
} catch (error) {
  console.error(error)
  await stop()
  process.exitCode = 1
}
