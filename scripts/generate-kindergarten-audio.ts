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
    productionReplacement: string
  }
  assets: Record<string, { storagePath: string; sourceUnitIds: string[] }>
}

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'public/audio/kindergarten/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
const localPreview = process.argv.includes('--local-preview')
const onlyMissing = process.argv.includes('--only-missing')
const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY

if (!localPreview && !apiKey) {
  throw new Error(
    'Set GOOGLE_CLOUD_TTS_API_KEY for approved Cloud TTS generation, or pass --local-preview for temporary beta recordings.',
  )
}

function generateLocalPreview(text: string, outputPath: string) {
  const temporary = mkdtempSync(join(tmpdir(), 'weekly-dictation-kindergarten-audio-'))
  const aiff = join(temporary, 'prompt.aiff')
  try {
    execFileSync('say', ['-v', 'Tingting', '-r', '120', '-o', aiff, text], { stdio: 'inherit' })
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

async function generateGoogleCloud(text: string, outputPath: string) {
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey!,
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'cmn-CN', name: 'cmn-CN-Wavenet-C' },
      audioConfig: { audioEncoding: 'LINEAR16', speakingRate: 0.65 },
    }),
  })
  const body = (await response.json()) as { audioContent?: string; error?: { message?: string } }
  if (!response.ok || !body.audioContent) {
    throw new Error(body.error?.message || `Cloud Text-to-Speech failed with HTTP ${response.status}.`)
  }
  writeFileSync(outputPath, Buffer.from(body.audioContent, 'base64'))
}

for (const [text, asset] of Object.entries(manifest.assets)) {
  const outputPath = resolve(root, 'public', asset.storagePath)
  if (onlyMissing && hasAudioPayload(outputPath)) continue
  mkdirSync(resolve(outputPath, '..'), { recursive: true })
  if (localPreview) generateLocalPreview(text, outputPath)
  else await generateGoogleCloud(text, outputPath)
  if (!hasAudioPayload(outputPath)) {
    throw new Error(`Generated audio for ${text} contains no playable audio payload.`)
  }
}

manifest.generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
manifest.voice = localPreview
  ? { provider: 'apple-local-beta', name: 'Tingting', languageCode: 'zh-CN', productionReplacement: 'cmn-CN-Wavenet-C' }
  : {
      provider: 'google-cloud',
      name: 'cmn-CN-Wavenet-C',
      languageCode: 'cmn-CN',
      productionReplacement: 'cmn-CN-Wavenet-C',
    }
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
