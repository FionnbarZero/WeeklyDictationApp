import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sourceIds, inspectSnapshot, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'
import type { BetaGrade } from '../src/familyBeta/model.ts'
import type { CurriculumSourcePayload } from '../src/curriculum/model.ts'
import { projectGrade2CurriculumPresentation } from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { slideText } from '../src/slidesImporter.ts'

export function projectCurriculum(grade: BetaGrade, payload: CurriculumSourcePayload): CurriculumSourcePayload {
  if (grade === 'Kindergarten') {
    if (payload.sourceType !== 'google-sheets') throw new Error('Expected a Google Sheet.')
    return {
      ...payload,
      sheets: (payload.sheets || []).map((sheet) => {
        const rows = sheet.values || []
        const heading = rows.findIndex((row) =>
          row.some((cell) => typeof cell === 'string' && /^Mandarin\s*$/i.test(cell.trim())),
        )
        if (heading < 0) return { ...sheet, values: [] }
        const column = rows[heading].findIndex((cell) => typeof cell === 'string' && /^Mandarin\s*$/i.test(cell.trim()))
        return {
          sheetId: sheet.sheetId,
          title: sheet.title,
          values: [['Mandarin'], [rows[heading + 1]?.[column] || '']],
        }
      }),
    }
  }
  if (payload.sourceType !== 'google-slides') throw new Error('Expected Google Slides.')
  if (grade === 'Grade 2') return { sourceType: 'google-slides', ...projectGrade2CurriculumPresentation(payload) }
  return {
    ...payload,
    slides: (payload.slides || []).map((slide) => ({
      objectId: slide.objectId,
      pageElements: (slide.pageElements || []).filter((element) => {
        const e = element as { shape?: unknown; table?: { tableRows?: unknown[] } }
        return e.shape
          ? /^Week\s/i.test(slideText({ pageElements: [element] }).trim())
          : e.table
            ? /Mandarin/.test(JSON.stringify(e.table.tableRows?.[0]))
            : false
      }),
    })),
  }
}

export function buildCurriculumSnapshot(
  grade: BetaGrade,
  payload: CurriculumSourcePayload,
  sourceModifiedAt: string,
  now = new Date(),
): CurriculumSnapshot {
  const projected = projectCurriculum(grade, payload)
  const snapshot: CurriculumSnapshot = {
    schema: 1,
    grade,
    sourceId: sourceIds[grade],
    retrievedAt: now.toISOString(),
    sourceModifiedAt,
    contentSha256: createHash('sha256').update(JSON.stringify(projected)).digest('hex'),
    payload: projected,
  }
  inspectSnapshot(snapshot)
  return snapshot
}

export async function publishCurriculumSnapshot(path: string, snapshot: CurriculumSnapshot) {
  const inspected = inspectSnapshot(snapshot)
  // Reject loss of previously valid weeks, preserving the last known good snapshot.
  const old = await readFile(path, 'utf8')
    .then((raw) => JSON.parse(raw) as CurriculumSnapshot)
    .catch(() => null)
  if (old) {
    const previous = inspectSnapshot(old)
    const ids = new Set(inspected.datasets.map((d) => d.id))
    if (previous.datasets.some((d) => !ids.has(d.id)))
      throw new Error('Curriculum refresh would remove a valid week; retained the previous snapshot.')
  }
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`)
  await rename(temporary, path)
}
