import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateCurriculum } from '../src/familyBeta/curriculum.ts'
import { GAME_LANGUAGE } from '../src/ninjaSkills/gameLanguagePreviewCatalog.ts'
import { TARGETS } from '../src/grade5PresentationPreview/assessmentData.ts'

// Public teaching content only. No learner records, voice recordings or credentials.
const root = resolve(import.meta.dirname, '..')
const out = resolve(process.argv[2] || 'family-beta-artifacts/kore-2026-10-26')
mkdirSync(out, { recursive: true })
const corpus = new Map<string, Set<string>>()
function add(value: string, source: string) {
  const text = value.trim().replace(/[。！？.!?]+$/u, '')
  if (!/\p{Script=Han}/u.test(text) || text.length > 300) return
  const sources = corpus.get(text) || new Set<string>()
  sources.add(source)
  corpus.set(text, sources)
}
function word(text: string, sentence: string, source: string) {
  add(text, source)
  for (const character of text.match(/\p{Script=Han}/gu) || []) add(character, `${source}:character`)
  if (sentence) add(sentence, `${source}:sentence`)
}
for (const [grade, rows] of Object.entries(GAME_LANGUAGE)) {
  for (const [text, , , tokens] of rows) {
    word(text, tokens.join(''), `approved-game-language:${grade}`)
    tokens.forEach((token) => add(token, `approved-game-language:${grade}:token`))
  }
}
for (const target of TARGETS) {
  word(target.text, target.sentence, 'grade5-approved-eight-word-assessment')
  target.tokens.forEach((token) => add(token, 'grade5-assessment:token'))
}
for (const [slug, grade] of [
  ['kindergarten', 'Kindergarten'],
  ['grade2', 'Grade 2'],
  ['grade5', 'Grade 5'],
] as const) {
  const endpoint = `https://weekly-dictation-curriculum-am3afdy42a-uc.a.run.app/curriculum/beta/${slug}.json`
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`Curriculum unavailable: ${grade} ${response.status}`)
  const current = await response.text()
  writeFileSync(resolve(out, `${slug}.json`), current)
  for (const [label, raw] of [
    ['current', current],
    ['retained', readFileSync(resolve(root, `tests/fixtures/dojo-launch-2026-10-16/${slug}.json`), 'utf8')],
  ]) {
    const { datasets } = await validateCurriculum(raw, grade)
    for (const dataset of datasets) {
      const words = [...dataset.words, ...Object.values(dataset.vocabulary || {}).flat()]
      for (const entry of words) {
        if (entry.language === 'english') continue
        word(entry.text, entry.sentence, `${grade}:${label}:${dataset.id}`)
        if (entry.learningModule?.context) {
          add(entry.learningModule.context.sentence, `${grade}:${label}:context`)
          entry.learningModule.context.tokens.forEach((token) => add(token, `${grade}:${label}:token`))
        }
      }
    }
  }
}
for (const file of ['src/audio/kindergarten/manifest.json', 'src/audio/kindergarten/automatic-manifest.json']) {
  const manifest = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  for (const text of Object.keys({ ...manifest.assets, ...manifest.contexts })) word(text, '', file)
}
// Familiar distractors and existing support are explicit checked-in teaching strings.
for (const file of [
  'src/acquisition/strategies/kindergarten.ts',
  'src/acquisition/strategies/grade2.ts',
  'src/ninjaSkills/dictationContent.ts',
  'src/ninjaSkills/supplemental.ts',
]) {
  for (const match of readFileSync(resolve(root, file), 'utf8').matchAll(/'([^'\n]*[\u3400-\u9fff][^'\n]*)'/gu))
    add(match[1], file)
}
const entries = [...corpus]
  .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  .map(([text, sources]) => ({
    text,
    id: createHash('sha256').update(text).digest('hex').slice(0, 24),
    sources: [...sources].sort(),
  }))
const characters = entries.reduce((total, entry) => total + [...entry.text].length, 0)
const costUsd = (characters * 30) / 1_000_000
if (costUsd > 0.9) throw new Error('Corpus exceeds the existing $1 generation budget with retry reserve.')
const result = {
  schema: 1,
  voice: 'cmn-CN-Chirp3-HD-Kore',
  languageCode: 'cmn-CN',
  speakingRate: 0.65,
  characters,
  estimatedCostUsdBeforeFreeAllowance: costUsd,
  entries,
}
writeFileSync(resolve(out, 'corpus.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify({ prompts: entries.length, characters, costUsd, out }))
