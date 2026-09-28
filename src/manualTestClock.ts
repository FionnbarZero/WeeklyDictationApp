export type ManualTestClock = {
  dateKey: string
  label: string
  now: () => Date
}

const TEST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validDateKey(value: string) {
  if (!TEST_DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function resolveManualTestClock(search: string, isDevelopment: boolean): ManualTestClock | null {
  if (!isDevelopment) return null
  const dateKey = new URLSearchParams(search).get('testDate')?.trim() || ''
  if (!validDateKey(dateKey)) return null

  const timestamp = `${dateKey}T12:00:00.000Z`
  const label = `Testing as ${new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp))}`

  return {
    dateKey,
    label,
    now: () => new Date(timestamp),
  }
}
