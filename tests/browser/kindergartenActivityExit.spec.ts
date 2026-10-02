import { expect, test } from './fixtures.ts'
import { watchForUnexpectedBrowserErrors } from './prototypeSupport.ts'

test.use({ viewport: { width: 390, height: 844 }, permissions: [] })

type ExitCase = {
  section: RegExp
  activity: string
  exit: 'Exit game' | 'Exit practice' | 'Exit reading'
  status: string
}

const exitCases: ExitCase[] = [
  {
    section: /Enter the Dojo/,
    activity: 'Writing characters',
    exit: 'Exit practice',
    status: 'Writing practice exited. No score was added.',
  },
  {
    section: /Enter the Dojo/,
    activity: 'High-frequency words',
    exit: 'Exit reading',
    status: 'Reading practice exited. No score was added.',
  },
  {
    section: /Practice your Ninja Skills/,
    activity: 'Listening Lily Pads',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Practice your Ninja Skills/,
    activity: 'Memory Lanterns',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Practice your Ninja Skills/,
    activity: 'Sky Writing',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Enter the Spirit Realm/,
    activity: 'Writing mastery warmup',
    exit: 'Exit game',
    status: 'Returned to the Kindergarten paths.',
  },
  {
    section: /Enter the Spirit Realm/,
    activity: 'Reading mastery',
    exit: 'Exit reading',
    status: 'Reading practice exited. No score was added.',
  },
]

for (const exitCase of exitCases) {
  test(`Kindergarten ${exitCase.activity} exits back to the Learning Hub without crashing`, async ({ page }) => {
    const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

    await page.goto('/kindergarten-learning-lab.html')
    await page.getByRole('button', { name: exitCase.section }).click()
    await page.getByRole('button', { name: exitCase.activity, exact: true }).click()
    await page.getByRole('button', { name: exitCase.exit }).click()

    await expect(page.getByRole('heading', { name: /Ready for your next adventure/ })).toBeVisible()
    await expect(page.getByText(exitCase.status)).toBeVisible()
    await expect(page.getByText('No scores yet')).toBeVisible()
    expectNoBrowserErrors()
  })
}

test('Kindergarten Reading Final Boss confirms and exits without retaining a score', async ({ page }) => {
  const expectNoBrowserErrors = watchForUnexpectedBrowserErrors(page)

  await page.goto('/kindergarten-learning-lab.html')
  await page.getByRole('button', { name: /The Final Boss Test/ }).click()
  await page.getByRole('button', { name: 'Reading Test', exact: true }).click()
  await page.getByRole('button', { name: 'Exit without saving' }).click()

  const confirmation = page.getByRole('dialog', { name: 'Exit without saving?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Exit without saving' }).click()

  await expect(page.getByRole('heading', { name: /Ready for your next adventure/ })).toBeVisible()
  await expect(page.getByText('Final Boss reading exited. Temporary recordings and provisional answers were discarded.')).toBeVisible()
  await expect(page.getByText('No scores yet')).toBeVisible()
  expectNoBrowserErrors()
})
