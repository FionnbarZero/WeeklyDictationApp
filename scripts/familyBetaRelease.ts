import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export const FAMILY_BETA_ARTIFACT_SCHEMA = 'weekly-dictation-family-beta-artifact-v1' as const
export const FAMILY_BETA_GRADES = ['kindergarten', 'grade5'] as const
export type FamilyBetaGrade = (typeof FAMILY_BETA_GRADES)[number]
export const FAMILY_BETA_FIREBASE_PROJECT_ID = 'weeklydictationapp'

export const familyBetaGradeConfig = {
  kindergarten: {
    displayName: 'Kindergarten',
    sourceHtml: 'kindergarten-learning-lab.html',
    status: 'Experimental',
    persistence: 'Session only',
    siteId: 'weeklydictation-k-beta',
  },
  grade5: {
    displayName: 'Grade 5',
    sourceHtml: 'grade5-learning-hub.html',
    status: 'Experimental',
    persistence: 'Session only',
    siteId: 'weeklydictation-g5-beta',
  },
} as const

export type FamilyBetaFileRecord = {
  path: string
  bytes: number
  sha256: string
}

export type FamilyBetaArtifactManifest = {
  schema: typeof FAMILY_BETA_ARTIFACT_SCHEMA
  grade: FamilyBetaGrade
  displayName: string
  status: string
  persistence: string
  applicationVersion: string
  sourceRevision: string
  sourceCommittedAt: string
  dirty: boolean
  entry: 'index.html'
  build: {
    command: string
    node: string
    npm: string
    packageLockSha256: string
  }
  fileTreeSha256: string
  files: FamilyBetaFileRecord[]
}

const fullGitRevisionPattern = /^[a-f0-9]{40}$/i
const sha256Pattern = /^[a-f0-9]{64}$/i
const firebaseResourcePattern = /^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/

export function requireFamilyBetaGrade(value: string | undefined): FamilyBetaGrade {
  if (value === 'kindergarten' || value === 'grade5') return value
  throw new Error('Family beta grade must be kindergarten or grade5.')
}

export function requireFullGitRevision(value: string | undefined, label = 'Git revision') {
  const revision = value?.trim().toLowerCase() || ''
  if (!fullGitRevisionPattern.test(revision))
    throw new Error(`${label} must be a full 40-character hexadecimal Git revision.`)
  return revision
}

export function requireMatchingSourceRevision(requested: string | undefined, checkedOut: string) {
  const headRevision = requireFullGitRevision(checkedOut, 'Checked-out Git revision')
  const sourceRevision = requireFullGitRevision(requested || headRevision)
  if (sourceRevision !== headRevision) {
    throw new Error(`The requested source revision ${sourceRevision} is not checked out at HEAD ${headRevision}.`)
  }
  return sourceRevision
}

export function requireFirebaseResourceId(value: string | undefined, label: string) {
  const resourceId = value?.trim() || ''
  if (!firebaseResourcePattern.test(resourceId)) {
    throw new Error(`${label} must be a 6- to 30-character lowercase Firebase resource ID.`)
  }
  return resourceId
}

export function candidateChannelId(revision: string) {
  return `candidate-${requireFullGitRevision(revision).slice(0, 12)}`
}

export function rollbackChannelId(revision: string) {
  return `rollback-${requireFullGitRevision(revision).slice(0, 12)}`
}

export function sha256(content: string | Buffer) {
  return createHash('sha256').update(content).digest('hex')
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

export function artifactFileRecords(directory: string) {
  return filesBelow(directory)
    .filter((path) => relative(directory, path) !== 'family-beta-manifest.json')
    .map((path) => {
      const content = readFileSync(path)
      return {
        path: relative(directory, path).split('\\').join('/'),
        bytes: statSync(path).size,
        sha256: sha256(content),
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function fileTreeSha256(files: readonly FamilyBetaFileRecord[]) {
  return sha256(files.map((file) => `${file.sha256}  ${file.bytes}  ${file.path}`).join('\n'))
}

function isManifest(value: unknown): value is FamilyBetaArtifactManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const manifest = value as Record<string, unknown>
  return (
    manifest.schema === FAMILY_BETA_ARTIFACT_SCHEMA &&
    (manifest.grade === 'kindergarten' || manifest.grade === 'grade5') &&
    typeof manifest.displayName === 'string' &&
    typeof manifest.status === 'string' &&
    typeof manifest.persistence === 'string' &&
    typeof manifest.applicationVersion === 'string' &&
    manifest.applicationVersion.length > 0 &&
    fullGitRevisionPattern.test(String(manifest.sourceRevision)) &&
    typeof manifest.sourceCommittedAt === 'string' &&
    Number.isFinite(Date.parse(manifest.sourceCommittedAt)) &&
    typeof manifest.dirty === 'boolean' &&
    manifest.entry === 'index.html' &&
    sha256Pattern.test(String(manifest.fileTreeSha256)) &&
    Array.isArray(manifest.files) &&
    manifest.files.every((file) => {
      if (!file || typeof file !== 'object' || Array.isArray(file)) return false
      const record = file as Record<string, unknown>
      return (
        typeof record.path === 'string' &&
        record.path.length > 0 &&
        Number.isSafeInteger(record.bytes) &&
        Number(record.bytes) >= 0 &&
        sha256Pattern.test(String(record.sha256))
      )
    }) &&
    Boolean(manifest.build) &&
    typeof manifest.build === 'object' &&
    !Array.isArray(manifest.build) &&
    typeof (manifest.build as Record<string, unknown>).command === 'string' &&
    typeof (manifest.build as Record<string, unknown>).node === 'string' &&
    typeof (manifest.build as Record<string, unknown>).npm === 'string' &&
    sha256Pattern.test(String((manifest.build as Record<string, unknown>).packageLockSha256))
  )
}

export function verifyFamilyBetaArtifact(directory: string, expectedGrade?: FamilyBetaGrade) {
  const manifestPath = resolve(directory, 'family-beta-manifest.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    throw new Error('The family beta artifact manifest is missing or invalid JSON.')
  }
  if (!isManifest(parsed)) throw new Error('The family beta artifact manifest is malformed or unsupported.')
  if (expectedGrade && parsed.grade !== expectedGrade)
    throw new Error('The artifact grade does not match the requested destination.')
  if (parsed.dirty) throw new Error('A dirty-worktree family beta artifact cannot be deployed.')
  const grade = familyBetaGradeConfig[parsed.grade]
  if (
    parsed.displayName !== grade.displayName ||
    parsed.status !== grade.status ||
    parsed.persistence !== grade.persistence
  ) {
    throw new Error('The family beta artifact release identity does not match its grade contract.')
  }

  const actualFiles = artifactFileRecords(directory)
  if (JSON.stringify(actualFiles) !== JSON.stringify(parsed.files)) {
    throw new Error('The family beta artifact file inventory does not match its immutable manifest.')
  }
  if (fileTreeSha256(actualFiles) !== parsed.fileTreeSha256) {
    throw new Error('The family beta artifact file-tree checksum does not match.')
  }
  if (!actualFiles.some((file) => file.path === 'index.html'))
    throw new Error('The family beta artifact has no root entry page.')
  if (actualFiles.some((file) => file.path.endsWith('.html') && file.path !== 'index.html')) {
    throw new Error('A grade artifact must not contain another application entry page.')
  }

  const html = readFileSync(resolve(directory, 'index.html'), 'utf8')
  const identityFields = [
    grade.displayName,
    `status=${parsed.status}`,
    `version=${parsed.applicationVersion}`,
    `revision=${parsed.sourceRevision}`,
    `persistence=${parsed.persistence}`,
  ]
  if (identityFields.some((field) => !html.includes(field))) {
    throw new Error('The root entry page does not display the complete artifact release identity.')
  }
  return parsed
}
