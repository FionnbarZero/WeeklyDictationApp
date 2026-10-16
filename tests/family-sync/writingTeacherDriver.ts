import { expect, type Page } from '@playwright/test'
import { strokeOrderGuide } from '../../src/familyBeta/strokeOrderSlay.ts'
import { getStrokeLayout } from '../../src/strokeTeacherPrototype/original/strokeLayout.ts'

/** Exercise the approved teacher through real controls; never edit checkpoints.
 * Legacy matrix keeps its original launch/answer sequence unchanged. */
export async function finishEnabledTeacher(page: Page) {
  if (process.env.FAMILY_CURRENT_WRITING !== '1') return
  const frame = page.frameLocator('iframe:visible')
  const teacher = frame.getByRole('region', { name: 'Stroke order teacher' })
  const skip = frame.getByRole('button', { name: 'Skip Timer', exact: true })
  const right = frame.getByRole('button', { name: 'I got it right', exact: true })
  const warmup = frame.getByRole('button', { name: 'Skip Warmup', exact: true })
  // Launch may mount its optional Warmup after the caller's visibility check.
  // Wait for a real entry state rather than racing the asynchronous render.
  await expect(teacher.or(skip).or(right).or(warmup)).toBeVisible()
  if (await warmup.isVisible()) await warmup.click()
  await expect(teacher.or(skip).or(right)).toBeVisible()
  for (let attempt = 0; attempt < 25 && (await teacher.isVisible()); attempt++) {
    const targetId = await teacher.getAttribute('data-report-target')
    const word = await page.evaluate((id) => {
      for (const raw of Object.values(localStorage)) {
        let record
        try {
          record = JSON.parse(raw)
        } catch {
          continue
        }
        const candidates = [record?.writing]
        for (const nested of Object.values(record?.records || {})) {
          try {
            candidates.push(...(JSON.parse(nested as string).values?.writingAcquisitionProgress || []))
          } catch {
            /* Other protected records. */
          }
        }
        for (const progress of candidates) {
          const target = progress?.lesson?.targets?.find((target: { id: string }) => target.id === id)
          if (target) return target.text as string
        }
      }
      throw new Error('Synthetic teacher target not found')
    }, targetId)
    const index = Number(await teacher.getAttribute('data-character-index'))
    const step = Number(await teacher.getAttribute('data-step'))
    const strokes = strokeOrderGuide({ id: targetId!, text: [...word][index] }).strokes
    const layout = getStrokeLayout(strokes)
    const pad = teacher.locator('svg[role="application"]')
    for (let i = Number(await pad.getAttribute('data-next-stroke')); i < strokes.length; i++) {
      const b = (await pad.boundingBox())!
      const xy = (p: readonly [number, number]) =>
        [
          b.x + ((p[0] * layout.scale + layout.offsetX) * b.width) / 100,
          b.y + ((p[1] * layout.scale + layout.offsetY) * b.height) / 100,
        ] as const
      await page.mouse.move(...xy(strokes[i][0]))
      await page.mouse.down()
      for (const point of strokes[i].slice(1)) await page.mouse.move(...xy(point))
      await page.mouse.up()
      await expect(pad).toHaveAttribute('data-next-stroke', String(i + 1))
    }
    await frame.getByRole('button', { name: step === 5 ? 'Compare' : 'Next step', exact: true }).click()
    if (step === 5) await frame.getByRole('button', { name: 'I slayed it', exact: true }).click()
    await expect
      .poll(() =>
        teacher.evaluateAll((nodes) => {
          const active = nodes[0]
          return active
            ? `${active.getAttribute('data-character-index')}:${active.getAttribute('data-step')}`
            : 'acquisition'
        }),
      )
      .not.toBe(`${index}:${step}`)
  }
  await expect(teacher).toBeHidden()
}
