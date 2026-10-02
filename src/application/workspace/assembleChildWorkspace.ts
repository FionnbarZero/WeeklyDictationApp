import type { ChildWorkspaceAssemblyPort, ChildWorkspaceRecords, ChildWorkspaceScope } from './contracts.ts'

export function assembleChildWorkspace(
  records: ChildWorkspaceRecords,
  scope: ChildWorkspaceScope,
  assembly: ChildWorkspaceAssemblyPort,
) {
  return assembly.assembleCloudState(records, scope)
}
