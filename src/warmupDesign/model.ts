/** Isolated interaction contract. This does not replace any grade's scheduler. */
export type WarmupDesignState = {
  version: 1
  revision: number
  index: number
  phase: 'memory' | 'compare' | 'trace' | 'complete'
  character: number
  firstAnswers: boolean[]
}
export type WarmupDesignAction =
  | { type: 'compare' }
  | { type: 'answer'; correct: boolean }
  | { type: 'character-complete' }

export function newWarmupDesign(): WarmupDesignState {
  return { version: 1, revision: 0, index: 0, phase: 'memory', character: 0, firstAnswers: [] }
}

export function validateWarmupDesign(value: unknown, lengths: number[]): WarmupDesignState {
  const s = value as WarmupDesignState
  if (
    !s ||
    s.version !== 1 ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !Number.isSafeInteger(s.index) ||
    s.index < 0 ||
    s.index > lengths.length ||
    !['memory', 'compare', 'trace', 'complete'].includes(s.phase) ||
    !Number.isSafeInteger(s.character) ||
    s.character < 0 ||
    !Array.isArray(s.firstAnswers) ||
    s.firstAnswers.some((answer) => typeof answer !== 'boolean') ||
    s.firstAnswers.length < s.index ||
    s.firstAnswers.length > Math.min(s.index + 1, lengths.length) ||
    (s.firstAnswers.length > s.index && s.firstAnswers[s.index] !== false) ||
    (s.phase === 'complete' ? s.index !== lengths.length || s.character !== 0 : s.index === lengths.length) ||
    (s.phase === 'trace' ? s.character >= lengths[s.index] || s.firstAnswers[s.index] !== false : s.character !== 0)
  )
    throw new Error('This prototype’s saved place could not be read. It has been preserved.')
  return s
}

export function advanceWarmupDesign(s: WarmupDesignState, action: WarmupDesignAction, lengths: number[]) {
  validateWarmupDesign(s, lengths)
  let next = { ...s, firstAnswers: [...s.firstAnswers] }
  if (action.type === 'compare' && s.phase === 'memory') next.phase = 'compare'
  else if (action.type === 'character-complete' && s.phase === 'trace') {
    if (s.character + 1 < lengths[s.index]) next.character += 1
    else {
      next.phase = 'memory'
      next.character = 0
    }
  } else if (action.type === 'answer' && s.phase === 'compare') {
    if (s.firstAnswers.length === s.index) next.firstAnswers.push(action.correct)
    if (!action.correct) {
      next.phase = 'trace'
      next.character = 0
    } else {
      next.index += 1
      next.phase = next.index === lengths.length ? 'complete' : 'memory'
    }
  } else return s
  next = { ...next, revision: s.revision + 1 }
  return validateWarmupDesign(next, lengths)
}

/** Ink is never saved. A reopened unscored comparison repeats its memory trial. */
export function reopenWarmupDesign(s: WarmupDesignState): WarmupDesignState {
  return s.phase === 'compare' ? { ...s, phase: 'memory', revision: s.revision + 1 } : s
}
