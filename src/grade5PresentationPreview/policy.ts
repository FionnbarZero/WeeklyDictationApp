/** Only the isolated Grade 5 presentation build accepts the approved PDF source. */
export const grade5PresentationPreview =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GRADE5_PRESENTATION_PREVIEW === 'true'
