// Lossless UTF-8 LZW transport for an oversized writing workspace. The ordinary
// record/score schemas remain intact after decoding. Never truncate history or
// raise the 700 KB stored/sync record budget to accommodate repeated answers.
const MAX_EXPANDED_BYTES = 5_000_000
const RESET = 256
const LIMIT = 65_536
const invalid = 'Saved writing history could not be decoded safely. Nothing was erased.'

export function packWritingWorkspace(raw: string) {
  const bytes = new TextEncoder().encode(raw)
  if (bytes.length > MAX_EXPANDED_BYTES) throw new Error(invalid)
  let dictionary = new Map<string, number>()
  let next = RESET + 1
  let word = ''
  const codes = [RESET]
  const code = (value: string) => (value.length === 1 ? value.charCodeAt(0) : dictionary.get(value)!)
  for (const byte of bytes) {
    const character = String.fromCharCode(byte)
    const joined = word + character
    if (joined.length === 1 || dictionary.has(joined)) word = joined
    else {
      codes.push(code(word))
      if (next < LIMIT) dictionary.set(joined, next++)
      else {
        dictionary = new Map()
        next = RESET + 1
        codes.push(RESET)
      }
      word = character
    }
  }
  if (word) codes.push(code(word))
  const encoded = new Uint8Array(codes.length * 2)
  for (let i = 0; i < codes.length; i++) {
    encoded[i * 2] = codes[i] >>> 8
    encoded[i * 2 + 1] = codes[i] & 255
  }
  const parts: string[] = []
  for (let i = 0; i < encoded.length; i += 8192) parts.push(String.fromCharCode(...encoded.subarray(i, i + 8192)))
  return btoa(parts.join(''))
}

export function unpackWritingWorkspace(payload: unknown) {
  if (typeof payload !== 'string' || payload.length > 700_000) throw new Error(invalid)
  const encoded = atob(payload)
  if (encoded.length % 2 || encoded.length < 2) throw new Error(invalid)
  let dictionary: string[] = []
  let next = RESET + 1
  let previous = ''
  let length = 0
  const parts: string[] = []
  for (let i = 0; i < encoded.length; i += 2) {
    const code = encoded.charCodeAt(i) * 256 + encoded.charCodeAt(i + 1)
    if (code === RESET) {
      dictionary = []
      next = RESET + 1
      previous = ''
      continue
    }
    const word =
      code < RESET
        ? String.fromCharCode(code)
        : (dictionary[code] ?? (code === next && previous ? previous + previous[0] : null))
    if (word === null || word === undefined) throw new Error(invalid)
    length += word.length
    if (length > MAX_EXPANDED_BYTES) throw new Error(invalid)
    parts.push(word)
    if (previous && next < LIMIT) dictionary[next++] = previous + word[0]
    previous = word
  }
  const bytes = Uint8Array.from(parts.join(''), (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
