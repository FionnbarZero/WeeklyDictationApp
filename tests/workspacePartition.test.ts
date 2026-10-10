import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppState } from '../src/domain.ts'
import {
  partitionWorkspaceState,
  WORKSPACE_CHECKPOINT_FIELDS,
  WORKSPACE_HISTORY_FIELDS,
  WORKSPACE_METADATA_FIELDS,
} from '../src/familyBeta/workspacePartition.ts'

const state = Object.fromEntries([
  ...WORKSPACE_METADATA_FIELDS.map((field) => [field, 2]),
  ...WORKSPACE_HISTORY_FIELDS.map((field) => [field, `${field}-history`]),
  ...WORKSPACE_CHECKPOINT_FIELDS.map((field) => [field, `${field}-checkpoint`]),
]) as unknown as AppState

test('workspace characterization covers every AppState field exactly once', () => {
  const fields = Object.keys(state)
  const partitions = [...WORKSPACE_METADATA_FIELDS, ...WORKSPACE_HISTORY_FIELDS, ...WORKSPACE_CHECKPOINT_FIELDS]
  assert.equal(new Set(partitions).size, partitions.length)
  assert.deepEqual(new Set(partitions), new Set(fields))
})

test('partitioning is pure and does not mix history with mutable checkpoint fields', () => {
  const before = JSON.stringify(state)
  const partition = partitionWorkspaceState(state)
  assert.equal(JSON.stringify(state), before)
  assert.equal(partition.metadata.version, 2)
  for (const field of WORKSPACE_HISTORY_FIELDS) {
    assert.equal(partition.history[field], state[field])
    assert.equal(field in partition.checkpoint, false)
  }
  for (const field of WORKSPACE_CHECKPOINT_FIELDS) {
    assert.equal(partition.checkpoint[field], state[field])
    assert.equal(field in partition.history, false)
  }
})
