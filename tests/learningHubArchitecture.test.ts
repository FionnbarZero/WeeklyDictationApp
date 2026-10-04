import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const hubDirectory = fileURLToPath(new URL('../src/learningHub/', import.meta.url))

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function importsFrom(fileSource: string) {
  return [...fileSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function sideEffectImportsFrom(fileSource: string) {
  return [...fileSource.matchAll(/^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm)].map((match) => match[1])
}

function typeScriptFiles(directory = hubDirectory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return typeScriptFiles(path)
    if (!entry.isFile() || !/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) return []
    return [relative(hubDirectory, path).split(sep).join('/')]
  }).sort()
}

test('the shared Learning Hub remains a grade-neutral presentation boundary', () => {
  const approvedImports: Record<string, string[]> = {
    'LearningHub.tsx': ['react', './contracts.ts'],
    'activityNames.ts': [],
    'contracts.ts': [],
  }
  assert.deepEqual(typeScriptFiles(), Object.keys(approvedImports).sort())
  const combined = typeScriptFiles().map((file) => source(`../src/learningHub/${file}`)).join('\n')

  for (const [file, imports] of Object.entries(approvedImports)) {
    const fileSource = source(`../src/learningHub/${file}`)
    assert.deepEqual(importsFrom(fileSource), imports)
    assert.deepEqual(sideEffectImportsFrom(fileSource), [])
  }

  assert.doesNotMatch(combined, /grade\s*[25]|kindergarten/i)
  assert.doesNotMatch(combined, /curriculum|lifecycle|acquisition|warmup|firestore|firebase|localStorage|App\.tsx|domain(?:\.ts)?/i)
  assert.doesNotMatch(combined, /\brequire\s*\(|\bimport\s*\(|^\s*\/\/\/\s*<reference\b/m)
  assert.match(source('../src/learningHub/LearningHub.tsx'), /onLaunch: \(launch: Launch, context: LearningHubLaunchContext\) => void/)
  assert.match(source('../src/learningHub/contracts.ts'), /LearningHubViewModel<Launch>/)
})

test('grade-specific Learning Hub behavior is supplied through an adapter', () => {
  const adapter = source('../src/grade5Lab/learningHubView.ts')
  const sharedHub = source('../src/learningHub/LearningHub.tsx')

  assert.match(adapter, /LearningHubViewModel<Grade5HubLaunch>/)
  assert.match(adapter, /grade5LabWritingRequestIsConnected/)
  assert.doesNotMatch(sharedHub, /Grade5|Grade 5|Grade5ActivityLaunchRequest/)
})
