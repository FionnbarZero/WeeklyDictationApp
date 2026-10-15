import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../vite.config.ts'

test('only family-sync consolidates shared icons while preserving lazy application boundaries', () => {
  assert.equal(typeof config, 'function')
  if (typeof config !== 'function') throw new Error('Expected build configuration factory')
  const family = config({ command: 'build', mode: 'family-sync' })
  assert.ok(!(family instanceof Promise))
  if (family instanceof Promise) throw new Error('Expected synchronous build configuration')
  const output = family.build?.rollupOptions?.output
  assert.ok(output && !Array.isArray(output))
  if (!output || Array.isArray(output)) throw new Error('Expected one output configuration')
  assert.deepEqual(output.codeSplitting, {
    groups: [{ name: 'shared-icons', test: /node_modules[\\/]lucide-react[\\/]/, minShareCount: 2 }],
  })
  const match = /node_modules[\\/]lucide-react[\\/]/
  assert.ok(match.test('/project/node_modules/lucide-react/dist/esm/icons/check.js'))
  assert.ok(match.test('C:\\project\\node_modules\\lucide-react\\dist\\esm\\icons\\check.js'))
  for (const path of ['src/App.tsx', 'src/writingAcquisition/Grade2WritingPractice.tsx', 'node_modules/react/index.js'])
    assert.equal(match.test(path), false)
  for (const mode of [
    'production',
    'staging',
    'writing-pilot',
    'writing-integration-preview',
    'stroke-teacher-preview',
  ]) {
    const other = config({ command: 'build', mode })
    assert.ok(!(other instanceof Promise))
    if (other instanceof Promise) throw new Error('Expected synchronous build configuration')
    assert.equal(other.build?.rollupOptions?.output, undefined)
  }
})
