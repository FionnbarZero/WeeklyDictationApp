import assert from 'node:assert/strict'
import test from 'node:test'
import { DEVELOPMENT_GIT_REVISION, resolveBuildGitRevision } from '../scripts/buildMetadata.ts'

test('release builds use an explicit revision before repository metadata', () => {
  assert.equal(
    resolveBuildGitRevision({
      environmentRevision: 'ABCDEF1234567',
      repositoryRevision: () => '1111111111111111111111111111111111111111',
      required: true,
    }),
    'abcdef1234567',
  )
})

test('release builds use repository metadata when no explicit revision is provided', () => {
  assert.equal(
    resolveBuildGitRevision({
      repositoryRevision: () => 'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
      required: true,
    }),
    'fedcba9876543210fedcba9876543210fedcba98',
  )
})

test('release builds fail closed when no valid Git revision is available', () => {
  assert.throws(
    () => resolveBuildGitRevision({ repositoryRevision: () => 'not-a-revision', required: true }),
    /build identity is missing/i,
  )
  assert.throws(
    () =>
      resolveBuildGitRevision({
        environmentRevision: 'release-latest',
        repositoryRevision: () => '1111111111111111111111111111111111111111',
        required: true,
      }),
    /VITE_GIT_REVISION/,
  )
})

test('local development has an explicit non-release fallback', () => {
  assert.equal(resolveBuildGitRevision({ repositoryRevision: () => '', required: false }), DEVELOPMENT_GIT_REVISION)
})
