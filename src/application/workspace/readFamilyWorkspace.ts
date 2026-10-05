import { throwIfWorkspaceSynchronizationAborted } from './cancellation.ts'
import type { FamilyWorkspace, FamilyWorkspacePort } from './contracts.ts'

export async function readFamilyWorkspace<TUser>(
  user: TUser,
  port: FamilyWorkspacePort<TUser>,
  signal: AbortSignal,
): Promise<FamilyWorkspace<TUser>> {
  throwIfWorkspaceSynchronizationAborted(signal)
  const family = await port.ensureFamily(user, signal)
  throwIfWorkspaceSynchronizationAborted(signal)
  const rawChildren = await port.listChildren(family.id, signal)
  throwIfWorkspaceSynchronizationAborted(signal)
  return {
    family,
    children: rawChildren.map((child, index) => ({
      ...child,
      name: child.nickname,
      color: index % 2 ? 'blue' : 'coral',
      initials: child.nickname.slice(0, 1).toUpperCase(),
    })),
  }
}
