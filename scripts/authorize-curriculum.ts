// Extend the existing server connection only after explicit parent approval.
// Credentials stay in memory; only a verified refresh token receives a new
// Secret Manager version. Existing versions and IAM permissions are retained.
import { execFileSync, spawnSync } from 'node:child_process'
import { requestAuthorizationCode, exchangeAuthorizationCode } from './authorize-importer.ts'
import { IMPORTER_PRODUCTION_PROJECT_ID, importerSecrets } from './importerDeployment.ts'
import { fetchGooglePresentation, googleAccessToken } from '../backend/googleSlides.ts'
import { fetchGoogleSpreadsheet } from '../backend/googleSheets.ts'
import { buildCurriculumSnapshot } from '../backend/betaCurriculum.ts'
import { BETA_GRADES } from '../src/familyBeta/model.ts'
import { sourceIds, inspectSnapshot } from '../src/familyBeta/curriculum.ts'

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (flag('--confirm-project') !== IMPORTER_PRODUCTION_PROJECT_ID) {
  throw new Error(`Repeat --confirm-project ${IMPORTER_PRODUCTION_PROJECT_ID} to extend the existing read-only Google connection.`)
}
const gcloud = flag('--gcloud') || 'gcloud'
function readSecret(name: string) {
  return execFileSync(gcloud, ['secrets', 'versions', 'access', 'latest', '--secret', name,
    '--project', IMPORTER_PRODUCTION_PROJECT_ID], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

let stage = 'reading the existing server client'
async function main() {
  const client = {
    client_id: readSecret(importerSecrets.GOOGLE_OAUTH_CLIENT_ID),
    client_secret: readSecret(importerSecrets.GOOGLE_OAUTH_CLIENT_SECRET),
  }
  stage = 'waiting for browser consent'
  const { code, redirectUri } = await requestAuthorizationCode(client.client_id, 'curriculum')
  stage = 'exchanging the consent response'
  const granted = await exchangeAuthorizationCode(client, code, redirectUri)
  // Verify the durable refresh grant, not just the short-lived consent response.
  stage = 'checking the new refresh grant'
  const token = await googleAccessToken({ clientId: client.client_id, clientSecret: client.client_secret, refreshToken: granted.refreshToken })
  for (const grade of BETA_GRADES) {
    stage = `reading and validating ${grade}`
    const payload = grade === 'Kindergarten'
      ? await fetchGoogleSpreadsheet(sourceIds[grade], token)
      : { ...(await fetchGooglePresentation(sourceIds[grade], token)), sourceType: 'google-slides' as const }
    const validated = inspectSnapshot(buildCurriculumSnapshot(grade, payload, ''))
    console.log(`${grade}: read-only source access verified (${validated.datasets.length} valid weeks).`)
  }
  stage = 'saving the verified server connection'
  const stored = spawnSync(gcloud, ['secrets', 'versions', 'add', importerSecrets.GOOGLE_OAUTH_REFRESH_TOKEN,
    '--project', IMPORTER_PRODUCTION_PROJECT_ID, '--data-file=-'],
  { input: granted.refreshToken, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  if (stored.error || stored.status !== 0) throw new Error('The verified connection could not be saved. Previous secret versions remain unchanged.')
  console.log('Verified read-only Slides and Sheets connection saved as a new secret version. Previous versions retained. No app deployment, child-data change, or IAM change performed.')
}

try { await main() }
catch (error) {
  // Never echo token-exchange errors, subprocess buffers, or credentials.
  const detail = error instanceof Error ? error.message : ''
  const reason = /insufficient.*scope/i.test(detail) ? 'A required read-only permission was not granted.'
    : /not been used|disabled|not enabled/i.test(detail) ? 'The required Google API is not enabled.'
    : /access_denied/i.test(detail) ? 'Consent was declined.'
    : /timed out/i.test(detail) ? 'Browser consent timed out.'
    : /no valid lessons/i.test(detail) ? 'Curriculum validation found no usable lessons.'
    : 'Google authorization, source validation, or credential storage did not succeed.'
  console.error(`Curriculum authorization stopped while ${stage}. ${reason} Existing secret versions were not deleted.`)
  process.exitCode = 1
}
