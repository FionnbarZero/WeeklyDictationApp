import { firebaseConfigReady } from '../config.ts'

export const gameRecoveryPreview = import.meta.env?.VITE_W2_RECOVERY_PREVIEW === 'true'

// Explicit historical saved-game example only. Ordinary games retain their
// approved session-only policy; never enable a test entrance for family accounts.
export const savedGameRecoveryExample =
  gameRecoveryPreview &&
  !firebaseConfigReady &&
  (() => {
    try {
      return new URLSearchParams(window.parent.location.search).get('example') === 'game-recovery'
    } catch {
      return false
    }
  })()
