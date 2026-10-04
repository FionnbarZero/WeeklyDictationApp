import { resolve } from 'node:path'
import {
  fetchGrade2CurriculumSnapshot,
  readGrade2CurriculumSnapshot,
  writeGrade2CurriculumSnapshot,
} from './grade2SlidesSnapshot.ts'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required read-only Slides configuration: ${name}`)
  return value
}

const outputFlag = process.argv.find((argument) => argument.startsWith('--output='))
const inputFlag = process.argv.find((argument) => argument.startsWith('--input='))
const outputPath = resolve(outputFlag?.slice('--output='.length) || 'public/curriculum/grade2-presentation.json')
const { snapshot, batch } = inputFlag
  ? await readGrade2CurriculumSnapshot(resolve(inputFlag.slice('--input='.length)))
  : await fetchGrade2CurriculumSnapshot({
      clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
      clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
      refreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN'),
    })
await writeGrade2CurriculumSnapshot(outputPath, snapshot)
console.log(`Saved ${batch.summary.datasetCount} validated Grade 2 datasets from ${snapshot.source.documentId}.`)
console.log(`Curriculum SHA-256 ${snapshot.source.contentSha256}`)
