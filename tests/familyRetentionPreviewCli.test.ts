import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { makeResult } from '../src/familyBeta/model.ts'

const script = fileURLToPath(new URL('../scripts/preview-family-retention.ts', import.meta.url))
const result = makeResult(
  { id: 'synthetic-child', nickname: 'Synthetic', grade: 'Grade 2', active: true },
  {
    id: 'old-attempt',
    activity: 'Writing',
    channel: 'writing',
    schoolYear: '2024-25',
    datasetIds: ['week'],
    correct: 2,
    attempted: 3,
  },
  new Date('2024-10-01T18:00:00.000Z'),
)

function run(args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], {
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 2_000_000,
    // No inherited cloud credentials or configuration are needed by this CLI.
    env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
  })
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'family-retention-synthetic-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'completed.json')
  writeFileSync(path, JSON.stringify([result]))
  const args = ['--input', path, '--child', 'synthetic-child', '--school-year', '2026-27']
  return { directory, path, args }
}

test('offline CLI produces a read-only preview on stdout and leaves input/directory unchanged', (t) => {
  const { directory, path, args } = fixture(t)
  const before = readFileSync(path)
  const response = run(args)
  assert.equal(response.status, 0, response.stderr)
  assert.equal(response.stderr, '')
  const report = JSON.parse(response.stdout)
  assert.equal(report.distinctAttempts, 1)
  assert.equal(report.entries[0].detailDisposition, 'review-linked-detail')
  assert.equal(report.entries[0].preserveCompletedScore, true)
  assert.equal(report.deletionAuthorized, false)
  assert.deepEqual(report.plannedDeletes, [])
  assert.deepEqual(readFileSync(path), before)
  assert.deepEqual(readdirSync(directory), ['completed.json'])
})

test('CLI refuses unknown, repeated, missing and mutation flags without partial output', (t) => {
  const { args } = fixture(t)
  for (const supplied of [
    [],
    args.slice(0, -1),
    [...args, '--execute', 'yes'],
    [...args, '--delete', 'yes'],
    [...args, '--child', 'synthetic-child'],
  ]) {
    const response = run(supplied)
    assert.equal(response.status, 1)
    assert.equal(response.stdout, '')
    assert.match(response.stderr, /Read-only; no cleanup/)
  }
})

test('CLI refuses malformed, overlarge and invalid-scoped input without echoing sensitive bytes or paths', (t) => {
  const { path, args } = fixture(t)
  for (const data of [
    '{"private-marker":',
    JSON.stringify({ private: 'private-marker', scores: [result] }),
    JSON.stringify([{ ...result, childId: 'private-marker' }]),
    JSON.stringify([result, { ...result, correct: 0 }]),
    JSON.stringify(Array.from({ length: 501 }, () => result)),
    ' '.repeat(2_000_001),
    Buffer.from([0xff, 0xfe, 0x00]),
  ]) {
    writeFileSync(path, data)
    const response = run(args)
    assert.equal(response.status, 1)
    assert.equal(response.stdout, '')
    assert.equal(response.stderr.includes('private-marker'), false)
    assert.equal(response.stderr.includes(path), false)
    assert.match(response.stderr, /refused the input/)
    assert.deepEqual(readFileSync(path), Buffer.from(data))
  }
})

test('CLI refuses missing files and directories', (t) => {
  const { directory, args } = fixture(t)
  for (const path of [directory, join(directory, 'missing.json')]) {
    const response = run(['--input', path, ...args.slice(2)])
    assert.equal(response.status, 1)
    assert.equal(response.stdout, '')
  }
})

test('CLI refuses symlinks and FIFOs without blocking', { skip: process.platform === 'win32' }, (t) => {
  const { directory, path, args } = fixture(t)
  const link = join(directory, 'link.json')
  const fifo = join(directory, 'pipe.json')
  symlinkSync(path, link)
  execFileSync('mkfifo', [fifo])
  for (const input of [link, fifo]) {
    const response = run(['--input', input, ...args.slice(2)])
    assert.equal(response.error, undefined)
    assert.equal(response.status, 1)
    assert.equal(response.stdout, '')
  }
})
