/** Known resource heading only. Unknown text must remain visible to validation. */
export function isStrokeOrderLabel(text: string) {
  return /^\s*stroke\s*order\s*[:：]?\s*$/i.test(text)
}

/** Comparison only: retain every other word verbatim, including a lone STROKE.
 * The older Slides parser could store the two lines of this heading separately.
 * The caller must also verify that removing it exactly matches the same-week source.
 */
export function withoutStrokeOrderLabels(words: readonly string[]) {
  const retained: string[] = []
  for (let i = 0; i < words.length; i += 1) {
    if (isStrokeOrderLabel(words[i])) continue
    if (/^\s*stroke\s*$/i.test(words[i]) && /^\s*order\s*[:：]?\s*$/i.test(words[i + 1] ?? '')) {
      i += 1
      continue
    }
    retained.push(words[i])
  }
  return retained
}
