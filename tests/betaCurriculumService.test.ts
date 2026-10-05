import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createCurriculumService } from '../backend/curriculumServer.ts'
import { buildCurriculumSnapshot, publishCurriculumSnapshot } from '../backend/betaCurriculum.ts'
import { BETA_GRADES } from '../src/familyBeta/model.ts'
import { gradeSlugs, inspectSnapshot, type CurriculumSnapshot } from '../src/familyBeta/curriculum.ts'

test('automatic Google refresh publishes all three grades and preserves last good data after failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dictation-curriculum-test-'))
  const originalFetch = globalThis.fetch
  const snapshots = await Promise.all(
    BETA_GRADES.map(
      async (grade) =>
        JSON.parse(
          await readFile(new URL(`../public/curriculum/beta/${gradeSlugs[grade]}.json`, import.meta.url), 'utf8'),
        ) as CurriculumSnapshot,
    ),
  )
  const calls: string[] = []
  let failed = false
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (failed) return new Response('{}', { status: 503 })
    if (url.includes('oauth2.googleapis.com'))
      return Response.json({ access_token: 'fake-test-token', expires_in: 3600 })
    const k = snapshots[0].payload
    if (k.sourceType !== 'google-sheets') throw new Error('Expected sheet')
    if (url.includes('values:batchGet'))
      return Response.json({ valueRanges: k.sheets!.map((sheet) => ({ values: sheet.values })) })
    if (url.includes('sheets.googleapis.com'))
      return Response.json({
        spreadsheetId: k.spreadsheetId,
        sheets: k.sheets!.map((sheet, index) => ({
          properties: { sheetId: Number(sheet.sheetId), title: sheet.title, index },
        })),
      })
    const source = snapshots.find((snapshot) => url.includes(snapshot.sourceId))
    assert.ok(source, `Unexpected request: ${url}`)
    if (source.payload.sourceType !== 'google-slides') throw new Error('Expected slides')
    return Response.json({
      ...source.payload,
      slides: source.payload.slides!.map((slide) => ({
        ...slide,
        pageElements: slide.pageElements || [
          { shape: { text: { textElements: [{ textRun: { content: slide.text } }] } } },
        ],
      })),
    })
  }
  try {
    const service = createCurriculumService({
      directory,
      oauth: { clientId: 'test-only', clientSecret: 'test-only', refreshToken: 'test-only' },
    })
    await service.refresh()
    assert.ok(calls.some((url) => url.includes('values:batchGet')))
    assert.equal(service.statuses.size, 3)
    const previous = await Promise.all(
      BETA_GRADES.map(async (grade) => {
        assert.ok(service.statuses.get(grade)?.lastSuccess, `${grade}: ${JSON.stringify(service.statuses.get(grade))}`)
        const raw = await readFile(join(directory, `${gradeSlugs[grade]}.json`), 'utf8')
        assert.ok(inspectSnapshot(JSON.parse(raw)).datasets.length >= 5)
        return raw
      }),
    )
    failed = true
    await service.refresh()
    for (const [index, grade] of BETA_GRADES.entries()) {
      assert.ok(service.statuses.get(grade)?.error)
      assert.equal(await readFile(join(directory, `${gradeSlugs[grade]}.json`), 'utf8'), previous[index])
    }
    const old = snapshots[1]
    if (old.payload.sourceType !== 'google-slides') throw new Error('Expected slides')
    const partial = buildCurriculumSnapshot('Grade 2', { ...old.payload, slides: old.payload.slides!.slice(0, 1) }, '')
    await assert.rejects(publishCurriculumSnapshot(join(directory, 'grade2.json'), partial), /remove a valid week/)
    assert.throws(
      () =>
        buildCurriculumSnapshot(
          'Grade 2',
          { sourceType: 'google-slides', presentationId: old.sourceId, slides: [] },
          '',
        ),
      /no valid lessons/,
    )
  } finally {
    globalThis.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  }
})
