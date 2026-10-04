import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export const FAMILY_BETA_ARTIFACT_SCHEMA = 'weekly-dictation-family-beta-artifact-v1' as const
export const GRADE2_CURRICULUM_SNAPSHOT_SCHEMA = 'weekly-dictation-grade2-curriculum-snapshot-v1' as const
export const GRADE2_CURRICULUM_SOURCE_PATH = 'curriculum/grade2-presentation.json'
export const GRADE2_CURRICULUM_DOCUMENT_ID = '10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4'
export const GRADE5_CURRICULUM_SNAPSHOT_SCHEMA = 'weekly-dictation-grade5-curriculum-snapshot-v1' as const
export const GRADE5_CURRICULUM_SOURCE_PATH = 'curriculum/grade5-presentation.json'
export const GRADE5_CURRICULUM_DOCUMENT_ID = '1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI'
export const FAMILY_BETA_GRADES = ['kindergarten', 'grade2', 'grade5'] as const
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
  grade2: {
    displayName: 'Grade 2',
    sourceHtml: 'index.html',
    status: 'Family beta',
    persistence: 'Tier 1 writing and Tier 2 reading metadata are durable',
    siteId: 'weeklydictation-g2-preview',
  },
  grade5: {
    displayName: 'Grade 5',
    sourceHtml: 'grade5-learning-hub.html',
    status: 'Public',
    persistence: 'Device progress · microphone recordings are never saved',
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
  curriculumSource?: {
    type: 'google-slides'
    documentId: string
    documentUrl: string
    retrievedAt: string
    contentSha256: string
    artifactPath: string
    datasetCount: number
  }
  fileTreeSha256: string
  files: FamilyBetaFileRecord[]
}

const fullGitRevisionPattern = /^[a-f0-9]{40}$/i
const sha256Pattern = /^[a-f0-9]{64}$/i
const firebaseResourcePattern = /^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/

function isFamilyBetaGrade(value: unknown): value is FamilyBetaGrade {
  return typeof value === 'string' && (FAMILY_BETA_GRADES as readonly string[]).includes(value)
}

export function requireFamilyBetaGrade(value: string | undefined): FamilyBetaGrade {
  if (isFamilyBetaGrade(value)) return value
  throw new Error('Family beta grade must be kindergarten, grade2, or grade5.')
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
  return `rollback-stable-${requireFullGitRevision(revision).slice(0, 12)}`
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

export function grade2CurriculumSourceFromSnapshot(
  path: string,
): NonNullable<FamilyBetaArtifactManifest['curriculumSource']> {
  let snapshot: Record<string, unknown>
  try {
    snapshot = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error('The Grade 2 curriculum snapshot is not valid JSON.')
  }
  const source = snapshot.source as Record<string, unknown> | undefined
  const presentation = snapshot.presentation as Record<string, unknown> | undefined
  const slides = presentation?.slides
  if (
    snapshot.schema !== GRADE2_CURRICULUM_SNAPSHOT_SCHEMA ||
    source?.type !== 'google-slides' ||
    source.documentId !== GRADE2_CURRICULUM_DOCUMENT_ID ||
    source.documentUrl !== `https://docs.google.com/presentation/d/${GRADE2_CURRICULUM_DOCUMENT_ID}` ||
    !Number.isFinite(Date.parse(String(source.retrievedAt))) ||
    !sha256Pattern.test(String(source.contentSha256)) ||
    presentation?.presentationId !== GRADE2_CURRICULUM_DOCUMENT_ID ||
    !Array.isArray(slides) ||
    slides.length === 0 ||
    sha256(JSON.stringify(presentation)) !== source.contentSha256
  ) {
    throw new Error('The Grade 2 curriculum snapshot has invalid provenance or content.')
  }
  return {
    type: 'google-slides',
    documentId: GRADE2_CURRICULUM_DOCUMENT_ID,
    documentUrl: String(source.documentUrl),
    retrievedAt: String(source.retrievedAt),
    contentSha256: String(source.contentSha256),
    artifactPath: GRADE2_CURRICULUM_SOURCE_PATH,
    datasetCount: slides.length,
  }
}

export function grade5CurriculumSourceFromSnapshot(
  path: string,
): NonNullable<FamilyBetaArtifactManifest['curriculumSource']> {
  let snapshot: Record<string, unknown>
  try {
    snapshot = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error('The Grade 5 curriculum snapshot is not valid JSON.')
  }
  const source = snapshot.source as Record<string, unknown> | undefined
  const presentation = snapshot.presentation as Record<string, unknown> | undefined
  const slides = presentation?.slides
  if (
    snapshot.schema !== GRADE5_CURRICULUM_SNAPSHOT_SCHEMA ||
    source?.type !== 'google-slides' ||
    source.documentId !== GRADE5_CURRICULUM_DOCUMENT_ID ||
    source.documentUrl !== `https://docs.google.com/presentation/d/${GRADE5_CURRICULUM_DOCUMENT_ID}` ||
    !Number.isFinite(Date.parse(String(source.retrievedAt))) ||
    !sha256Pattern.test(String(source.contentSha256)) ||
    presentation?.presentationId !== GRADE5_CURRICULUM_DOCUMENT_ID ||
    !Array.isArray(slides) ||
    slides.length === 0 ||
    sha256(JSON.stringify(presentation)) !== source.contentSha256
  ) {
    throw new Error('The Grade 5 curriculum snapshot has invalid provenance or content.')
  }
  return {
    type: 'google-slides',
    documentId: GRADE5_CURRICULUM_DOCUMENT_ID,
    documentUrl: String(source.documentUrl),
    retrievedAt: String(source.retrievedAt),
    contentSha256: String(source.contentSha256),
    artifactPath: GRADE5_CURRICULUM_SOURCE_PATH,
    datasetCount: slides.length,
  }
}

function isManifest(value: unknown): value is FamilyBetaArtifactManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const manifest = value as Record<string, unknown>
  return (
    manifest.schema === FAMILY_BETA_ARTIFACT_SCHEMA &&
    isFamilyBetaGrade(manifest.grade) &&
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
    (manifest.curriculumSource === undefined ||
      (Boolean(manifest.curriculumSource) &&
        typeof manifest.curriculumSource === 'object' &&
        !Array.isArray(manifest.curriculumSource) &&
        (manifest.curriculumSource as Record<string, unknown>).type === 'google-slides' &&
        typeof (manifest.curriculumSource as Record<string, unknown>).documentId === 'string' &&
        typeof (manifest.curriculumSource as Record<string, unknown>).documentUrl === 'string' &&
        Number.isFinite(Date.parse(String((manifest.curriculumSource as Record<string, unknown>).retrievedAt))) &&
        sha256Pattern.test(String((manifest.curriculumSource as Record<string, unknown>).contentSha256)) &&
        typeof (manifest.curriculumSource as Record<string, unknown>).artifactPath === 'string' &&
        Number.isSafeInteger((manifest.curriculumSource as Record<string, unknown>).datasetCount) &&
        Number((manifest.curriculumSource as Record<string, unknown>).datasetCount) > 0)) &&
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
  if (parsed.grade === 'grade2' && !actualFiles.some((file) => file.path === '.nojekyll')) {
    throw new Error('A Grade 2 GitHub Pages artifact must include .nojekyll.')
  }
  if (parsed.grade === 'grade2') {
    if (!parsed.curriculumSource)
      throw new Error('A Grade 2 artifact must identify its Google Slides curriculum snapshot.')
    if (
      parsed.curriculumSource.documentId !== GRADE2_CURRICULUM_DOCUMENT_ID ||
      parsed.curriculumSource.artifactPath !== GRADE2_CURRICULUM_SOURCE_PATH
    ) {
      throw new Error('The Grade 2 artifact identifies an unregistered curriculum source.')
    }
    const curriculumFile = actualFiles.find((file) => file.path === parsed.curriculumSource?.artifactPath)
    if (!curriculumFile) throw new Error('The Grade 2 curriculum snapshot is missing from the artifact.')
    const snapshotSource = grade2CurriculumSourceFromSnapshot(resolve(directory, parsed.curriculumSource.artifactPath))
    if (JSON.stringify(snapshotSource) !== JSON.stringify(parsed.curriculumSource)) {
      throw new Error('The Grade 2 curriculum snapshot does not match its artifact provenance.')
    }
  } else if (parsed.grade === 'grade5') {
    if (!parsed.curriculumSource)
      throw new Error('A Grade 5 artifact must identify its reviewed public curriculum snapshot.')
    if (
      parsed.curriculumSource.documentId !== GRADE5_CURRICULUM_DOCUMENT_ID ||
      parsed.curriculumSource.artifactPath !== GRADE5_CURRICULUM_SOURCE_PATH
    ) {
      throw new Error('The Grade 5 artifact identifies an unregistered curriculum source.')
    }
    const curriculumFile = actualFiles.find((file) => file.path === parsed.curriculumSource?.artifactPath)
    if (!curriculumFile) throw new Error('The Grade 5 curriculum snapshot is missing from the artifact.')
    const snapshotSource = grade5CurriculumSourceFromSnapshot(resolve(directory, parsed.curriculumSource.artifactPath))
    if (JSON.stringify(snapshotSource) !== JSON.stringify(parsed.curriculumSource)) {
      throw new Error('The Grade 5 curriculum snapshot does not match its artifact provenance.')
    }
  } else if (parsed.curriculumSource || actualFiles.some((file) => file.path.startsWith('curriculum/'))) {
    throw new Error('A Kindergarten artifact must not contain a curriculum snapshot.')
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
