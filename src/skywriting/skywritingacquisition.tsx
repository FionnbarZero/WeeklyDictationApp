import { WritingPad, type WritingPadStateUpdater } from './WritingPad.tsx'
import type { WritingPadState } from './model.ts'
import './skywriting.css'

export type SkyWritingAcquisitionPhase = 'writing' | 'review'

export type SkyWritingAcquisitionProps = {
  word: string
  phase: SkyWritingAcquisitionPhase
  traceTarget?: boolean
  padState?: WritingPadState
  onPadStateChange?: (update: WritingPadStateUpdater) => void
}

/**
 * The handwriting response used inside a Tier 1 Acquisition presentation.
 * Acquisition owns the audio sequence, contextual sentence, timer, reveal
 * timing, and assessment transition; this component owns only writing and
 * visual comparison.
 */
export function SkyWritingAcquisition({ word, phase, traceTarget = true, padState, onPadStateChange }: SkyWritingAcquisitionProps) {
  const reviewing = phase === 'review'
  const characterCount = Math.max(1, [...word].length)

  return <div className={`skywriting-workspace skywriting-acquisition${reviewing ? ' is-review' : ''}`}>
    <section className="skywriting-child-example" aria-label={reviewing ? 'Your writing' : undefined}>
      <p className="skywriting-comparison-label" hidden={!reviewing}>Your writing</p>
      <WritingPad
        key={word}
        disabled={reviewing}
        characterCount={characterCount}
        traceText={reviewing || !traceTarget ? undefined : word}
        traceFont="songti"
        padState={padState}
        onPadStateChange={onPadStateChange}
      />
    </section>
    {reviewing && <section className="skywriting-model-example" aria-label="Correct word">
      <p className="skywriting-comparison-label">Correct word</p>
      <div className="skywriting-reveal-word" data-character-count={characterCount}>{word}</div>
    </section>}
  </div>
}
