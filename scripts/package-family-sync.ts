import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const root = resolve(import.meta.dirname, '..')
const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
if (git(['status', '--porcelain'])) throw new Error('Commit tested source before packaging.')
const revision = git(['rev-parse', 'HEAD'])
const directory = mkdtempSync(join(tmpdir(), 'ninja-dojo-family-sync-'))
execFileSync('npx', ['vite', 'build', '--mode', 'family-sync', '--base=./', '--outDir', directory], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_GIT_REVISION: revision },
})
if (!readFileSync(join(directory, 'family-beta-preview.html'), 'utf8').includes('id="beta-root"'))
  throw new Error('The family entry page was not built.')
for (const [entry, grade] of [
  ['index.html', ''],
  ['kindergarten-learning-lab.html', 'kindergarten'],
  ['grade5-learning-hub.html', 'grade5'],
]) {
  const path = join(directory, entry)
  const redirect = grade
    ? `<script>if(window.parent===window){const q=new URLSearchParams(location.search);q.delete('family-preview');if(!q.has('grade'))q.set('grade','${grade}');location.replace('./family-beta-preview.html?'+q);}</script>`
    : `<script>if(window.parent===window)location.replace('./family-beta-preview.html'+location.search);</script>`
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace('<head>', () => `<head>${redirect}`),
  )
}
writeFileSync(
  join(directory, '_headers'),
  `/*
  Cache-Control: no-store
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(self)
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
)
const files = artifactFileRecords(directory)
const manifest = {
  schema: 1,
  grade: 'Family',
  sourceRevision: revision,
  entry: 'family-beta-preview.html',
  canonicalOrigin: 'https://ninjadojo.meghangames.com',
  firebaseProject: 'weeklydictationapp',
  persistence:
    'Parent-authenticated results and saved practice sync; reports stay on device; recordings stay temporary.',
  fileTreeSha256: fileTreeSha256(files),
  files,
}
writeFileSync(join(directory, 'family-beta-manifest.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ directory, revision, fileTreeSha256: manifest.fileTreeSha256 }, null, 2))
