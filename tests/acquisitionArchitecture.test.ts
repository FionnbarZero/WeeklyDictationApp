import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { ESTABLISHED_DT_WORDS } from '../src/domain.ts'
import { grade2PracticeProfile } from '../src/practice/profiles/grade2.ts'

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function importsFrom(fileSource: string) {
  return [...fileSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
}

test('the Acquisition engine boundary has only its approved dependencies', () => {
  assert.deepEqual(importsFrom(source('../src/acquisition/contracts.ts')), [])
  assert.deepEqual(importsFrom(source('../src/acquisition/engine.ts')), ['./contracts.ts'])
  assert.deepEqual(importsFrom(source('../src/acquisition/strategies/grade2.ts')), ['../contracts.ts'])
})

test('the Grade 2 profile and domain compatibility export share the canonical strategy objects', () => {
  assert.equal(grade2PracticeProfile.acquisition, grade2AcquisitionStrategy)
  assert.equal(ESTABLISHED_DT_WORDS, grade2AcquisitionStrategy.establishedDtTargets)
})

test('scoring policy remains outside the pure Acquisition engine', () => {
  assert.doesNotMatch(source('../src/acquisition/engine.ts'), /shouldRecordAcquisitionAnswer/)
  assert.match(source('../src/domain.ts'), /export function shouldRecordAcquisitionAnswer/)
})
