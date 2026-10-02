import type { ChildWorkspaceRecords, ChildWorkspaceScope, OpenSessionReconciliationPort } from './contracts.ts'

export async function reconcileOpenSessions(
  records: ChildWorkspaceRecords,
  scope: ChildWorkspaceScope,
  reconciliation: OpenSessionReconciliationPort,
) {
  const openSessions = records.sessions.filter((session) => session.status === 'in_progress')
  await Promise.all(
    openSessions.map((session) =>
      session.primaryPhase === 'acquisition'
        ? reconciliation.markAcquisitionPartial(scope, session)
        : reconciliation.abandonTestReview(scope, session),
    ),
  )
}
