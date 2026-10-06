// Fast-forward only. Retains every prior Pages deployment and never touches browser data.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

const artifact = resolve(process.argv[2] || '')
const expected = process.argv[3]
const requestedSource = process.argv.find(arg => arg.startsWith('--source-revision='))?.split('=')[1]
const sourceRevision = requestedSource || 'f4ef04f1e9898a21553ade00db425bcd8d897bc0'
if (!/^[a-f0-9]{40}$/.test(expected || '')) throw new Error('Supply the verified previous deployment.')
if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('Invalid reviewed source revision.')
const git = (args: string[], env = process.env, input?: string) =>
  execFileSync('git', args, { encoding: 'utf8', env, input }).trim()
if (git(['remote', 'get-url', 'origin']) !== 'https://github.com/FionnbarZero/WeeklyDictationApp.git')
  throw new Error('Wrong remote.')
const manifest = JSON.parse(readFileSync(join(artifact, 'family-beta-manifest.json'), 'utf8'))
if (
  manifest.grade !== 'Grade 2' ||
  manifest.sourceRevision !== sourceRevision ||
  fileTreeSha256(artifactFileRecords(artifact)) !== manifest.fileTreeSha256
)
  throw new Error('Grade 2 reviewed artifact validation failed.')
const index = readFileSync(join(artifact, 'index.html'), 'utf8')
const oldEntry = index.includes("location.replace('./family-beta-preview.html?grade=grade2')")
const familyEntry = manifest.firebaseProject === 'weeklydictationapp'
  && manifest.canonicalOrigin === 'https://ninjadojo.meghangames.com'
  && index.includes("location.replace('./family-beta-preview.html'+location.search)")
  && readFileSync(join(artifact, 'family-beta-preview.html'), 'utf8').includes("u.searchParams.set('grade','grade2')")
if (!oldEntry && !familyEntry)
  throw new Error('Missing updated root entry.')
if (requestedSource && git(['rev-parse', 'HEAD']) !== sourceRevision) throw new Error('Reviewed source must match the current checkout.')
console.log(
  JSON.stringify({
    previousDeployment: expected,
    sourceRevision: manifest.sourceRevision,
    hash: manifest.fileTreeSha256,
    artifact,
  }),
)
if (!process.argv.includes('--execute')) process.exit(0)
git(['fetch', 'origin', 'gh-pages'])
if (git(['rev-parse', 'origin/gh-pages']) !== expected) throw new Error('Pages changed; do not overwrite.')
const temp = mkdtempSync(join(tmpdir(), 'dictation-pages-index-'))
const env = {
  ...process.env,
  GIT_INDEX_FILE: join(temp, 'index'),
  GIT_AUTHOR_NAME: 'Weekly Dictation Release',
  GIT_AUTHOR_EMAIL: 'weekly-dictation-release@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'Weekly Dictation Release',
  GIT_COMMITTER_EMAIL: 'weekly-dictation-release@users.noreply.github.com',
}
const prefix = [`--git-dir=${git(['rev-parse', '--absolute-git-dir'])}`, `--work-tree=${artifact}`]
git([...prefix, 'read-tree', '--empty'], env)
git([...prefix, 'add', '--all', '--force', '.'], env)
const tree = git([...prefix, 'write-tree'], env)
const commit = git(
  ['commit-tree', tree, '-p', expected],
  env,
  `Publish reviewed Grade 2 family app ${manifest.sourceRevision}\n`,
)
git(['push', 'origin', `${commit}:refs/heads/gh-pages`])
if (git(['ls-remote', 'origin', 'refs/heads/gh-pages']).split(/\s+/)[0] !== commit)
  throw new Error('Remote verification failed.')
console.log(
  JSON.stringify({ deployment: commit, previousDeployment: expected, sourceRevision: manifest.sourceRevision }),
)
