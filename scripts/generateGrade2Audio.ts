import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grade2AcquisitionStrategy } from '../src/acquisition/strategies/grade2.ts'
import { hydrateAutomaticGrade2Curriculum } from '../src/automaticGrade2Curriculum.ts'
import { parseGrade2CurriculumSnapshot } from '../src/curriculum/grade2CurriculumSnapshot.ts'
import { createInitialState } from '../src/domain.ts'
import { recordedMandarinFileName } from '../src/audio/recordedMandarinAudio.ts'

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`)
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const snapshot = parseGrade2CurriculumSnapshot(
  JSON.parse(readFileSync(join(repositoryRoot, 'public/curriculum/grade2-presentation.json'), 'utf8')),
)
const state = hydrateAutomaticGrade2Curriculum(createInitialState(), snapshot)
const curriculumTerms = state.datasets.flatMap((dataset) =>
  Object.values(dataset.vocabulary || { tier1: dataset.words, tier2: [], tier3: [] })
    .flat()
    .map((word) => word.text),
)
const terms = [...new Set([
  ...curriculumTerms,
  ...grade2AcquisitionStrategy.familiarDtTargets.map((word) => word.text),
])].sort((left, right) => left.localeCompare(right, 'zh-CN'))
const outputDirectory = join(repositoryRoot, 'public/audio/mandarin')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'weekly-dictation-grade2-audio-'))
mkdirSync(outputDirectory, { recursive: true })

for (const [index, term] of terms.entries()) {
  const fileName = recordedMandarinFileName(term)
  const temporaryFile = join(temporaryDirectory, `${fileName}.aiff`)
  const outputFile = join(outputDirectory, fileName)
  run('say', ['-v', 'Tingting', '-r', '100', '-o', temporaryFile, term])
  run('afconvert', [temporaryFile, '-o', outputFile, '-f', 'WAVE', '-d', 'LEI16'])
  unlinkSync(temporaryFile)
  if (statSync(outputFile).size <= 4096) throw new Error(`Generated audio is empty for ${term}.`)
  process.stdout.write(`Generated ${index + 1}/${terms.length}: ${term}\n`)
}

rmdirSync(temporaryDirectory)
