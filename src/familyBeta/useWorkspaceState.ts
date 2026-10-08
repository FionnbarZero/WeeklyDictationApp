import { type SetStateAction, useCallback, useState, useSyncExternalStore } from 'react'
import type { AppState } from '../domain.ts'
import { activityStorage, familyPreview, previewProfile } from './runtime.ts'
import type { FamilyWorkspaceWindow } from './workspaceOwner.ts'

const noSubscribe = () => () => {}
const noSnapshot = () => null

export function useWorkspaceState(initialize: () => AppState) {
  const [owner] = useState(() => {
    if (!familyPreview) return null
    const profile = previewProfile()
    const registry = (window.parent as FamilyWorkspaceWindow).familyWorkspaceOwner
    if (!profile || !registry) throw new Error('Open this activity from the family page.')
    return registry.get(profile.id, initialize, activityStorage(), window.name)
  })
  const [local, setLocal] = useState(() => owner?.getSnapshot().state || initialize())
  const snapshot = useSyncExternalStore(owner?.subscribe || noSubscribe, owner?.getSnapshot || noSnapshot)
  const state = snapshot?.state || local
  const setState = useCallback(
    (update: SetStateAction<AppState>) => {
      if (!owner) {
        setLocal(update)
        return
      }
      const base = typeof update === 'function' ? owner.getSnapshot().state : state
      owner.save(base, typeof update === 'function' ? update(base) : update)
    },
    [owner, state],
  )
  return { state, setState, owner, error: snapshot?.error || '' }
}
