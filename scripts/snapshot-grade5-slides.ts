import { resolve } from 'node:path'
import {
  fetchGrade5CurriculumSnapshot,
  readGrade5CurriculumInput,
  writeGrade5CurriculumSnapshot,
} from './grade5SlidesSnapshot.ts'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required read-only Slides configuration: ${name}`)
  return value
}

const outputFlag = process.argv.find((argument) => argument.startsWith('--output='))
const inputFlag = process.argv.find((argument) => argument.startsWith('--input='))
const outputPath = resolve(outputFlag?.slice('--output='.length) || 'public/curriculum/grade5-presentation.json')
const { snapshot, extraction } = inputFlag
  ? await readGrade5CurriculumInput(resolve(inputFlag.slice('--input='.length)))
  : await fetchGrade5CurriculumSnapshot({
      clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
      clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
      refreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN'),
    })
await writeGrade5CurriculumSnapshot(outputPath, snapshot)
console.log(
  `Saved ${extraction.classification.selectedCandidates.length} validated Grade 5 datasets from ${snapshot.source.documentId}.`,
)
console.log(`Curriculum SHA-256 ${snapshot.source.contentSha256}`)
