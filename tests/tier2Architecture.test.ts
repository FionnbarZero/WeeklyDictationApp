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

function isTypeScriptFamilyFile(fileName: string) {
  return /\.(?:ts|tsx|mts|cts)$/.test(fileName)
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const tier2Directory = join(repositoryRoot, 'src/tier2')

function typeScriptFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return typeScriptFiles(entryPath, root)
    if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
    return [relative(root, entryPath).split(sep).join('/')]
  }).sort()
}

test('the Tier 2 reading boundary contains only its approved modules and dependencies', () => {
  const approvedImports: Record<string, string[]> = {
    'acquisition.ts': ['../acquisition/contracts.ts', './contracts.ts'],
    'contracts.ts': ['../acquisition/contracts.ts', '../domain/contracts.ts', '../lifecycle/contracts.ts'],
    'lifecycle.ts': ['../domain/contracts.ts', '../lifecycle/contracts.ts', './contracts.ts', './acquisition.ts'],
    'pathway.ts': ['../acquisition/contracts.ts', './contracts.ts'],
    'profiles/grade2.ts': ['../../acquisition/strategies/grade2.ts', '../../lifecycle/strategies/grade2ReplacementStrategy.ts', '../acquisition.ts', '../contracts.ts'],
    'profiles/grade5.ts': ['../../acquisition/strategies/grade5.ts', '../../lifecycle/strategies/grade5ProgressionStrategy.ts', '../acquisition.ts', '../contracts.ts'],
    'profiles/kindergarten.ts': ['../../acquisition/strategies/kindergarten.ts', '../../lifecycle/strategies/kindergartenUnitStrategy.ts', '../acquisition.ts', '../contracts.ts'],
    'registry.ts': ['./contracts.ts', './profiles/grade2.ts', './profiles/grade5.ts', './profiles/kindergarten.ts'],
  }
  assert.deepEqual(typeScriptFiles(tier2Directory), Object.keys(approvedImports).sort())

  for (const [file, imports] of Object.entries(approvedImports)) {
    const fileSource = source(`../src/tier2/${file}`)
    assert.deepEqual(importsFrom(fileSource), imports)
    assert.deepEqual(sideEffectImportsFrom(fileSource), [])
    assert.doesNotMatch(fileSource, /\brequire\s*\(/)
    assert.doesNotMatch(fileSource, /\bimport\s*\(/)
    assert.doesNotMatch(fileSource, /^\s*\/\/\/\s*<reference\b/m)
  }
})

test('Tier 2 reading cannot depend on UI, persistence, configuration, or the domain facade', () => {
  const combinedSource = typeScriptFiles(tier2Directory)
    .map((file) => source(`../src/tier2/${file}`))
    .join('\n')
  assert.doesNotMatch(combinedSource, /['"]\.\.\/domain(?:\.ts)?['"]|App\.tsx|firestore|firebase|localStorage|config\.ts|\breact\b/i)
})

test('the Tier 2 boundary is imported only by approved reading integration surfaces', () => {
  const approvedConsumers = new Set([
    'src/App.tsx',
    'src/familyBeta/ReentryPractice.tsx',
    'src/grade2/learningHub.ts',
    'src/home/HomeViews.tsx',
    'src/grade5Lab/readingPractice.ts',
    'src/grade5LearningHubHarness.tsx',
    'src/kindergartenLab/readingPractice.ts',
    'src/kindergartenLearningLabHarness.tsx',
    'src/readingPractice/Tier2ReadingPractice.tsx',
  ])
  const productionFiles = ['src', 'backend', 'scripts'].flatMap((rootName) => {
    const root = join(repositoryRoot, rootName)
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) return visit(entryPath)
      if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
      const repositoryPath = relative(repositoryRoot, entryPath).split(sep).join('/')
      return repositoryPath.startsWith('src/tier2/')
        || repositoryPath.startsWith('src/tier2Lab/')
        || repositoryPath === 'src/tier2ReadingLabHarness.tsx'
        ? []
        : [entryPath]
    })
    return visit(root)
  })

  const consumers: string[] = []
  for (const file of productionFiles) {
    const repositoryPath = relative(repositoryRoot, file).split(sep).join('/')
    const tier2Imports = [...importsFrom(readFileSync(file, 'utf8')), ...sideEffectImportsFrom(readFileSync(file, 'utf8'))]
      .filter((specifier) => /(?:^|\/)tier2(?:\/|$)/.test(specifier))
    if (tier2Imports.length === 0) continue
    assert.ok(approvedConsumers.has(repositoryPath), repositoryPath)
    consumers.push(repositoryPath)
  }
  assert.deepEqual(consumers.sort(), [...approvedConsumers].sort())
})
