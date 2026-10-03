import { execFileSync } from 'node:child_process'

export const DEVELOPMENT_GIT_REVISION = 'development' as const

const gitRevisionPattern = /^[a-f0-9]{7,40}$/i

export function readRepositoryGitRevision(cwd: string) {
  return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

export function resolveBuildGitRevision(input: {
  environmentRevision?: string
  repositoryRevision: () => string
  required: boolean
}) {
  const environmentRevision = input.environmentRevision?.trim()
  if (environmentRevision) {
    if (!gitRevisionPattern.test(environmentRevision)) {
      throw new Error('VITE_GIT_REVISION must be a 7- to 40-character hexadecimal Git revision.')
    }
    return environmentRevision.toLowerCase()
  }

  try {
    const repositoryRevision = input.repositoryRevision().trim()
    if (gitRevisionPattern.test(repositoryRevision)) return repositoryRevision.toLowerCase()
  } catch {
    // A source archive may not include Git metadata. Release builds must then
    // receive VITE_GIT_REVISION from the build system.
  }

  if (input.required) {
    throw new Error('Release build identity is missing. Provide VITE_GIT_REVISION or build from a Git checkout.')
  }
  return DEVELOPMENT_GIT_REVISION
}
