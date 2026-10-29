import type { CurriculumSnapshot } from './curriculum.ts'
import reviewed from './grade2WetlandSource.json' with { type: 'json' }

export const grade2WetlandReviewPreview =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GRADE2_WETLAND_REVIEW_PREVIEW === 'true'

/** Bounded owner-approved recovery for the shared service's truncated Oct 19
 * slide. Validate the incoming response first. Never replace usable teacher
 * content, modify another week, or deploy this override to canonical clients.
 * The general importer repair is separate and remains unpublished server-side. */
export async function recoverGrade2Wetland(snapshot: CurriculumSnapshot): Promise<CurriculumSnapshot> {
  if (
    snapshot.grade !== 'Grade 2' ||
    snapshot.sourceId !== reviewed.sourceId ||
    snapshot.payload.sourceType !== 'google-slides'
  )
    return snapshot
  const index =
    snapshot.payload.slides?.findIndex(
      (slide) =>
        slide.objectId === reviewed.slide.objectId &&
        !slide.pageElements?.length &&
        /^Week\s+10\/19\s*[-–]\s*10\/23\s*$/.test(slide.text?.trim() || ''),
    ) ?? -1
  if (index < 0) return snapshot
  const payload = {
    ...snapshot.payload,
    slides: snapshot.payload.slides!.map((slide, i) => (i === index ? { ...reviewed.slide } : slide)),
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))
  return {
    ...snapshot,
    payload,
    contentSha256: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''),
    reviewedRecovery: {
      id: 'grade2-wetland-oct26-v1',
      originalContentSha256: snapshot.contentSha256,
      sourceSlideId: reviewed.slide.objectId,
      sourceModifiedAt: reviewed.sourceModifiedAt,
      reviewedAt: reviewed.reviewedAt,
    },
  }
}

export function wetlandReviewLabel(grade: string, latestWeek: string | undefined, today: string) {
  return grade === 'Grade 2' && latestWeek === '2026-10-19' && today >= '2026-10-26' && today <= '2026-10-30'
    ? 'This week · Wetland review (10/26–10/30)'
    : 'Current teacher lesson'
}
