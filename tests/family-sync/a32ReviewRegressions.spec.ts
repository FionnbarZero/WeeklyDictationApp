import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  acquisitionPersistenceContext,
  prepareAcquisitionProgress,
} from '../../src/application/acquisitionPersistence.ts'
import { retainGrade2Editions, sourceGrade2Datasets } from '../../src/curriculum/grade2Revisions.ts'
import { createInitialState } from '../../src/domain.ts'
import { openAcquisitionStore } from '../../src/familyBeta/acquisitionStore.ts'
import { inspectSnapshot } from '../../src/familyBeta/curriculum.ts'
import { rememberLessonLaunch } from '../../src/familyBeta/lessonLaunch.ts'
import { grades, installFamilyFixtures, readGrade2Workspace } from './fixtures.ts'

for (const [slug, , childId] of grades) {
  for (const status of [429, 503]) {
    test(`${slug}: HTTP ${status} preserves confirmed offline access and saved practice`, async ({ page }) => {
      await installFamilyFixtures(page)
      await page.goto(`/?grade=${slug}`)
      if (slug === 'grade2') await page.getByLabel('Practice week').selectOption('2026-09-21')
      const enter = async (resuming = false) => {
        const frame = page.frameLocator('iframe:visible')
        await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
        await frame
          .getByRole('button', { name: slug === 'kindergarten' ? 'Writing characters' : 'Learn to Write', exact: true })
          .click()
        if (slug === 'grade2' || (slug === 'grade5' && !resuming))
          await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
        await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
        await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
      }
      const checkpoint = async () =>
        slug === 'grade2'
          ? (await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes![0]
          : page.evaluate(
              (id) =>
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('family-beta-acquisition-v1:') && !k.includes(':completed:'))
                  .map((k) => JSON.parse(localStorage.getItem(k)!))
                  .find((r) => r.envelope.childId === id).envelope,
              childId,
            )
      await enter()
      const before = await checkpoint()
      const grantKey = 'family-beta-offline-access-v1:synthetic-parent'
      expect(await page.evaluate((key) => !!localStorage.getItem(key), grantKey)).toBe(true)
      await page.route('**/documents:batchGet', (route) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: '{"error":{"message":"Temporary service unavailable"}}',
        }),
      )
      await page.reload()
      await expect(page.getByLabel('Child profile')).toHaveValue(childId)
      expect(await page.evaluate((key) => !!localStorage.getItem(key), grantKey)).toBe(true)
      await page.getByText('Saved lessons', { exact: true }).click()
      await page.getByRole('button', { name: /Resume saved writing/ }).click()
      await enter(true)
      expect((await checkpoint()).revision).toBe(before.revision + 1)
      await page.unroute('**/documents:batchGet')
      await page.reload()
      await expect(page.getByText(/Scores and saved practice confirmed/)).toBeVisible()
      expect((await checkpoint()).revision).toBe(before.revision + 1)
    })
  }
}

test('a confirmed bootstrap denial still revokes the offline grant', async ({ page }) => {
  await installFamilyFixtures(page)
  await page.goto('/?grade=grade5')
  await expect(page.getByText(/Scores and saved practice confirmed/)).toBeVisible()
  await page.route('**/documents:batchGet', (route) => route.fulfill({ status: 403, body: '{}' }))
  await page.reload()
  await expect(page.getByText(/Firestore error/)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('family-beta-offline-access-v1:synthetic-parent'))).toBeNull()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('an exact saved completed Grade 2 edition cannot advance a newer unfinished edition', async ({ page }) => {
  await installFamilyFixtures(page)
  const original = JSON.parse(await readFile('public/curriculum/beta/grade2.json', 'utf8'))
  const datasets = inspectSnapshot(original).datasets
  const dataset = datasets.find((d) => d.startDate === '2026-09-21')!
  const entries = new Map<string, string>()
  const storage = {
    get length() {
      return entries.size
    },
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
  const completed = openAcquisitionStore(storage, acquisitionPersistenceContext('synthetic-g2', dataset), {
    random: () => 0,
    now: () => '2026-09-21T00:00:00.000Z',
  })
  for (let i = 0; !completed.current.envelope.flow.complete && i < 2000; i++) completed.answer(true, 'timer')
  const old = completed.current.envelope
  expect(old.flow.teachingComplete).toBe(true)
  entries.clear()
  const payload = JSON.stringify(original.payload)
    .split(dataset.words[0].text)
    .join('__REVIEW_SWAP__')
    .split(dataset.words[1].text)
    .join(dataset.words[0].text)
    .split('__REVIEW_SWAP__')
    .join(dataset.words[1].text)
  const corrected = {
    ...original,
    payload: JSON.parse(payload),
    contentSha256: createHash('sha256').update(payload).digest('hex'),
  }
  const incoming = inspectSnapshot(corrected).datasets
  let state = createInitialState(datasets)
  state.acquisitionProgressEnvelopes = [old]
  state = retainGrade2Editions(state, incoming)
  const newer = sourceGrade2Datasets(state, incoming).find((d) => d.startDate === dataset.startDate)!
  const prepared = prepareAcquisitionProgress(state, 'synthetic-g2', newer, '2026-09-21T00:00:00.000Z', () => 0, true)
  if (prepared.status !== 'ready') throw new Error('Synthetic corrected edition failed to initialize')
  const legacyKey = 'family-beta-activity:synthetic-g2:weekly-dictation-state-v2'
  storage.setItem(legacyKey, JSON.stringify(prepared.state))
  const profile = { id: 'synthetic-g2', grade: 'Grade 2' as const, nickname: 'Grade 2', active: true }
  rememberLessonLaunch(storage, profile, old, original, dataset.startDate)
  rememberLessonLaunch(storage, profile, prepared.envelope, corrected, dataset.startDate)
  await page.addInitScript(
    (data) => {
      if (sessionStorage.getItem('editions-seeded')) return
      for (const [key, value] of data) localStorage.setItem(key, value)
      sessionStorage.setItem('editions-seeded', '1')
    },
    [...entries],
  )
  await page.route('**/curriculum/beta/grade2.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(corrected) }),
  )
  await page.goto('/?grade=grade2')
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.getByText(/Scores and saved practice confirmed/)).toBeVisible()
    await page.getByText('Saved lessons', { exact: true }).click()
    await expect(page.getByRole('button', { name: /Resume saved writing/ })).toHaveCount(2)
    const index = await page.evaluate(
      (hash) =>
        Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
          .filter((k) => k.startsWith('family-beta-activity:synthetic-g2:lesson-launch-v1:'))
          .map((k) => JSON.parse(localStorage.getItem(k)!))
          .filter((l) => l.channel === 'writing')
          .findIndex((l) => l.sourceHash === hash),
      original.contentSha256,
    )
    await page
      .getByRole('button', { name: /Resume saved writing/ })
      .nth(index)
      .click()
    await expect(page.locator('iframe:visible')).toHaveAttribute('data-family-curriculum', original.contentSha256)
    const frame = page.frameLocator('iframe:visible')
    await frame.getByRole('button', { name: /Enter the Dojo/ }).click()
    await frame.getByRole('button', { name: 'Learn to Write', exact: true }).click()
    await frame.getByRole('button', { name: 'Skip Warmup', exact: true }).click()
    await frame.getByRole('button', { name: 'Skip Timer', exact: true }).click()
    await frame.getByRole('button', { name: 'I got it right', exact: true }).click()
    const after = (await page.evaluate(readGrade2Workspace))!.acquisitionProgressEnvelopes!
    expect(after.find((e) => e.id === old.id)!.revision).toBeGreaterThan(old.revision + visit)
    expect(after.find((e) => e.id === prepared.envelope.id)).toEqual(prepared.envelope)
    // Original storage remains a recovery copy, even after new-edition writes.
    expect(await page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBe(entries.get(legacyKey))
    await page.reload()
  }
})
