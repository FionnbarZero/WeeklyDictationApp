import { scopedActivityStorage } from '../activity/scopedStorage.ts'
import type { FamilyWorkspaceWindow } from './workspaceOwner.ts'
import { BETA_GRADES, makeResult, type BetaProfile, type BetaResult, type ResultInput } from './model.ts'
import { isFamilyActivityContext } from './context.ts'
import { RESULT_KEY, PENDING_KEY, readResultLedger, acknowledgeCompletedResult, assertResultCopiesMatch } from './resultLedger.ts'
import '../activity/activityLifecycle.ts'

function parentRole() {
  try { return window.parent.document.body.dataset.familyContext }
  catch { return undefined }
}
export const familyPreview = isFamilyActivityContext({
  enabled: import.meta.env.VITE_RECONCILIATION_PREVIEW === 'true',
  pageRole: document.body.dataset.familyContext,
  embedded: window.parent !== window,
  requested: new URLSearchParams(window.location.search).get('family-preview') === '1',
  parentRole: parentRole(),
})
export const PROFILE_KEY = 'family-beta-preview-selected-v1'
export { RESULT_KEY, PENDING_KEY }
if (familyPreview && window.parent !== window) document.documentElement.classList.add('family-beta-frame')

export function previewProfile(): BetaProfile | null {
  if (!familyPreview) return null
  try {
    const owner = window.parent !== window && window.frameElement?.hasAttribute('data-family-slot') ? window.frameElement : null
    const p = JSON.parse((owner ? owner.getAttribute('data-family-profile') : sessionStorage.getItem(PROFILE_KEY)) || 'null') as BetaProfile | null
    return p && /^[\w-]{1,160}$/.test(p.id) && BETA_GRADES.includes(p.grade) && p.active ? p : null
  } catch {
    return null
  }
}
export const previewResults = () => readResultLedger(localStorage, RESULT_KEY)
export const pendingResults = () => readResultLedger(localStorage, PENDING_KEY)
export const acknowledgeResult = (result: BetaResult) => acknowledgeCompletedResult(localStorage, result)
export function savePreviewResult(input: ResultInput): BetaResult | null {
  const profile = previewProfile()
  if (!profile) {
    if (familyPreview) throw new Error('Choose an active child profile before saving this result.')
    return null
  }
  if (input.attempted === 0) return null
  const results = previewResults()
  const existing = input.id ? [...results, ...pendingResults()].find((r) => r.id === input.id) : undefined
  if (existing) {
    assertResultCopiesMatch(localStorage, RESULT_KEY, existing)
    assertResultCopiesMatch(localStorage, PENDING_KEY, existing)
    if (
      existing.childId !== profile.id ||
      existing.grade !== profile.grade ||
      existing.activity !== input.activity ||
      existing.channel !== input.channel ||
      JSON.stringify(existing.datasetIds) !== JSON.stringify([...new Set(input.datasetIds)]) ||
      existing.correct !== input.correct ||
      existing.attempted !== input.attempted
    )
      throw new Error('This attempt conflicts with an existing result. Nothing was overwritten.')
    localStorage.setItem(`${RESULT_KEY}:${existing.id}`, JSON.stringify(existing))
    confirmResult(existing)
    return existing
  }
  const result = makeResult(profile, input)
  // The durable outbox is written before presenting completion. No recordings or answers enter it.
  // One key per immutable result prevents simultaneous tabs from losing each other's writes.
  localStorage.setItem(`${PENDING_KEY}:${result.id}`, JSON.stringify(result))
  localStorage.setItem(`${RESULT_KEY}:${result.id}`, JSON.stringify(result))
  confirmResult(result)
  return result
}

function confirmResult(result: BetaResult) {
  const saved = previewResults().find((r) => r.id === result.id)
  if (!saved || JSON.stringify(saved) !== JSON.stringify(result))
    throw new Error('The result could not be confirmed on this device.')
  window.parent.postMessage({ type: 'family-beta-result-ready' }, window.location.origin)
}

export function activityStorage(): Storage {
  if (!familyPreview) return localStorage
  const profile = previewProfile()
  if (profile?.grade === 'Grade 2') {
    const owner = (window.parent as FamilyWorkspaceWindow).familyWorkspaceOwner
    if (!owner) throw new Error('Open this activity from the family page.')
    return owner.practiceStorage(profile.id)
  }
  return scopedActivityStorage(localStorage, `family-beta-activity:${previewProfile()?.id || 'unselected'}:`)
}
