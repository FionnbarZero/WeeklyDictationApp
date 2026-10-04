import { requireFullGitRevision } from './familyBetaRelease.ts'

export const GRADE2_PAGES_ORIGIN = 'https://fionnbarzero.github.io/WeeklyDictationApp/' as const
export const GRADE2_PAGES_REF = 'refs/heads/gh-pages' as const
export const GRADE2_PAGES_REMOTE_URL = 'https://github.com/FionnbarZero/WeeklyDictationApp.git' as const

export type Grade2PagesPromotionPlan = {
  operation: 'promote'
  sourceRevision: string
  expectedCurrentDeployment: string
  destinationRef: typeof GRADE2_PAGES_REF
  stableOrigin: typeof GRADE2_PAGES_ORIGIN
  treeSource: 'verified-grade2-artifact'
  fastForwardParent: string
}

export type Grade2PagesRollbackPlan = {
  operation: 'rollback'
  targetDeployment: string
  expectedCurrentDeployment: string
  destinationRef: typeof GRADE2_PAGES_REF
  stableOrigin: typeof GRADE2_PAGES_ORIGIN
  treeSource: string
  fastForwardParent: string
}

export function requireGrade2PagesOrigin(value: string | undefined) {
  if (value !== GRADE2_PAGES_ORIGIN) {
    throw new Error(`Repeat --confirm-origin ${GRADE2_PAGES_ORIGIN} exactly.`)
  }
  return value
}

export function grade2PagesPromotionPlan(
  sourceRevision: string,
  expectedCurrentDeployment: string,
): Grade2PagesPromotionPlan {
  const revision = requireFullGitRevision(sourceRevision, 'Grade 2 source revision')
  const current = requireFullGitRevision(expectedCurrentDeployment, 'Current Grade 2 deployment')
  return {
    operation: 'promote',
    sourceRevision: revision,
    expectedCurrentDeployment: current,
    destinationRef: GRADE2_PAGES_REF,
    stableOrigin: GRADE2_PAGES_ORIGIN,
    treeSource: 'verified-grade2-artifact',
    fastForwardParent: current,
  }
}

export function grade2PagesRollbackPlan(
  targetDeployment: string,
  expectedCurrentDeployment: string,
): Grade2PagesRollbackPlan {
  const target = requireFullGitRevision(targetDeployment, 'Grade 2 rollback deployment')
  const current = requireFullGitRevision(expectedCurrentDeployment, 'Current Grade 2 deployment')
  if (target === current) throw new Error('The Grade 2 rollback target must differ from the current deployment.')
  return {
    operation: 'rollback',
    targetDeployment: target,
    expectedCurrentDeployment: current,
    destinationRef: GRADE2_PAGES_REF,
    stableOrigin: GRADE2_PAGES_ORIGIN,
    treeSource: `${target}^{tree}`,
    fastForwardParent: current,
  }
}
