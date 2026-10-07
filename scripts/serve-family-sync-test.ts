import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, sep } from 'node:path'
import { prepareOfflineRollback } from './familyOfflineRollback.ts'

// Exercise the same packager used for publication, including its clean-source
// guard and grade-entry redirects. Tests intercept every remote request.
const output = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/package-family-sync.ts'], {
  encoding: 'utf8',
})
const artifact = JSON.parse(output.slice(output.lastIndexOf('\n{') + 1)) as { directory: string; revision: string }
let directory = resolve(artifact.directory)
// Explicit opt-in local rehearsal only; no such route exists in the deployed app.
const previousDirectory = process.env.FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT
const rollback = previousDirectory ? prepareOfflineRollback(previousDirectory, artifact.revision) : null
const types: Record<string, string> = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  mp3: 'audio/mpeg',
  woff2: 'font/woff2',
}
createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (rollback && req.method === 'POST' && url.pathname === '/__rehearsal__/version') {
    const version = url.searchParams.get('version')
    const selected =
      version === 'candidate'
        ? artifact.directory
        : version === 'previous'
          ? previousDirectory
          : version === 'rollback'
            ? rollback.directory
            : null
    if (!selected) {
      res.writeHead(400)
      res.end()
      return
    }
    directory = resolve(selected)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ version, candidate: artifact.revision, rollback: rollback.manifest.fileTreeSha256 }))
    return
  }
  const alias = url.pathname.startsWith('/alias/')
  let pathname = alias ? url.pathname.slice('/alias'.length) : url.pathname
  // Model Cloudflare's clean-URL redirect; /alias models a .html-preserving host.
  if (!alias && pathname === '/family-beta-preview.html') {
    res.writeHead(308, { Location: `/family-beta-preview${url.search}` })
    res.end()
    return
  }
  if (pathname === '/') pathname = '/index.html'
  else if (!pathname.split('/').pop()!.includes('.')) pathname += '.html'
  const file = resolve(directory, `.${decodeURIComponent(pathname)}`)
  if (!file.startsWith(`${directory}${sep}`)) {
    res.writeHead(403)
    res.end()
    return
  }
  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': types[file.split('.').pop()!] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(5193, '127.0.0.1', () => console.log(JSON.stringify({ ...artifact, testOrigin: 'http://127.0.0.1:5193' })))
