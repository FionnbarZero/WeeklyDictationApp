import { readFile } from 'node:fs/promises'
import { hydrateFromGoogleSlidesReadOnly } from '../backend/readOnlyHydration.ts'
import { createInitialState, loadState } from '../src/domain.ts'
import { dryRunSummary } from '../src/slidesImporter.ts'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required read-only Slides configuration: ${name}`)
  return value
}

const args = process.argv.slice(2)
const statePath = args.find((arg) => arg.startsWith('--state='))?.slice('--state='.length)
const deckId = args.find((arg) => arg.startsWith('--deck-id='))?.slice('--deck-id='.length) || required('GOOGLE_SLIDES_PRESENTATION_ID')
const state = statePath ? loadState(await readFile(statePath, 'utf8')) : createInitialState()

const hydrated = await hydrateFromGoogleSlidesReadOnly(state, {
  deckId,
  googleOAuth: {
    clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
    refreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN'),
  },
})

console.log(JSON.stringify({ summary: dryRunSummary(hydrated.batch), state: hydrated.state }, null, 2))
if (hydrated.batch.status === 'error') process.exitCode = 2
