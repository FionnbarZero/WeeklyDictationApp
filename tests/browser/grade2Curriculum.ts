import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'

export async function grade2CurriculumFixture() {
  const presentation = JSON.parse(await readFile(path.resolve('tests/fixtures/grade2-presentation.json'), 'utf8'))
  return {
    schema: 'weekly-dictation-grade2-curriculum-snapshot-v1',
    source: {
      type: 'google-slides',
      documentId: presentation.presentationId,
      documentUrl: `https://docs.google.com/presentation/d/${presentation.presentationId}`,
      retrievedAt: '2026-09-29T00:00:00.000Z',
      contentSha256: createHash('sha256').update(JSON.stringify(presentation)).digest('hex'),
    },
    presentation,
  }
}

export async function installGrade2CurriculumFixture(page: Page) {
  const snapshot = await grade2CurriculumFixture()
  await page.route('**/curriculum/grade2-presentation.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) }),
  )
}
