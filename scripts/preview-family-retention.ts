// Offline, read-only planning. This command has no provider or mutation mode.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { previewResultRetention } from '../src/familyBeta/resultRetention.ts'

const usage = 'Use --input completed-scores.json --child exact-child-id --school-year 2026-27. Read-only; no cleanup.'
try {
  const flags = new Map<string, string>()
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index]
    const value = process.argv[index + 1]
    if (!['--input', '--child', '--school-year'].includes(name) || flags.has(name) || !value || value.startsWith('--'))
      throw new Error(usage)
    flags.set(name, value)
  }
  if (flags.size !== 3) throw new Error(usage)
  // Nonblocking open lets us reject FIFOs/devices before any read can hang.
  const fd = openSync(resolve(flags.get('--input')!), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  const maximumBytes = 2_000_000
  let raw: string
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > maximumBytes) throw new Error('Supply a regular JSON file no larger than 2 MB.')
    const buffer = Buffer.alloc(maximumBytes + 1)
    let used = 0
    while (used <= maximumBytes) {
      const bytes = readSync(fd, buffer, used, buffer.length - used, null)
      if (!bytes) break
      used += bytes
    }
    if (used > maximumBytes) throw new Error('Input exceeds the 2 MB retention preview limit.')
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used))
  } finally {
    closeSync(fd)
  }
  const results: unknown = JSON.parse(raw)
  if (!Array.isArray(results)) throw new Error('Supply a JSON array of completed scores, not a database export.')
  const preview = previewResultRetention({
    childId: flags.get('--child')!,
    currentSchoolYear: flags.get('--school-year')!,
    results,
  })
  console.log(JSON.stringify(preview, null, 2))
} catch {
  // Never echo input JSON, private paths, account data, or raw parser errors.
  console.error(`Retention preview refused the input. ${usage}`)
  process.exitCode = 1
}
