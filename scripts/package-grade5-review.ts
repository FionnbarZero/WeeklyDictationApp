// Packages the reviewed family wrapper and its embedded activities; does not publish anything.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'
import { familyBetaHostingHeaders } from './familyBetaDelivery.ts'

const root = resolve(import.meta.dirname, '..')
const curriculum = process.env.VITE_CURRICULUM_URL
if (
  !curriculum ||
  !/^https:\/\/weekly-dictation-curriculum-[a-z0-9-]+\.a\.run\.app\/curriculum\/beta$/.test(curriculum)
)
  throw new Error('Supply the verified curriculum service URL.')
const capture = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
if (capture(['status', '--porcelain'])) throw new Error('Commit reviewed source before packaging.')
const revision = capture(['rev-parse', 'HEAD'])
const directory = mkdtempSync(join(tmpdir(), 'dictation-grade5-review-'))
const output = join(directory, 'public')
execFileSync('npm', ['run', 'typecheck'], { cwd: root, stdio: 'inherit' })
execFileSync('npx', ['vite', 'build', '--mode', 'reconciliation', '--base=./', '--outDir', output], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_GIT_REVISION: revision,
    VITE_RECONCILIATION_PREVIEW: 'true',
    VITE_PUBLIC_PREVIEW: 'true',
    VITE_FIREBASE_API_KEY: '',
    VITE_FIREBASE_AUTH_DOMAIN: '',
    VITE_FIREBASE_PROJECT_ID: '',
    VITE_FIREBASE_APP_ID: '',
  },
})
const files = artifactFileRecords(output)
const manifest = {
  schema: 1,
  grade: 'Grade 5',
  sourceRevision: revision,
  curriculumEndpoint: curriculum,
  persistence: 'Completed scores and problem reports stay in this browser only; recordings are session-only.',
  entry: 'family-beta-preview.html?grade=grade5',
  fileTreeSha256: fileTreeSha256(files),
  files,
}
writeFileSync(join(output, 'family-beta-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(
  join(directory, 'firebase.json'),
  JSON.stringify(
    {
      hosting: {
        site: 'weeklydictation-g5-beta',
        public: output,
        ignore: ['**/.*'],
        cleanUrls: false,
        headers: familyBetaHostingHeaders,
        redirects: [{ source: '/', destination: '/family-beta-preview.html?grade=grade5', type: 302 }],
      },
    },
    null,
    2,
  ),
)
if (!readFileSync(join(output, 'family-beta-preview.html'), 'utf8').includes('beta-root'))
  throw new Error('Missing reviewed wrapper.')
console.log(
  JSON.stringify(
    { directory, config: join(directory, 'firebase.json'), revision, fileTreeSha256: manifest.fileTreeSha256 },
    null,
    2,
  ),
)
