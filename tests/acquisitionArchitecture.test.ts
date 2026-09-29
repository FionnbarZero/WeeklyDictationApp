import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { ESTABLISHED_DT_WORDS, FAMILIAR_DT_WORDS } from '../src/domain.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function importsFrom(fileSource: string) {
  return [...fileSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function sideEffectImportsFrom(fileSource: string) {
  return [...fileSource.matchAll(/^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm)].map((match) => match[1])
}

const acquisitionDirectory = fileURLToPath(new URL('../src/acquisition/', import.meta.url))

function isTypeScriptFamilyFile(fileName: string) {
  return /\.(?:ts|tsx|mts|cts)$/.test(fileName)
}

function acquisitionTypeScriptFiles(directory = acquisitionDirectory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return acquisitionTypeScriptFiles(entryPath)
    if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
    return [relative(acquisitionDirectory, entryPath).split(sep).join('/')]
  }).sort()
}

test('the Acquisition engine boundary has only its approved dependencies', () => {
  const approvedImports: Record<string, string[]> = {
    'contracts.ts': [],
    'engine.ts': ['./contracts.ts'],
    'persistence/contracts.ts': ['../contracts.ts'],
    'persistence/identity.ts': ['../contracts.ts', './contracts.ts'],
    'persistence/migration.ts': ['../contracts.ts', '../engine.ts', './contracts.ts', './identity.ts', './validation.ts'],
    'persistence/reducer.ts': ['../contracts.ts', '../engine.ts', '../transition.ts', './contracts.ts', './identity.ts', './validation.ts'],
    'persistence/repository.ts': ['./contracts.ts'],
    'persistence/validation.ts': ['../contracts.ts', '../engine.ts', './contracts.ts', './identity.ts'],
    'strategies/grade2.ts': ['../contracts.ts'],
    'strategies/grade5.ts': ['../contracts.ts', './grade2.ts'],
    'strategies/kindergarten.ts': ['../contracts.ts'],
    'transition.ts': ['./contracts.ts', './engine.ts'],
  }
  assert.deepEqual(acquisitionTypeScriptFiles(), Object.keys(approvedImports).sort())
  for (const [file, imports] of Object.entries(approvedImports)) {
    const fileSource = source(`../src/acquisition/${file}`)
    assert.deepEqual(importsFrom(fileSource), imports)
    assert.deepEqual(sideEffectImportsFrom(fileSource), [])
    assert.doesNotMatch(fileSource, /\brequire\s*\(/)
    assert.doesNotMatch(fileSource, /\bimport\s*\(/)
    assert.doesNotMatch(fileSource, /^\s*\/\/\/\s*<reference\b/m)
  }
})

test('the Acquisition inventory and dependency scanner cover bypass extensions and side-effect imports', () => {
  for (const fileName of ['example.ts', 'example.tsx', 'example.mts', 'example.cts']) assert.equal(isTypeScriptFamilyFile(fileName), true)
  for (const fileName of ['example.js', 'example.jsx', 'example.mjs', 'example.cjs']) assert.equal(isTypeScriptFamilyFile(fileName), false)
  assert.deepEqual(sideEffectImportsFrom("import '../unapproved-module.ts'\n"), ['../unapproved-module.ts'])
})

test('the Grade 2 profile and domain compatibility export share the canonical strategy objects', () => {
  assert.equal(grade2PracticeProfile.acquisition, grade2AcquisitionStrategy)
  assert.equal(FAMILIAR_DT_WORDS, grade2AcquisitionStrategy.familiarDtTargets)
  assert.equal(ESTABLISHED_DT_WORDS, FAMILIAR_DT_WORDS)
})

test('scoring policy remains outside the pure Acquisition engine', () => {
  assert.doesNotMatch(source('../src/acquisition/engine.ts'), /shouldRecordAcquisitionAnswer/)
  assert.match(source('../src/domain.ts'), /export function shouldRecordAcquisitionAnswer/)
})

test('the pure Acquisition persistence contract is not activated by production orchestration or storage', () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
  const productionFiles = ['src', 'backend', 'scripts'].flatMap((root) => {
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) return visit(entryPath)
      if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
      const repositoryPath = relative(repositoryRoot, entryPath).split(sep).join('/')
      return repositoryPath.startsWith('src/acquisition/persistence/') ? [] : [entryPath]
    })
    return visit(join(repositoryRoot, root))
  })
  for (const file of productionFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /acquisition\/persistence/, relative(repositoryRoot, file))
  }
  for (const file of acquisitionTypeScriptFiles().filter((entry) => entry.startsWith('persistence/'))) {
    const contents = source(`../src/acquisition/${file}`)
    assert.doesNotMatch(contents, /from\s+['"][^'"]*(?:App|domain|firestoreClient|firebaseClient|react)[^'"]*['"]/i)
    assert.doesNotMatch(contents, /localStorage|sessionStorage/)
  }
})
