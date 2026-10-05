import type { Page } from '@playwright/test'

export async function openGrade2LearningActivity(
  page: Page,
  sectionName: 'Enter the Dojo' | 'The Final Boss Test' | 'Enter the Spirit Realm',
  activityName:
    | 'Learn to Write'
    | 'Stroke Order'
    | 'Read the Words'
    | 'Writing Test'
    | 'Reading Test'
    | 'Writing mastery warmup'
    | 'Reading mastery',
) {
  await page.getByRole('button', { name: new RegExp(sectionName, 'i') }).click()
  await page.getByRole('button', { name: activityName, exact: true }).click()
}
