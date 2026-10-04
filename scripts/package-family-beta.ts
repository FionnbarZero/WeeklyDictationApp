import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { APP_VERSION } from '../src/releaseMetadata.ts'
import {
  FAMILY_BETA_ARTIFACT_SCHEMA,
  GRADE2_CURRICULUM_SOURCE_PATH,
  GRADE5_CURRICULUM_SOURCE_PATH,
  artifactFileRecords,
  familyBetaGradeConfig,
  fileTreeSha256,
  grade2CurriculumSourceFromSnapshot,
  grade5CurriculumSourceFromSnapshot,
  requireFamilyBetaGrade,
  requireMatchingSourceRevision,
  sha256,
  verifyFamilyBetaArtifact,
  type FamilyBetaArtifactManifest,
} from './familyBetaRelease.ts'

const root = resolve(import.meta.dirname, '..')

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function capture(program: string, args: string[]) {
  return execFileSync(program, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
}

function run(program: string, args: string[], environment: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(program, args, { cwd: root, env: environment, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed with exit code ${result.status}.`)
}

const grade = requireFamilyBetaGrade(flag('--grade'))
const allowDirty = process.argv.includes('--allow-dirty')
const dirty = Boolean(capture('git', ['status', '--porcelain']))
if (dirty && !allowDirty) throw new Error('Refusing to package a family beta artifact from a dirty worktree.')

const revision = requireMatchingSourceRevision(process.env.GITHUB_SHA, capture('git', ['rev-parse', 'HEAD']))
const outputDirectory = resolve(root, 'family-beta-dist', grade)
const artifactDirectory = resolve(root, 'family-beta-artifacts')
const gradeConfig = familyBetaGradeConfig[grade]
rmSync(outputDirectory, { recursive: true, force: true })
mkdirSync(outputDirectory, { recursive: true })

run('npx', ['vite', 'build', '--mode', 'family-beta', '--outDir', outputDirectory, '--emptyOutDir'], {
  ...process.env,
  VITE_FAMILY_BETA_GRADE: grade,
  VITE_GIT_REVISION: revision,
  VITE_PUBLIC_PREVIEW: 'true',
})

let curriculumSource: FamilyBetaArtifactManifest['curriculumSource']
const copiedCurriculumDirectory = resolve(outputDirectory, 'curriculum')
const suppliedCurriculumSnapshot = grade === 'grade2' ? flag('--curriculum-snapshot') : undefined
if (grade === 'grade2') {
  if (
    !suppliedCurriculumSnapshot &&
    (!process.env.GOOGLE_OAUTH_CLIENT_ID ||
      !process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
      !process.env.GOOGLE_OAUTH_REFRESH_TOKEN)
  ) {
    throw new Error(
      'Grade 2 packaging requires read-only Google OAuth credentials or --curriculum-snapshot for an already validated snapshot.',
    )
  }
  const outputSnapshot = resolve(outputDirectory, GRADE2_CURRICULUM_SOURCE_PATH)
  run('node', [
    '--experimental-strip-types',
    'scripts/snapshot-grade2-slides.ts',
    `--output=${outputSnapshot}`,
    ...(suppliedCurriculumSnapshot ? [`--input=${resolve(root, suppliedCurriculumSnapshot)}`] : []),
  ])
  curriculumSource = grade2CurriculumSourceFromSnapshot(outputSnapshot)
  rmSync(resolve(outputDirectory, GRADE5_CURRICULUM_SOURCE_PATH), { force: true })
} else if (grade === 'grade5') {
  const outputSnapshot = resolve(outputDirectory, GRADE5_CURRICULUM_SOURCE_PATH)
  curriculumSource = grade5CurriculumSourceFromSnapshot(outputSnapshot)
  rmSync(resolve(outputDirectory, GRADE2_CURRICULUM_SOURCE_PATH), { force: true })
} else {
  rmSync(copiedCurriculumDirectory, { recursive: true, force: true })
}

const builtEntry = resolve(outputDirectory, gradeConfig.sourceHtml)
if (!existsSync(builtEntry))
  throw new Error(`The ${gradeConfig.displayName} build did not create ${gradeConfig.sourceHtml}.`)
if (gradeConfig.sourceHtml !== 'index.html') renameSync(builtEntry, resolve(outputDirectory, 'index.html'))
rmSync(resolve(outputDirectory, '.vite'), { recursive: true, force: true })
if (grade === 'grade2') writeFileSync(resolve(outputDirectory, '.nojekyll'), '\n')

const files = artifactFileRecords(outputDirectory)
const manifest: FamilyBetaArtifactManifest = {
  schema: FAMILY_BETA_ARTIFACT_SCHEMA,
  grade,
  displayName: gradeConfig.displayName,
  status: gradeConfig.status,
  persistence: gradeConfig.persistence,
  applicationVersion: APP_VERSION,
  sourceRevision: revision,
  sourceCommittedAt: capture('git', ['show', '-s', '--format=%cI', revision]),
  dirty,
  entry: 'index.html',
  build: {
    command: `npm run package:family-beta -- --grade ${grade}${suppliedCurriculumSnapshot ? ` --curriculum-snapshot ${suppliedCurriculumSnapshot}` : ''}`,
    node: process.version,
    npm: capture('npm', ['--version']),
    packageLockSha256: sha256(
      execFileSync('git', ['show', `${revision}:package-lock.json`], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'inherit'],
      }),
    ),
  },
  ...(curriculumSource ? { curriculumSource } : {}),
  fileTreeSha256: fileTreeSha256(files),
  files,
}
writeFileSync(resolve(outputDirectory, 'family-beta-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

if (!dirty) verifyFamilyBetaArtifact(outputDirectory, grade)
mkdirSync(artifactDirectory, { recursive: true })
const archiveName = `${grade}-${revision}.tar.gz`
const archivePath = resolve(artifactDirectory, archiveName)
rmSync(archivePath, { force: true })
rmSync(`${archivePath}.sha256`, { force: true })
run('tar', ['-czf', archivePath, '-C', outputDirectory, '.'])
const actualArchiveSha256 = capture('shasum', ['-a', '256', archivePath]).split(/\s+/)[0]
writeFileSync(`${archivePath}.sha256`, `${actualArchiveSha256}  ${basename(archivePath)}\n`)

console.log(`Packaged ${gradeConfig.displayName} family beta artifact from ${revision}.`)
console.log(`File tree SHA-256 ${manifest.fileTreeSha256}`)
console.log(`Archive ${basename(archivePath)} SHA-256 ${actualArchiveSha256}`)
