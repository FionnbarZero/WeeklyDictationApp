// Reuse the verified family build on existing grade origins. Never rebuild or
// redirect away from their browser storage; only select the expected grade.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'
import { familyBetaHostingHeaders } from './familyBetaDelivery.ts'

const artifact = resolve(process.argv[2] || '')
const slug = process.argv[3]
const grades = { kindergarten: 'Kindergarten', grade2: 'Grade 2', grade5: 'Grade 5' } as const
if (!slug || !(slug in grades)) throw new Error('Specify an existing grade alias.')
const grade = grades[slug as keyof typeof grades]
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const manifest = JSON.parse(readFileSync(join(artifact, 'family-beta-manifest.json'), 'utf8'))
if (
  manifest.grade !== 'Family' ||
  manifest.sourceRevision !== revision ||
  manifest.firebaseProject !== 'weeklydictationapp' ||
  manifest.canonicalOrigin !== 'https://ninjadojo.meghangames.com' ||
  fileTreeSha256(artifactFileRecords(artifact)) !== manifest.fileTreeSha256
)
  throw new Error('The tested family artifact identity or checksum does not match.')
const directory = mkdtempSync(join(tmpdir(), `ninja-sync-${slug}-`))
cpSync(artifact, directory, { recursive: true })
const wrapper = join(directory, 'family-beta-preview.html')
const selectGrade = `<script>if(!new URLSearchParams(location.search).has('grade')){const u=new URL(location.href);u.searchParams.set('grade','${slug}');history.replaceState(null,'',u);}</script>`
writeFileSync(
  wrapper,
  readFileSync(wrapper, 'utf8').replace('<head>', () => `<head>${selectGrade}`),
)
if (slug === 'grade2') writeFileSync(join(directory, '.nojekyll'), '')
const files = artifactFileRecords(directory)
Object.assign(manifest, {
  grade,
  entry: `family-beta-preview.html?grade=${slug}`,
  files,
  fileTreeSha256: fileTreeSha256(files),
  packaging: 'Same tested family assets; grade entry and manifest only.',
})
writeFileSync(join(directory, 'family-beta-manifest.json'), JSON.stringify(manifest, null, 2))
const config = `${directory}.firebase.json`
if (slug !== 'grade2')
  writeFileSync(
    config,
    JSON.stringify(
      {
        hosting: {
          site: slug === 'kindergarten' ? 'weeklydictation-k-beta' : 'weeklydictation-g5-beta',
          public: directory,
          ignore: ['**/.*'],
          cleanUrls: false,
          headers: familyBetaHostingHeaders,
          redirects: [{ source: '/', destination: `/family-beta-preview.html?grade=${slug}`, type: 302 }],
        },
      },
      null,
      2,
    ),
  )
console.log(
  JSON.stringify({
    directory,
    config: slug === 'grade2' ? null : config,
    grade,
    revision,
    hash: manifest.fileTreeSha256,
  }),
)
