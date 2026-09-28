import type { LifecycleScope, LifecycleSet, LifecycleStrategy } from './contracts.ts'
import { grade2ReplacementLifecycleStrategy } from './strategies/grade2ReplacementStrategy.ts'

const lifecycleStrategies: readonly LifecycleStrategy[] = [grade2ReplacementLifecycleStrategy]

export function lifecycleStrategyForGrade(grade: string) {
  return lifecycleStrategies.find((strategy) => strategy.grade === grade) || null
}

export function requireLifecycleStrategyForGrade(grade: string) {
  const strategy = lifecycleStrategyForGrade(grade)
  if (!strategy) throw new Error(`Lifecycle strategy is not configured for ${grade}.`)
  return strategy
}

export function resolveLifecycle(scope: LifecycleScope, sets: readonly LifecycleSet[]) {
  return requireLifecycleStrategyForGrade(scope.grade).resolve(scope, sets)
}
