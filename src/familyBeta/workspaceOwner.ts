import { createSharedWorkspace, type SharedWorkspace } from '../activity/sharedWorkspace.ts'
import type { AppState } from '../domain.ts'

export function createFamilyWorkspaceOwner(storage: Storage) {
  const children = new Map<string, SharedWorkspace<AppState>>()
  return {
    get(childId: string, initialize: () => AppState) {
      if (!/^[\w-]{1,160}$/.test(childId)) throw new Error('Invalid activity owner.')
      let owner = children.get(childId)
      if (!owner) {
        owner = createSharedWorkspace(
          initialize(),
          storage,
          `family-beta-activity:${childId}:weekly-dictation-state-v2`,
        )
        children.set(childId, owner)
      }
      return owner
    },
    retain(childIds: readonly string[]) {
      for (const [id, owner] of children)
        if (!childIds.includes(id)) {
          owner.close()
          children.delete(id)
        }
    },
  }
}

export type FamilyWorkspaceWindow = Window & { familyWorkspaceOwner?: ReturnType<typeof createFamilyWorkspaceOwner> }
