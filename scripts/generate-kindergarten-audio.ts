import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

type Manifest = {
  generatedAt: string
  voice: {
    provider: string
    name: string
    languageCode: string
    productionCandidates: string[]
  }
  instructions: Record<string, {
    text: string
    storagePath: string
    provider: string
    voice: string
    languageCode: string
    rateWordsPerMinute: number
    productionReplacement: string
  }>
  assets: Record<string, { storagePath: string; sourceUnitIds: string[] }>
  contexts: Record<string, { storagePath: string; targetOccurrenceIds: string[] }>
}

type ContextCatalog = {
  candidates: Array<{
    status: 'Draft' | 'Approved' | 'Revise'
    targetOccurrenceId: string
    contextTokens: string[]
  }>
}

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'public/audio/kindergarten/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
const contextCatalogPath = resolve(root, 'src/curriculum/contextCatalogs/kindergarten.json')
const contextCatalog = JSON.parse(readFileSync(contextCatalogPath, 'utf8')) as ContextCatalog
const localPreview = process.argv.includes('--local-preview')
const onlyMissing = process.argv.includes('--only-missing')
const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY
const cloudVoice = process.env.KINDERGARTEN_MANDARIN_VOICE
const femaleCloudVoices = ['cmn-CN-Wavenet-A', 'cmn-CN-Wavenet-D']
const requestedVoice = localPreview ? 'Tingting' : cloudVoice

if (!localPreview && !apiKey) {
  throw new Error(
    'Set GOOGLE_CLOUD_TTS_API_KEY for approved Cloud TTS generation, or pass --local-preview for temporary beta recordings.',
  )
}
if (!localPreview && (!cloudVoice || !femaleCloudVoices.includes(cloudVoice))) {
  throw new Error(`Set KINDERGARTEN_MANDARIN_VOICE to one of: ${femaleCloudVoices.join(', ')}.`)
}
if (onlyMissing && manifest.voice.name !== requestedVoice) {
  throw new Error(
    `--only-missing cannot mix ${requestedVoice} with existing ${manifest.voice.name} files. Regenerate the complete catalog when changing voices.`,
  )
}

function generateLocalPreview(text: string, outputPath: string, voice = 'Tingting', rateWordsPerMinute = 120) {
  const temporary = mkdtempSync(join(tmpdir(), 'weekly-dictation-kindergarten-audio-'))
  const aiff = join(temporary, 'prompt.aiff')
  try {
    execFileSync('say', ['-v', voice, '-r', String(rateWordsPerMinute), '-o', aiff, text], { stdio: 'inherit' })
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', aiff, outputPath], { stdio: 'inherit' })
  } finally {
    rmSync(temporary, { force: true, recursive: true })
  }
}

function hasAudioPayload(outputPath: string) {
  if (!existsSync(outputPath)) return false
  const bytes = readFileSync(outputPath)
  return bytes.length > 4096 && bytes.subarray(4096).some((byte) => byte !== 0)
}

function unicodeFileStem(text: string) {
  return [...text].map((character) => `u${character.codePointAt(0)!.toString(16)}`).join('-')
}

async function generateGoogleCloud(text: string, outputPath: string) {
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey!,
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'cmn-CN', name: cloudVoice! },
      audioConfig: { audioEncoding: 'LINEAR16', speakingRate: 0.65 },
    }),
  })
  const body = (await response.json()) as { audioContent?: string; error?: { message?: string } }
  if (!response.ok || !body.audioContent) {
    throw new Error(body.error?.message || `Cloud Text-to-Speech failed with HTTP ${response.status}.`)
  }
  writeFileSync(outputPath, Buffer.from(body.audioContent, 'base64'))
}

const approvedContexts: Manifest['contexts'] = {}
for (const candidate of contextCatalog.candidates.filter((item) => item.status === 'Approved')) {
  const text = candidate.contextTokens.join('')
  const existing = approvedContexts[text]
  if (existing) {
    if (!existing.targetOccurrenceIds.includes(candidate.targetOccurrenceId)) {
      existing.targetOccurrenceIds.push(candidate.targetOccurrenceId)
    }
  } else {
    approvedContexts[text] = {
      storagePath: `audio/kindergarten/context/${unicodeFileStem(text)}.wav`,
      targetOccurrenceIds: [candidate.targetOccurrenceId],
    }
  }
}
manifest.contexts = approvedContexts

for (const [text, asset] of [...Object.entries(manifest.assets), ...Object.entries(manifest.contexts)]) {
  const outputPath = resolve(root, 'public', asset.storagePath)
  if (onlyMissing && hasAudioPayload(outputPath)) continue
  mkdirSync(resolve(outputPath, '..'), { recursive: true })
  if (localPreview) generateLocalPreview(text, outputPath)
  else await generateGoogleCloud(text, outputPath)
  if (!hasAudioPayload(outputPath)) {
    throw new Error(`Generated audio for ${text} contains no playable audio payload.`)
  }
}

if (localPreview) {
  for (const instruction of Object.values(manifest.instructions)) {
    const outputPath = resolve(root, 'public', instruction.storagePath)
    if (onlyMissing && hasAudioPayload(outputPath)) continue
    mkdirSync(resolve(outputPath, '..'), { recursive: true })
    generateLocalPreview(instruction.text, outputPath, instruction.voice, instruction.rateWordsPerMinute)
    if (!hasAudioPayload(outputPath)) {
      throw new Error(`Generated instruction audio for ${instruction.text} contains no playable audio payload.`)
    }
  }
}

manifest.generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
manifest.voice = localPreview
  ? { provider: 'apple-local-beta', name: 'Tingting', languageCode: 'zh-CN', productionCandidates: femaleCloudVoices }
  : {
      provider: 'google-cloud',
      name: cloudVoice!,
      languageCode: 'cmn-CN',
      productionCandidates: femaleCloudVoices,
    }
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
