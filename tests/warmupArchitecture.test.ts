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
  assert.doesNotMatch(combinedSource, /['"]\.\.\/domain(?:\.ts)?['"]|['"]\.\.\/App(?:\.tsx)?['"]|firestoreClient|firebaseClient|react|localStorage|lifecycle\/registry|practice\/profiles\/registry/i)
})

test('the domain facade preserves the public Warmup contracts and compatibility entry points', () => {
  const domainSource = source('../src/domain.ts')
  assert.match(domainSource, /export type \{ ChildWordState, WarmupCategory, WarmupSelection \} from ['"]\.\/warmup\/contracts\.ts['"]/)
  assert.match(domainSource, /export function deriveChildWordStates/)
  assert.match(domainSource, /export function buildWarmupSelection/)
})
