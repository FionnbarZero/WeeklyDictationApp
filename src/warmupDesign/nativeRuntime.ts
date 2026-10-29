import { scopedActivityStorage } from '../activity/scopedStorage.ts'
import { familyPreview, previewProfile } from '../familyBeta/runtime.ts'

/** Correction checkpoints are separate from the Grade 2 legacy workspace.
 * That workspace intentionally accepts only its existing application keys. */
export function nativeWarmupStorage(): Storage {
  const profile = previewProfile()
  if (familyPreview && !profile) throw new Error('Choose an active child before opening Warmup.')
  return scopedActivityStorage(
    localStorage,
    `family-native-warmup:${profile?.grade || 'local'}:${profile?.id || 'local'}:`,
  )
}
