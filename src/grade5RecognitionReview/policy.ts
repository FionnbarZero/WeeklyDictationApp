declare const __GRADE5_READING_REVIEW_PREVIEW__: boolean

/** A compile-time opt-in keeps this isolated review outside ordinary releases. */
export const grade5ReadingReviewPreview =
  typeof __GRADE5_READING_REVIEW_PREVIEW__ !== 'undefined' && __GRADE5_READING_REVIEW_PREVIEW__
