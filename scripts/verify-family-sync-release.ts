import { createHash } from 'node:crypto'

const expected = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(expected || '')) throw new Error('Supply the released source revision.')
const origins = [
  'https://ninjadojo.meghangames.com/',
  'https://weeklydictation-k-beta.web.app/',
  'https://fionnbarzero.github.io/WeeklyDictationApp/',
  'https://weeklydictation-g5-beta.web.app/',
]
for (const origin of origins) {
  const response = await fetch(`${origin}family-beta-manifest.json?verify=${expected}`, {
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Manifest unavailable: ${origin}`)
  const manifest = await response.json()
  if (manifest.sourceRevision !== expected || manifest.firebaseProject !== 'weeklydictationapp')
    throw new Error(`Wrong live release: ${origin}`)
  // Hosting control files are not public application assets.
  const files = manifest.files.filter(
    (file: { path: string }) => !file.path.startsWith('.') && file.path !== '_headers',
  )
  let cursor = 0,
    verified = 0
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < files.length) {
        const file = files[cursor++]
        if (file.path.includes('..') || file.path.startsWith('/')) throw new Error('Invalid manifest path.')
        const result = await fetch(new URL(file.path, origin), { signal: AbortSignal.timeout(30000) })
        const bytes = new Uint8Array(await result.arrayBuffer())
        if (
          !result.ok ||
          bytes.length !== file.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== file.sha256
        )
          throw new Error(`Live file differs: ${origin}${file.path}`)
        verified++
      }
    }),
  )
  console.log(
    JSON.stringify({
      origin,
      sourceRevision: expected,
      verifiedPublicFiles: verified,
      fileTreeSha256: manifest.fileTreeSha256,
    }),
  )
}
