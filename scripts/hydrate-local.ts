import { readFile } from 'node:fs/promises'
import { createInitialState, loadState } from '../src/domain.ts'
import { dryRunSummary, grade2DeckProfile, grade5DeckProfile } from '../src/slidesImporter.ts'
import { hydrateLocalStateFromJson } from '../src/localHydration.ts'

const args = process.argv.slice(2)
const presentationPath = args.find((arg) => !arg.startsWith('--'))
const statePath = args.find((arg) => arg.startsWith('--state='))?.slice('--state='.length)
const profile = args.includes('--grade-5') ? grade5DeckProfile : grade2DeckProfile

if (!presentationPath) {
  console.error('Usage: npm run hydrate:local -- path/to/presentation.json [--state=path/to/app-state.json] [--grade-5]')
  process.exit(1)
}

const presentationJson = await readFile(presentationPath, 'utf8')
const state = statePath ? loadState(await readFile(statePath, 'utf8')) : createInitialState()
const hydrated = hydrateLocalStateFromJson(state, presentationJson, profile)

console.log(JSON.stringify({ summary: dryRunSummary(hydrated.batch), state: hydrated.state }, null, 2))
if (hydrated.batch.status === 'error') process.exitCode = 2
