import manifest from '../../public/audio/kindergarten/manifest.json' with { type: 'json' }
import type { Word } from '../domain/contracts.ts'
import { approvedContextTextForGradeTarget } from '../curriculum/contextCatalog.ts'
import { kindergartenDictationContextCatalog } from '../curriculum/kindergartenDictationContextCatalog.ts'

type ManifestAsset = {
  storagePath: string
  sourceUnitIds: string[]
}

type ContextManifestAsset = {
  storagePath: string
  targetOccurrenceIds: string[]
}

const assets = manifest.assets as Record<string, ManifestAsset>
const contexts = manifest.contexts as Record<string, ContextManifestAsset>

export function kindergartenInstructionAudio(key: keyof typeof manifest.instructions) {
  return manifest.instructions[key]
}

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
  const sentence = word.sentence.trim()
    || approvedContextTextForGradeTarget(kindergartenDictationContextCatalog, 'Kindergarten', word.text)
    || ''
  const isolated = kindergartenAudioForText(word.text)
  const context = sentence ? contexts[sentence] : undefined
  const audio = isolated || context || word.audio
    ? {
        ...word.audio,
        ...isolated,
        ...(context ? {
          contextStoragePath: context.storagePath,
          contextVoice: manifest.voice.name,
          generatedAt: manifest.generatedAt,
        } : {}),
      }
    : undefined
  return { ...word, sentence, ...(audio ? { audio } : {}) }
}
