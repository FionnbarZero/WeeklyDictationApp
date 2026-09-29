import { schoolYearToken } from '../curriculum/identity.ts'
import type { LifecycleContext, LifecycleScope, LifecycleStrategy } from './contracts.ts'
import { grade2ReplacementLifecycleStrategy } from './strategies/grade2ReplacementStrategy.ts'
import { grade5ProgressionLifecycleStrategy } from './strategies/grade5ProgressionStrategy.ts'
import { kindergartenUnitLifecycleStrategy } from './strategies/kindergartenUnitStrategy.ts'

const lifecycleStrategies: readonly LifecycleStrategy[] = [
  grade2ReplacementLifecycleStrategy,
  grade5ProgressionLifecycleStrategy,
  kindergartenUnitLifecycleStrategy,
]

export function lifecycleStrategyForScope(scope: Pick<LifecycleScope, 'grade' | 'schoolYearKey'>) {
  return lifecycleStrategies.find((strategy) => strategy.grade === scope.grade && strategy.schoolYearKey === scope.schoolYearKey) || null
}

export function lifecycleStrategyForGradeAndSchoolYear(grade: string | null | undefined, schoolYear: string | null | undefined) {
  if (!grade || !schoolYear) return null
  try {
    return lifecycleStrategyForScope({ grade, schoolYearKey: schoolYearToken(schoolYear) })
  } catch {
    return null
  }
}

export function requireLifecycleStrategyForScope(scope: LifecycleScope) {
  const strategy = lifecycleStrategyForScope(scope)
  if (!strategy) throw new Error(`Lifecycle strategy is not configured for ${scope.grade} in ${scope.schoolYearKey}.`)
  return strategy
}

export function resolveLifecycle(context: LifecycleContext) {
  return requireLifecycleStrategyForScope(context.scope).resolve(context)
}
