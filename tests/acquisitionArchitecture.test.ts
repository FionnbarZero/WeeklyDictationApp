import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { ESTABLISHED_DT_WORDS } from '../src/domain.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function importsFrom(fileSource: string) {
  return [...fileSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
}

const acquisitionDirectory = fileURLToPath(new URL('../src/acquisition/', import.meta.url))

function acquisitionTypeScriptFiles(directory = acquisitionDirectory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return acquisitionTypeScriptFiles(entryPath)
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return []
    return [relative(acquisitionDirectory, entryPath).split(sep).join('/')]
  }).sort()
}

test('the Acquisition engine boundary has only its approved dependencies', () => {
  const approvedImports: Record<string, string[]> = {
    'contracts.ts': [],
    'engine.ts': ['./contracts.ts'],
    'strategies/grade2.ts': ['../contracts.ts'],
  }
  assert.deepEqual(acquisitionTypeScriptFiles(), Object.keys(approvedImports).sort())
  for (const [file, imports] of Object.entries(approvedImports)) {
    assert.deepEqual(importsFrom(source(`../src/acquisition/${file}`)), imports)
  }
})

test('the Grade 2 profile and domain compatibility export share the canonical strategy objects', () => {
  assert.equal(grade2PracticeProfile.acquisition, grade2AcquisitionStrategy)
  assert.equal(ESTABLISHED_DT_WORDS, grade2AcquisitionStrategy.establishedDtTargets)
})

test('scoring policy remains outside the pure Acquisition engine', () => {
  assert.doesNotMatch(source('../src/acquisition/engine.ts'), /shouldRecordAcquisitionAnswer/)
  assert.match(source('../src/domain.ts'), /export function shouldRecordAcquisitionAnswer/)
})
