import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fetchGooglePresentation, googleAccessToken, type GoogleOAuthConfig } from '../backend/googleSlides.ts'
import { validateGrade5CurriculumExtraction } from '../src/automaticGrade5Curriculum.ts'
import { GRADE5_DECK_ID } from '../src/config.ts'
import {
  GRADE5_CURRICULUM_SNAPSHOT_SCHEMA,
  normalizeGrade5Presentation,
  parseGrade5CurriculumSnapshot,
  type Grade5CurriculumSnapshot,
} from '../src/curriculum/grade5CurriculumSnapshot.ts'

export type Grade5SlidesSnapshotDependencies = {
  googleAccessToken: typeof googleAccessToken
  fetchGooglePresentation: typeof fetchGooglePresentation
  now: () => Date
}

const defaults: Grade5SlidesSnapshotDependencies = {
  googleAccessToken,
  fetchGooglePresentation,
  now: () => new Date(),
}

export function grade5PresentationSha256(presentation: Grade5CurriculumSnapshot['presentation']) {
  return createHash('sha256').update(JSON.stringify(presentation)).digest('hex')
}

export function buildGrade5CurriculumSnapshot(
  presentationValue: unknown,
  retrievedAt: string,
): Grade5CurriculumSnapshot {
  const presentation = normalizeGrade5Presentation(presentationValue)
  const snapshot: Grade5CurriculumSnapshot = {
    schema: GRADE5_CURRICULUM_SNAPSHOT_SCHEMA,
    source: {
      type: 'google-slides',
      documentId: GRADE5_DECK_ID,
      documentUrl: `https://docs.google.com/presentation/d/${GRADE5_DECK_ID}`,
      retrievedAt,
      contentSha256: grade5PresentationSha256(presentation),
    },
    presentation,
  }
  return parseGrade5CurriculumSnapshot(snapshot)
}

export function validateGrade5CurriculumSnapshot(snapshot: Grade5CurriculumSnapshot) {
  const parsed = parseGrade5CurriculumSnapshot(snapshot)
  if (grade5PresentationSha256(parsed.presentation) !== parsed.source.contentSha256) {
    throw new Error('The Grade 5 curriculum snapshot content checksum does not match.')
  }
  return { snapshot: parsed, extraction: validateGrade5CurriculumExtraction(parsed) }
}

export async function fetchGrade5CurriculumSnapshot(
  googleOAuth: GoogleOAuthConfig,
  dependencies: Grade5SlidesSnapshotDependencies = defaults,
) {
  const accessToken = await dependencies.googleAccessToken(googleOAuth)
  const presentation = await dependencies.fetchGooglePresentation(GRADE5_DECK_ID, accessToken)
  return validateGrade5CurriculumSnapshot(buildGrade5CurriculumSnapshot(presentation, dependencies.now().toISOString()))
}

export async function readGrade5CurriculumSnapshot(path: string) {
  return validateGrade5CurriculumSnapshot(JSON.parse(await readFile(path, 'utf8')) as Grade5CurriculumSnapshot)
}

export async function readGrade5CurriculumInput(path: string, now = new Date()) {
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schema === GRADE5_CURRICULUM_SNAPSHOT_SCHEMA
  ) {
    return validateGrade5CurriculumSnapshot(value as Grade5CurriculumSnapshot)
  }
  return validateGrade5CurriculumSnapshot(buildGrade5CurriculumSnapshot(value, now.toISOString()))
}

export async function writeGrade5CurriculumSnapshot(path: string, snapshot: Grade5CurriculumSnapshot) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`)
}
