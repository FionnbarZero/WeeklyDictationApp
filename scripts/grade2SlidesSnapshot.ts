import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fetchGooglePresentation, googleAccessToken, type GoogleOAuthConfig } from '../backend/googleSlides.ts'
import { createInitialState } from '../src/domain.ts'
import {
  GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
  parseGrade2CurriculumSnapshot,
  projectGrade2CurriculumPresentation,
  type Grade2CurriculumSnapshot,
} from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { GRADE2_DECK_ID } from '../src/config.ts'
import { hydrateLocalStateFromReadOnlySource } from '../src/localHydration.ts'

export type Grade2SlidesSnapshotDependencies = {
  googleAccessToken: typeof googleAccessToken
  fetchGooglePresentation: typeof fetchGooglePresentation
  now: () => Date
}

const defaults: Grade2SlidesSnapshotDependencies = {
  googleAccessToken,
  fetchGooglePresentation,
  now: () => new Date(),
}

export function grade2PresentationSha256(presentation: Grade2CurriculumSnapshot['presentation']) {
  return createHash('sha256').update(JSON.stringify(presentation)).digest('hex')
}

export function validateGrade2CurriculumSnapshot(snapshot: Grade2CurriculumSnapshot) {
  const parsed = parseGrade2CurriculumSnapshot(snapshot)
  if (grade2PresentationSha256(parsed.presentation) !== parsed.source.contentSha256) {
    throw new Error('The Grade 2 curriculum snapshot content checksum does not match.')
  }
  const hydration = hydrateLocalStateFromReadOnlySource(createInitialState(), parsed.presentation)
  const unsafeOutcome = hydration.batch.outcomes.some(
    (outcome) => outcome.status === 'error' || outcome.status === 'conflict',
  )
  if (
    hydration.batch.status !== 'ok' ||
    unsafeOutcome ||
    hydration.batch.summary.datasetCount !== parsed.presentation.slides?.length
  ) {
    throw new Error('The Grade 2 curriculum snapshot failed canonical dataset validation.')
  }
  return { snapshot: parsed, batch: hydration.batch }
}

export async function fetchGrade2CurriculumSnapshot(
  googleOAuth: GoogleOAuthConfig,
  dependencies: Grade2SlidesSnapshotDependencies = defaults,
) {
  const accessToken = await dependencies.googleAccessToken(googleOAuth)
  const presentation = projectGrade2CurriculumPresentation(
    await dependencies.fetchGooglePresentation(GRADE2_DECK_ID, accessToken),
  )
  const snapshot: Grade2CurriculumSnapshot = {
    schema: GRADE2_CURRICULUM_SNAPSHOT_SCHEMA,
    source: {
      type: 'google-slides',
      documentId: GRADE2_DECK_ID,
      documentUrl: `https://docs.google.com/presentation/d/${GRADE2_DECK_ID}`,
      retrievedAt: dependencies.now().toISOString(),
      contentSha256: grade2PresentationSha256(presentation),
    },
    presentation,
  }
  return validateGrade2CurriculumSnapshot(snapshot)
}

export async function readGrade2CurriculumSnapshot(path: string) {
  return validateGrade2CurriculumSnapshot(JSON.parse(await readFile(path, 'utf8')) as Grade2CurriculumSnapshot)
}

export async function writeGrade2CurriculumSnapshot(path: string, snapshot: Grade2CurriculumSnapshot) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`)
}
