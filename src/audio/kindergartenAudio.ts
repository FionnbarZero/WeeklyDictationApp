import manifest from '../../public/audio/kindergarten/manifest.json' with { type: 'json' }
import type { Word } from '../domain/contracts.ts'

type ManifestAsset = {
  storagePath: string
  sourceUnitIds: string[]
}

const assets = manifest.assets as Record<string, ManifestAsset>

export function kindergartenAudioForText(text: string): Word['audio'] {
  const asset = assets[text]
  if (!asset) return undefined
  return {
    storagePath: asset.storagePath,
    voice: manifest.voice.name,
    generatedAt: manifest.generatedAt,
  }
}

export function withKindergartenAudio<T extends Word>(word: T): T {
  const audio = kindergartenAudioForText(word.text)
  return audio ? { ...word, audio } : word
}
