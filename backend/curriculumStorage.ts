import { createHash } from 'node:crypto'
import { gradeSlugs, inspectSnapshot, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import type { BetaGrade } from '../src/familyBeta/model.ts'

export interface CurriculumStorage {
  read(grade: BetaGrade): Promise<CurriculumSnapshot | null>
  publish(snapshot: CurriculumSnapshot): Promise<void>
}

export function validateStoredSnapshot(snapshot: CurriculumSnapshot, grade: BetaGrade) {
  if (
    snapshot.grade !== grade ||
    createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex') !== snapshot.contentSha256
  )
    throw new Error('Stored curriculum identity or checksum is invalid.')
  return inspectSnapshot(snapshot)
}

// Only this private bucket is accessible to the curriculum service's dedicated identity.
// Conditional writes prevent two revisions from overwriting newer validated curriculum.
export function createGoogleCurriculumStorage(
  bucket: string,
  tokenProvider?: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
): CurriculumStorage {
  if (!/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error('Invalid curriculum bucket.')
  async function token() {
    if (tokenProvider) return tokenProvider()
    const response = await fetchImpl(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(10_000),
      },
    )
    const body = (await response.json()) as { access_token?: string }
    if (!response.ok || !body.access_token) throw new Error('Curriculum storage authorization failed.')
    return body.access_token
  }
  async function readVersion(grade: BetaGrade, accessToken: string) {
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${gradeSlugs[grade]}.json`
    const headers = { Authorization: `Bearer ${accessToken}` }
    const metadata = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) })
    if (metadata.status === 404) return null
    if (!metadata.ok) throw new Error('Curriculum storage read failed.')
    const { generation } = (await metadata.json()) as { generation: string }
    if (!/^\d+$/.test(generation)) throw new Error('Invalid curriculum generation.')
    const response = await fetchImpl(`${url}?alt=media&generation=${generation}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error('Curriculum snapshot read failed.')
    const raw = await response.text()
    if (raw.length > 2_000_000) throw new Error('Curriculum snapshot too large.')
    const snapshot = JSON.parse(raw) as CurriculumSnapshot
    validateStoredSnapshot(snapshot, grade)
    return { snapshot, generation }
  }
  return {
    async read(grade) {
      return (await readVersion(grade, await token()))?.snapshot || null
    },
    async publish(snapshot) {
      const inspected = validateStoredSnapshot(snapshot, snapshot.grade)
      const accessToken = await token()
      const previous = await readVersion(snapshot.grade, accessToken)
      if (previous) {
        const ids = new Set(inspected.datasets.map((d) => d.id))
        if (inspectSnapshot(previous.snapshot).datasets.some((d) => !ids.has(d.id)))
          throw new Error('Curriculum refresh would remove a valid week.')
        if (Date.parse(previous.snapshot.retrievedAt) > Date.parse(snapshot.retrievedAt))
          throw new Error('Refusing an older curriculum refresh.')
      }
      const query = new URLSearchParams({
        uploadType: 'media',
        name: `${gradeSlugs[snapshot.grade]}.json`,
        ifGenerationMatch: previous?.generation || '0',
      })
      const response = await fetchImpl(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?${query}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error('Curriculum snapshot publication failed; previous version retained.')
    },
  }
}
