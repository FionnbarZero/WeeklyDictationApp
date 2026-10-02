import { loadState } from '../../domain.ts'
import { recoverAcquisitionCheckpoints } from '../acquisitionPersistence.ts'
import { recoverWarmupTransitions } from '../warmup/index.ts'
import type { LocalWorkspacePort } from './contracts.ts'

export function loadLocalWorkspace(port: LocalWorkspacePort) {
  const loaded = loadState(port.readApplicationState(), port.readLegacyAttempts())
  const acquisitionJournal = port.readPendingAcquisition()
  let recoveredState = loaded
  const recoveredAcquisitionTransitionIds: string[] = []
  const recoveredWarmupTransitionIds: string[] = []

  if (!acquisitionJournal.error && acquisitionJournal.entries.length > 0) {
    const recovered = recoverAcquisitionCheckpoints(recoveredState, acquisitionJournal.entries)
    if (recovered.status === 'recovered') {
      recoveredState = recovered.state
      recoveredAcquisitionTransitionIds.push(...recovered.recoveredTransitionIds)
    }
  }

  const warmupJournal = port.readPendingWarmup()
  if (!warmupJournal.error && warmupJournal.entries.length > 0) {
    const recovered = recoverWarmupTransitions(recoveredState, warmupJournal.entries)
    if (recovered.status === 'recovered') {
      recoveredState = recovered.state
      recoveredWarmupTransitionIds.push(...recovered.recoveredTransitionIds)
    }
  }

  if (port.writeApplicationState(recoveredState)) {
    for (const transitionId of recoveredAcquisitionTransitionIds) port.acknowledgeAcquisition(transitionId)
    for (const transitionId of recoveredWarmupTransitionIds) port.acknowledgeWarmup(transitionId)
  }
  return recoveredState
}
