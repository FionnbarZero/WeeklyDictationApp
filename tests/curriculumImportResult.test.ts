import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import test from 'node:test'
import {
  extractGrade5Presentation,
  grade5SlidesSourceAdapter,
} from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import type { SlidesPresentationPayload } from '../src/curriculum/model.ts'
import { grade2SlidesSourceAdapter } from '../src/slidesImporter.ts'
import { kindergartenSheetsSourceAdapter } from '../src/kindergartenSheetsImporter.ts'
import { lifecycleProgressionEventsFrom } from '../src/lifecycle/curriculumProgression.ts'

const sourceRoot = new URL('../src/curriculum/', import.meta.url)

function TypeScriptFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name)
    if (statSync(child).isDirectory()) return TypeScriptFiles(child)
    return ['.ts', '.tsx', '.mts', '.cts'].includes(extname(child)) ? [child] : []
  })
}

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
}

test('every source adapter exposes one shared four-part import result while preserving candidate compatibility', () => {
  const grade2Payload = fixture('grade2-presentation.json') as SlidesPresentationPayload
  const grade2 = grade2SlidesSourceAdapter.extract({ sourceType: 'google-slides', ...grade2Payload })
  assert.deepEqual(Object.keys(grade2).sort(), ['candidates', 'issues', 'progressionEvidence', 'resources'])
  assert.deepEqual(
    grade2SlidesSourceAdapter.adapt({ sourceType: 'google-slides', ...grade2Payload }),
    grade2.candidates,
  )
  assert.deepEqual(grade2.progressionEvidence, [])
  assert.deepEqual(grade2.resources, [])

  const kindergartenPayload = {
    sourceType: 'google-sheets' as const,
    ...fixture('kindergarten-workbook.json'),
  }
  const kindergarten = kindergartenSheetsSourceAdapter.extract(kindergartenPayload)
  assert.deepEqual(
    kindergartenSheetsSourceAdapter.adapt(kindergartenPayload),
    kindergarten.candidates,
  )
  assert.ok(kindergarten.issues.every((issue) => issue.source?.sourceType === 'google-sheets'))
  assert.deepEqual(kindergarten.progressionEvidence, [])
  assert.deepEqual(kindergarten.resources, [])
})

test('Grade 5 uses the shared import result and lifecycle receives an explicit projection', () => {
  const payload = fixture('grade5-presentation.json') as SlidesPresentationPayload
  const extraction = extractGrade5Presentation(payload)
  const adapterResult = grade5SlidesSourceAdapter.extract(payload)

  assert.deepEqual(adapterResult, extraction)
  assert.equal(extraction.progressionEvidence.length, 4)
  assert.ok(extraction.progressionEvidence.every((item) =>
    item.kind === 'cohort-progression'
      && item.evidenceId.length > 0
      && item.source.adapterId === grade5SlidesSourceAdapter.id))
  assert.ok(extraction.resources.every((item) =>
    item.kind === 'book-link'
      && item.resourceId.length > 0
      && item.source.adapterId === grade5SlidesSourceAdapter.id))
  assert.equal(new Set(extraction.resources.map((item) => item.resourceId)).size, extraction.resources.length)

  const lifecycleEvents = lifecycleProgressionEventsFrom(extraction.progressionEvidence)
  assert.deepEqual(lifecycleEvents.map((event) => event.eventId),
    extraction.progressionEvidence.map((item) => item.evidenceId))
  assert.deepEqual(lifecycleEvents.map((event) => event.introducedDatasetId),
    extraction.progressionEvidence.map((item) => item.introducedDatasetId))
  assert.ok(lifecycleEvents.every((event) => !('source' in event)))
})

test('curriculum extraction cannot depend on lifecycle, UI, or persistence modules', () => {
  for (const path of TypeScriptFiles(sourceRoot.pathname)) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:lifecycle|App|firestore|firebase|react)[^'"]*['"]/i, path)
    assert.doesNotMatch(source, /(?:import\s*\(|require\s*\()["'][^"']*(?:lifecycle|App|firestore|firebase|react)[^"']*["']/i, path)
  }
})
