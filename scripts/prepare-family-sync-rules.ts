// Read-only against production. Preserve its existing policy verbatim and add
// only the two family-beta collections. The generated file must pass the emulator.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const require = createRequire(import.meta.url)
const auth = require('firebase-tools/lib/auth.js')
const account = auth.getGlobalDefaultAccount()
const token = await auth.getAccessToken(account.tokens.refresh_token, [
  'https://www.googleapis.com/auth/cloud-platform',
])
const headers = { Authorization: `Bearer ${token.access_token}` }
const expected = 'projects/weeklydictationapp/rulesets/5e26d078-a646-4def-9820-da43a02b74b8'
const response = await fetch(
  'https://firebaserules.googleapis.com/v1/projects/weeklydictationapp/releases/cloud.firestore',
  { headers },
)
if (!response.ok) throw new Error('Cannot read the active production rules release.')
const release = await response.json()
if (release.rulesetName !== expected)
  throw new Error('Production rules changed. Review the new baseline before continuing.')
const sourceResponse = await fetch(`https://firebaserules.googleapis.com/v1/${expected}`, { headers })
if (!sourceResponse.ok) throw new Error('Cannot read the baseline rules.')
const source = await sourceResponse.json()
const baseline = source.source.files.find((f: { name: string }) => f.name === 'firestore.rules')?.content
if (
  typeof baseline !== 'string' ||
  createHash('sha256').update(baseline).digest('hex') !==
    '8f5d9b2716d9530bc7ecad9bfc1251756a6f89243211ced9a934ea6f1d140d40'
)
  throw new Error('Unexpected production baseline.')
const tracked = readFileSync(resolve('firestore.rules'), 'utf8')
const start = tracked.indexOf('        // Candidate family beta result contract.')
const end = tracked.indexOf('        match /scores/{scoreId}', start)
if (start < 0 || end < 0 || baseline.includes('match /betaPractice/') || baseline.includes('match /betaResults/'))
  throw new Error('Rules insertion boundaries changed.')
const additions = tracked.slice(start, end)
const anchor = '        match /scores/{scoreId}'
if (baseline.split(anchor).length !== 2) throw new Error('Ambiguous child collection location.')
const proposed = baseline.replace(anchor, () => additions + anchor)
if (proposed.replace(additions, '') !== baseline) throw new Error('Unrelated rules were changed.')
const directory = mkdtempSync(join(tmpdir(), 'family-sync-rules-'))
const path = join(directory, 'firestore.rules')
writeFileSync(path, proposed)
writeFileSync(join(directory, 'baseline.rules'), baseline)
writeFileSync(join(directory, 'firebase.json'), JSON.stringify({ firestore: { rules: path } }, null, 2))
console.log(
  JSON.stringify(
    {
      directory,
      path,
      previousRuleset: expected,
      preservedBaseline: true,
      sha256: createHash('sha256').update(proposed).digest('hex'),
    },
    null,
    2,
  ),
)
