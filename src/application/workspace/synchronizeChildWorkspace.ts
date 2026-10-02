import { throwIfWorkspaceSynchronizationAborted } from './cancellation.ts'
import { assembleChildWorkspace } from './assembleChildWorkspace.ts'
import type { ChildWorkspaceCapabilities, ChildWorkspaceScope } from './contracts.ts'
import { readChildWorkspace } from './readChildWorkspace.ts'
import { reconcileOpenSessions } from './reconcileOpenSessions.ts'
import { recoverPendingTransitions } from './recoverPendingTransitions.ts'

export async function synchronizeChildWorkspace(input: {
  scope: ChildWorkspaceScope
  capabilities: ChildWorkspaceCapabilities
  synchronizedAt: Date
  signal: AbortSignal
}) {
  const records = await readChildWorkspace(input.scope, input.capabilities.reads, input.signal)
  throwIfWorkspaceSynchronizationAborted(input.signal)

  // Preserve the pre-extraction behavior: classify open sessions before
  // assembling cloud state and replaying pending transition journals.
  await reconcileOpenSessions(records, input.scope, input.capabilities.reconciliation)
  throwIfWorkspaceSynchronizationAborted(input.signal)

  const assembled = assembleChildWorkspace(records, input.scope, input.capabilities.assembly)
  const state = await recoverPendingTransitions({
    state: assembled,
    records,
    scope: input.scope,
    recovery: input.capabilities.recovery,
    synchronizedAt: input.synchronizedAt,
    signal: input.signal,
  })
  throwIfWorkspaceSynchronizationAborted(input.signal)
  return { state, records }
}
