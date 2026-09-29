import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function importsFrom(fileSource: string) {
  return [...fileSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function sideEffectImportsFrom(fileSource: string) {
  return [...fileSource.matchAll(/^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm)].map((match) => match[1])
}

const warmupDirectory = fileURLToPath(new URL('../src/warmup/', import.meta.url))

function isTypeScriptFamilyFile(fileName: string) {
  return /\.(?:ts|tsx|mts|cts)$/.test(fileName)
}

function warmupTypeScriptFiles(directory = warmupDirectory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return warmupTypeScriptFiles(entryPath)
    if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
    return [relative(warmupDirectory, entryPath).split(sep).join('/')]
  }).sort()
}

test('the Warmup boundary contains only its approved TypeScript-family files and dependencies', () => {
  const approvedImports: Record<string, string[]> = {
    'adaptive/contracts.ts': [],
    'adaptive/eligibility.ts': ['./contracts.ts', './identity.ts'],
    'adaptive/identity.ts': ['./contracts.ts'],
    'adaptive/lifecycleReconciliation.ts': ['./contracts.ts'],
    'adaptive/migration.ts': ['./contracts.ts', './eligibility.ts', './identity.ts', './migrationReplay.ts', './profileValidation.ts', './validation.ts'],
    'adaptive/migrationReplay.ts': ['./contracts.ts', './eligibility.ts', './identity.ts', './transitions.ts'],
    'adaptive/profileValidation.ts': ['./contracts.ts'],
    'adaptive/profileUpgrade.ts': ['./contracts.ts', './profileValidation.ts'],
    'adaptive/profiles/grade2.ts': ['../contracts.ts'],
    'adaptive/scheduler.ts': ['./contracts.ts', './eligibility.ts', './profileValidation.ts'],
    'adaptive/transitions.ts': ['./contracts.ts', './profileValidation.ts'],
    'adaptive/validation.ts': ['./contracts.ts', './identity.ts', './profileValidation.ts'],
    'contracts.ts': ['../domain/contracts.ts'],
    'engine.ts': ['../domain/contracts.ts', './contracts.ts'],
  }
  assert.deepEqual(warmupTypeScriptFiles(), Object.keys(approvedImports).sort())

  for (const [file, imports] of Object.entries(approvedImports)) {
    const fileSource = source(`../src/warmup/${file}`)
    assert.deepEqual(importsFrom(fileSource), imports)
    assert.deepEqual(sideEffectImportsFrom(fileSource), [])
    assert.doesNotMatch(fileSource, /\brequire\s*\(/)
    assert.doesNotMatch(fileSource, /\bimport\s*\(/)
    assert.doesNotMatch(fileSource, /^\s*\/\/\/\s*<reference\b/m)
  }
})

test('the Warmup dependency scanner recognizes side-effect static imports', () => {
  assert.deepEqual(sideEffectImportsFrom("import '../unapproved-module.ts'\n"), ['../unapproved-module.ts'])
})

test('the Warmup engine cannot depend on orchestration, persistence, UI, or the domain facade', () => {
  const combinedSource = warmupTypeScriptFiles().map((file) => source(`../src/warmup/${file}`)).join('\n')
  assert.doesNotMatch(combinedSource, /['"]\.\.\/domain(?:\.ts)?['"]|['"]\.\.\/App(?:\.tsx)?['"]|firestoreClient|firebaseClient|\breact\b|localStorage|lifecycle\/registry|practice\/profiles\/registry/i)
})

test('the domain facade preserves the public Warmup contracts and compatibility entry points', () => {
  const domainSource = source('../src/domain.ts')
  assert.match(domainSource, /export type \{ ChildWordState, WarmupCategory, WarmupSelection \} from ['"]\.\/warmup\/contracts\.ts['"]/)
  assert.match(domainSource, /export function deriveChildWordStates/)
  assert.match(domainSource, /export function buildWarmupSelection/)
})

test('the pure Adaptive Warmup model remains unused by production orchestration and persistence', () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
  const productionFiles = ['src', 'backend', 'scripts'].flatMap((root) => {
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) return visit(entryPath)
      if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
      const repositoryPath = relative(repositoryRoot, entryPath).split(sep).join('/')
      return repositoryPath.startsWith('src/warmup/adaptive/') ? [] : [entryPath]
    })
    return visit(join(repositoryRoot, root))
  })
  for (const file of productionFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /warmup\/adaptive/, relative(repositoryRoot, file))
  }
  assert.match(source('../src/domain.ts'), /version: 2/)
})

test('Adaptive Warmup transitions consume the profile-owned policy without a duplicate transition policy', () => {
  assert.doesNotMatch(source('../src/warmup/adaptive/contracts.ts'), /WarmupTransitionPolicy/)
  assert.match(source('../src/warmup/adaptive/transitions.ts'), /profile: AdaptiveWarmupProfile/)
  assert.match(source('../src/warmup/adaptive/transitions.ts'), /profile\.recentEntryPromotionCorrect/)
  assert.match(source('../src/warmup/adaptive/transitions.ts'), /profile\.rotationPolicy\.promotedTermEligibility/)
})
