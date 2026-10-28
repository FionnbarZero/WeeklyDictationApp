import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../vite.config.ts'

test('only family-sync consolidates shared helpers while preserving lazy application boundaries', () => {
  assert.equal(typeof config, 'function')
  if (typeof config !== 'function') throw new Error('Expected build configuration factory')
  const family = config({ command: 'build', mode: 'family-sync' })
  assert.ok(!(family instanceof Promise))
  if (family instanceof Promise) throw new Error('Expected synchronous build configuration')
  const output = family.build?.rollupOptions?.output
  assert.ok(output && !Array.isArray(output))
  if (!output || Array.isArray(output)) throw new Error('Expected one output configuration')
  const groups = output.codeSplitting?.groups
  assert.equal(groups?.length, 3)
  const familySupport = groups?.[0]
  assert.equal(familySupport?.name, 'shared-family-support')
  assert.equal(familySupport?.minShareCount, 1)
  assert.ok(familySupport?.test instanceof RegExp)
  for (const path of [
    'src/familyBeta/deviceSync.ts',
    'src/ninjaSkills/progressStore.ts',
    'src/warmup/visits/nativeVisit.ts',
  ])
    assert.ok(familySupport.test.test(path))
  for (const path of [
    'src/familyBeta/main.tsx',
    'src/writingAcquisition/Grade2WritingPractice.tsx',
    'src/learningModules/memory-lanterns/Game.tsx',
  ])
    assert.equal(familySupport.test.test(path), false)
  assert.deepEqual(groups?.[1], { name: 'shared-icons', test: /node_modules[\\/]lucide-react[\\/]/, minShareCount: 2 })
  const helpers = groups?.[2]
  assert.equal(helpers?.name, 'shared-activity-models')
  assert.equal(helpers?.minShareCount, 2)
  assert.ok(helpers?.test instanceof RegExp)
  for (const path of [
    'src/releaseMetadata.ts',
    'src/accessibility/useDialogFocus.ts',
    'src/learningModules/memory-lanterns/runtime/model.ts',
  ])
    assert.ok(helpers.test.test(path))
  for (const path of [
    'src/App.tsx',
    'src/familyBeta/main.tsx',
    'src/learningModules/memory-lanterns/Game.tsx',
    'src/writingAcquisition/Grade2WritingPractice.tsx',
    'src/familyBeta/deviceSync.ts',
  ])
    assert.equal(helpers.test.test(path), false)
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
