import { verifyCanonicalLive } from './canonicalFamilyRelease.ts'

const [directory, sourceRevision, fileTreeSha256] = process.argv.slice(2)
if (!directory || !sourceRevision || !fileTreeSha256 || process.argv.length !== 5)
  throw new Error(
    'Supply exact retained artifact directory, full source revision and tree SHA-256. Verification is canonical-only and read-only.',
  )
console.log(JSON.stringify(await verifyCanonicalLive({ directory, sourceRevision, fileTreeSha256 }), null, 2))
