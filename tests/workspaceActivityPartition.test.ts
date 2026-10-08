import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialState, type AppState } from '../src/domain.ts'
import { partitionActivityCheckpoints } from '../src/familyBeta/workspaceActivityPartition.ts'

function stateWithActivities(): AppState {
  const state = createInitialState()
  state.acquisitionProgressions = [
    {
      id: 'activity-b',
      childId: 'child',
      datasetId: 'week-b',
      grade: 'Grade 2',
      flow: {} as never,
      updatedAt: '2026-10-08T01:00:00.000Z',
    },
    {
      id: 'activity-a',
      childId: 'child',
      datasetId: 'week-a',
      grade: 'Grade 2',
      flow: {} as never,
      updatedAt: '2026-10-08T00:00:00.000Z',
    },
  ]
  state.acquisitionProgressEnvelopes = [
    { id: 'activity-b', childId: 'child', datasetId: 'week-b', grade: 'Grade 2' } as never,
    { id: 'activity-a', childId: 'child', datasetId: 'week-a', grade: 'Grade 2' } as never,
  ]
  state.acquisitionTransitionReceipts = [
    { progressionId: 'activity-a', transitionId: 'receipt-a' } as never,
    { progressionId: 'activity-b', transitionId: 'receipt-b' } as never,
  ]
  state.acquisitionPendingCheckpoints = [
    { progressionId: 'activity-b', transitionId: 'pending-b' } as never,
    { progressionId: 'activity-a', transitionId: 'pending-a' } as never,
  ]
  return state
}

test('activity checkpoint partitioning keeps each progression and its journals together', () => {
  const result = partitionActivityCheckpoints(stateWithActivities())
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(
    result.activities.map((activity) => activity.activityId),
    ['activity-a', 'activity-b'],
  )
  assert.equal(result.activities[0].envelopes[0].id, 'activity-a')
  assert.equal(result.activities[0].pendingCheckpoints[0].progressionId, 'activity-a')
  assert.equal(result.activities[1].transitionReceipts[0].progressionId, 'activity-b')
  assert.equal(
    result.activities[0].pendingCheckpoints.some((item) => item.progressionId === 'activity-b'),
    false,
  )
})

test('activity checkpoint partitioning blocks orphaned mutable records', () => {
  const state = stateWithActivities()
  state.acquisitionPendingCheckpoints = [{ progressionId: 'missing', transitionId: 'orphan' } as never]
  const result = partitionActivityCheckpoints(state)
  assert.deepEqual(result, { status: 'blocked', reason: 'A pending checkpoint references an unknown activity.' })
})

test('activity checkpoint partitioning blocks duplicate or mismatched identities', () => {
  const duplicate = stateWithActivities()
  duplicate.acquisitionProgressions = [...duplicate.acquisitionProgressions, duplicate.acquisitionProgressions[0]]
  assert.deepEqual(partitionActivityCheckpoints(duplicate), {
    status: 'blocked',
    reason: 'Acquisition progressions contains duplicate activity activity-b.',
  })
  const mismatch = stateWithActivities()
  mismatch.acquisitionProgressEnvelopes = [
    { id: 'activity-a', childId: 'child', datasetId: 'other-week', grade: 'Grade 2' } as never,
  ]
  assert.deepEqual(partitionActivityCheckpoints(mismatch), {
    status: 'blocked',
    reason: 'Activity activity-a has mismatched progression identity.',
  })
})
