// Read-only preflight. Existing secret values stay in memory and are never logged
// or written to a file. No IAM, OAuth scopes, documents, or deployments change.
import { execFileSync } from 'node:child_process'
import { fetchGooglePresentation, googleAccessToken } from '../backend/googleSlides.ts'
import { fetchGoogleSpreadsheet } from '../backend/googleSheets.ts'
import { buildCurriculumSnapshot, projectCurriculum } from '../backend/betaCurriculum.ts'
import { extractGrade5Presentation } from '../src/curriculum/adapters/grade5GoogleSlides.ts'
import { BETA_GRADES } from '../src/familyBeta/model.ts'
import { inspectSnapshot, sourceIds } from '../src/familyBeta/curriculum.ts'

const cliIndex = process.argv.indexOf('--gcloud')
const gcloud = cliIndex >= 0 ? process.argv[cliIndex + 1] : 'gcloud'
if (!gcloud) throw new Error('Provide the Google Cloud CLI path after --gcloud.')

function secret(name: string) {
  return execFileSync(gcloud, [
    'secrets', 'versions', 'access', 'latest',
    `--secret=weekly-dictation-google-oauth-${name}`,
    '--project=weeklydictationapp',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

async function check() {
  let token: string
  try {
    token = await googleAccessToken({
      clientId: secret('client-id'),
      clientSecret: secret('client-secret'),
      refreshToken: secret('refresh-token'),
    })
  } catch {
    console.error('Existing server-side Google authorization could not be used. No credentials were displayed or changed.')
    process.exitCode = 1
    return
  }
  for (const grade of BETA_GRADES) {
    let readSucceeded = false
    try {
      const payload = grade === 'Kindergarten'
        ? await fetchGoogleSpreadsheet(sourceIds[grade], token)
        : { ...(await fetchGooglePresentation(sourceIds[grade], token)), sourceType: 'google-slides' as const }
      readSucceeded = true
      if (grade === 'Grade 5' && payload.sourceType === 'google-slides') {
        const raw = extractGrade5Presentation(payload)
        const projected = projectCurriculum(grade, payload)
        if (projected.sourceType === 'google-slides') {
          const result = extractGrade5Presentation(projected)
          console.log(JSON.stringify({ grade, rawValidWeeks: raw.classification.selectedCandidates.filter(c => c.status === 'valid').length,
            projectedValidWeeks: result.classification.selectedCandidates.filter(c => c.status === 'valid').length,
            issueCodes: [...new Set(result.issues.map(i => i.code))] }))
        }
      }
      const snapshot = buildCurriculumSnapshot(grade, payload, '')
      const parsed = inspectSnapshot(snapshot)
      console.log(JSON.stringify({ grade, authorized: true, validWeeks: parsed.datasets.length, contentSha256: snapshot.contentSha256 }))
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      const reason = /insufficient.*scope/i.test(detail)
        ? 'The existing Google connection lacks the required read-only scope.'
        : /permission|forbidden|denied/i.test(detail)
          ? 'Google denied access to this source.'
          : 'Source access or curriculum validation failed.'
      console.log(JSON.stringify({ grade, authorized: readSucceeded, reason,
        ...(readSucceeded ? { validationError: detail.slice(0, 300) } : {}),
      }))
      process.exitCode = 1
    }
  }
}

await check()
