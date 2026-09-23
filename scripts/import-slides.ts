import { readFile } from 'node:fs/promises'
import { importLatestWeeklyDataset, type PresentationLike, grade5DeckProfile } from '../src/slidesImporter.ts'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: npm run import:slides -- path/to/google-slides-presentation.json')
  process.exit(1)
}
const presentation = JSON.parse(await readFile(inputPath, 'utf8')) as PresentationLike
const existingIds = process.argv.slice(3)
const result = importLatestWeeklyDataset(presentation, existingIds, grade5DeckProfile)
console.log(JSON.stringify(result, null, 2))
if (result.status === 'error') process.exitCode = 2
