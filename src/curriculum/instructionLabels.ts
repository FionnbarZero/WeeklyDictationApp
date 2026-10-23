/** Known resource heading only. Unknown text must remain visible to validation. */
export function isStrokeOrderLabel(text: string) {
  return /^\s*stroke\s*order\s*[:：]?\s*$/i.test(text)
}
