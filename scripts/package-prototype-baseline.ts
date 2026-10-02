import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'

const repositoryRoot = process.cwd()
const outputDirectory = resolve(repositoryRoot, 'prototype-dist')
const baselineDocument = resolve(repositoryRoot, 'docs/prototype-baseline.md')

function command(program: string, args: string[]) {
  return execFileSync(program, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}

function sha256(content: string | Buffer) {
  return createHash('sha256').update(content).digest('hex')
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

if (!existsSync(outputDirectory)) {
  throw new Error('prototype-dist is missing. Run npm run build:prototype-baseline first.')
}
if (!existsSync(baselineDocument)) {
  throw new Error('docs/prototype-baseline.md is required in the archived build.')
}

const dirtyFiles = command('git', ['status', '--porcelain'])
if (dirtyFiles) {
  throw new Error(`Refusing to archive a dirty working tree:\n${dirtyFiles}`)
}

const commit = command('git', ['rev-parse', 'HEAD'])
const tag = command('git', ['tag', '--points-at', 'HEAD'])
  .split('\n')
  .find((candidate) => /^prototype-baseline-\d{4}-\d{2}$/.test(candidate))
if (!tag) {
  throw new Error('HEAD must have a prototype-baseline-YYYY-MM tag before it can be packaged.')
}

mkdirSync(outputDirectory, { recursive: true })
copyFileSync(baselineDocument, resolve(outputDirectory, 'prototype-baseline.md'))

const fileRecords = filesBelow(outputDirectory)
  .filter((path) => basename(path) !== 'prototype-baseline-manifest.json')
  .map((path) => {
    const content = readFileSync(path)
    return {
      path: relative(outputDirectory, path),
      bytes: statSync(path).size,
      sha256: sha256(content),
    }
  })
  .sort((left, right) => left.path.localeCompare(right.path))

const manifest = {
  schemaVersion: 1,
  artifact: 'Weekly Dictation frozen prototype applications',
  tag,
  commit,
  createdAt: new Date().toISOString(),
  build: {
    command: 'npm run build:prototype-baseline',
    mode: 'prototype-baseline',
    node: process.version,
    npm: command('npm', ['--version']),
    packageLockSha256: sha256(readFileSync(resolve(repositoryRoot, 'package-lock.json'))),
  },
  verification: {
    document: 'prototype-baseline.md',
    browserCommands: ['npm run test:browser', 'npm run test:prototype-baseline'],
  },
  routes: [
    '/grade5-learning-hub.html',
    '/kindergarten-learning-lab.html',
    '/tier2-reading-lab.html',
    '/grade2-test-review-prototype.html',
    '/learning-games-harness.html',
    '/skywriting-harness.html',
    '/skywriting-acquisition-harness.html',
    '/skywriting-font-comparison.html',
    '/grade5-source-harness.html',
    '/kindergarten-source-harness.html',
  ],
  fileTreeSha256: sha256(fileRecords.map((file) => `${file.sha256}  ${file.path}`).join('\n')),
  files: fileRecords,
}

writeFileSync(resolve(outputDirectory, 'prototype-baseline-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const archivePath = resolve(repositoryRoot, `${tag}.tar.gz`)
command('tar', ['-czf', archivePath, '-C', outputDirectory, '.'])
const archiveSha = sha256(readFileSync(archivePath))
writeFileSync(`${archivePath}.sha256`, `${archiveSha}  ${basename(archivePath)}\n`)

console.log(`Created ${basename(archivePath)}`)
console.log(`SHA-256 ${archiveSha}`)
