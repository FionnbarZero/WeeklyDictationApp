import { createSharedWorkspace, type SharedWorkspace } from '../activity/sharedWorkspace.ts'
import type { AppState } from '../domain.ts'
import { practiceWorkspaceStorage } from './practiceWorkspaceStorage.ts'

export function createFamilyWorkspaceOwner(storage: Storage) {
  const children = new Map<string, SharedWorkspace<AppState>>()
  return {
    // Family-only compatibility handling belongs to the parent owner, outside
    // the standalone application entry and its initial download budget.
    practiceStorage(childId: string) {
      return practiceWorkspaceStorage(storage, childId)
    },
    get(childId: string, initialize: () => AppState, activityStorage?: Storage, activityScope = 'default') {
      if (!/^[\w-]{1,160}$/.test(childId)) throw new Error('Invalid activity owner.')
      if (!/^[\w-]{1,160}$/.test(activityScope)) throw new Error('Invalid activity scope.')
      const ownerKey = `${childId}:${activityScope}`
      let owner = children.get(ownerKey)
      if (!owner) {
        owner = createSharedWorkspace(
          initialize(),
          activityStorage || storage,
          activityStorage ? 'weekly-dictation-state-v2' : `family-beta-activity:${childId}:weekly-dictation-state-v2`,
        )
        children.set(ownerKey, owner)
      }
      return owner
    },
    retain(childIds: readonly string[]) {
      for (const [key, owner] of children)
        if (!childIds.some((id) => key === id || key.startsWith(`${id}:`))) {
          owner.close()
          children.delete(key)
        }
    },
  }
}

export type FamilyWorkspaceWindow = Window & { familyWorkspaceOwner?: ReturnType<typeof createFamilyWorkspaceOwner> }
