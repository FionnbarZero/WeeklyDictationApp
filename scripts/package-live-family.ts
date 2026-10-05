// Reuse the all-grade, browser-tested candidate; do not rebuild its application code.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256, sha256 } from './familyBetaRelease.ts'
import { familyBetaHostingHeaders } from './familyBetaDelivery.ts'

const grade = process.argv[2]
if (grade !== 'kindergarten' && grade !== 'grade2') throw new Error('Choose kindergarten or grade2.')
const archive = resolve('family-beta-artifacts/grade5-review-f4ef04f1e989.tar.gz')
if (sha256(readFileSync(archive)) !== '1013dcbe39f8d6fd41d124c65ccf2b0f57fd3b00c8936caaeeebc831779c3fe7')
  throw new Error('Reviewed archive checksum mismatch.')
const directory = mkdtempSync(join(tmpdir(), `dictation-live-${grade}-`))
execFileSync('tar', ['-xzf', archive, '-C', directory])
const manifest = JSON.parse(readFileSync(join(directory, 'family-beta-manifest.json'), 'utf8'))
if (fileTreeSha256(artifactFileRecords(directory)) !== manifest.fileTreeSha256)
  throw new Error('Reviewed artifact does not match its manifest.')
if (grade === 'grade2') {
  // Keep index.html as the iframe activity entry. Existing root bookmarks now open
  // the updated family wrapper; the explicit internal query avoids a redirect loop.
  const path = join(directory, 'index.html')
  const html = readFileSync(path, 'utf8')
  const redirect = `<script>if(window.parent===window&&!new URLSearchParams(location.search).has('family-preview'))location.replace('./family-beta-preview.html?grade=grade2');</script>`
  writeFileSync(path, html.replace('<head>', `<head>${redirect}`))
  writeFileSync(join(directory, '.nojekyll'), '')
}
const files = artifactFileRecords(directory)
Object.assign(manifest, {
  grade: grade === 'grade2' ? 'Grade 2' : 'Kindergarten',
  entry: `family-beta-preview.html?grade=${grade}`,
  files,
  fileTreeSha256: fileTreeSha256(files),
  packaging: 'Reused verified f4ef04f application assets; grade-specific entry and manifest only.',
})
writeFileSync(join(directory, 'family-beta-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const config = `${directory}.firebase.json`
writeFileSync(
  config,
  JSON.stringify(
    {
      hosting: {
        site: grade === 'kindergarten' ? 'weeklydictation-k-beta' : 'weeklydictation-g2-preview',
        public: directory,
        ignore: ['**/.*'],
        cleanUrls: false,
        headers: familyBetaHostingHeaders,
        redirects: [{ source: '/', destination: `/family-beta-preview.html?grade=${grade}`, type: 302 }],
      },
    },
    null,
    2,
  ),
)
console.log(
  JSON.stringify(
    { directory, config, grade, revision: manifest.sourceRevision, hash: manifest.fileTreeSha256 },
    null,
    2,
  ),
)
