import { deviceAcceptancePreview } from '../deviceAcceptance/policy.ts'

declare const __MANDARIN_ACADEMY_RELEASE__: boolean

/** Only the explicitly packaged family release enables the approved preview features. */
export const academyRelease = typeof __MANDARIN_ACADEMY_RELEASE__ !== 'undefined' && __MANDARIN_ACADEMY_RELEASE__

/** Saving/layout fixes are shared; the test-account gate remains preview-only. */
export const connectedFamilyFixes = academyRelease || deviceAcceptancePreview
