import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

// Add one isolated interaction page to the retained combined website. Every
// pre-existing application byte, including its original manifest, is preserved.
const root = resolve(import.meta.dirname, '..')
const base = resolve(root, 'family-beta-artifacts/prototypes/w-combined-89bc62c/package')
const baseRevision = '89bc62cc262cc28dc2e914c4d02775b7f9e96292'
const output = resolve(process.argv[2] || 'warmup-combined-preview-dist')
if (existsSync(output)) throw new Error('Choose a new package folder; retained packages must not be overwritten.')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const manifest = JSON.parse(readFileSync(resolve(base, 'dojo-launch-manifest.json'), 'utf8'))
if (manifest.sourceRevision !== baseRevision) throw new Error('The retained combined baseline is not Prototype 6.')
for (const file of manifest.files) {
  const bytes = readFileSync(resolve(base, file.path))
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    throw new Error(`Retained baseline mismatch: ${file.path}`)
}
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.warmup-design.config.ts'], {
  cwd: root,
  stdio: 'inherit',
})
cpSync(base, output, { recursive: true })
for (const file of artifactFileRecords(resolve(root, 'warmup-design-preview-dist'))) {
  const destination = resolve(output, file.path)
  const bytes = readFileSync(resolve(root, 'warmup-design-preview-dist', file.path))
  if (existsSync(destination) && !readFileSync(destination).equals(bytes))
    throw new Error(`Asset collision: ${file.path}`)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(resolve(root, 'warmup-design-preview-dist', file.path), destination)
}
const files = artifactFileRecords(output)
writeFileSync(
  resolve(output, 'warmup-design-manifest.json'),
  JSON.stringify(
    {
      schema: 1,
      prototype: 'Writing Warmup / Prototype 1',
      sourceRevision: revision,
      baseApplicationRevision: baseRevision,
      baseApplicationUnchanged: true,
      entry: 'warmup-design-preview.html',
      grades: ['Kindergarten', 'Grade 2', 'Grade 5'],
      limitations:
        'Isolated teacher-source samples. Browser-only checkpoint; temporary ink. No scheduler, real mastery, reading or canonical integration changes.',
      fileTreeSha256: fileTreeSha256(files),
      files,
    },
    null,
    2,
  ),
)
console.log(`Prepared Warmup design with unchanged combined application: ${output}`)
