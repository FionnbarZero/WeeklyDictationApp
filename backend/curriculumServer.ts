import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fetchGooglePresentation, googleAccessToken, type GoogleOAuthConfig } from './googleSlides.ts'
import { fetchGoogleSpreadsheet } from './googleSheets.ts'
import { buildCurriculumSnapshot, publishCurriculumSnapshot } from './betaCurriculum.ts'
import { BETA_GRADES } from '../src/familyBeta/model.ts'
import { gradeSlugs, sourceIds } from '../src/familyBeta/curriculum.ts'

export function createCurriculumService(options: {
  directory: string
  oauth?: GoogleOAuthConfig
  intervalMs?: number
}) {
  let refreshing: Promise<void> | null = null
  let lastAttempt = 0
  const statuses = new Map<string, { lastSuccess?: string; error?: string }>()
  const refresh = () => {
    if (refreshing) return refreshing
    lastAttempt = Date.now()
    refreshing = (async () => {
      if (!options.oauth) {
        for (const grade of BETA_GRADES)
          statuses.set(grade, {
            error: 'Automatic Google access is not configured; serving the last validated snapshot.',
          })
        return
      }
      const token = await googleAccessToken(options.oauth)
      for (const grade of BETA_GRADES) {
        try {
          const payload =
            grade === 'Kindergarten'
              ? await fetchGoogleSpreadsheet(sourceIds[grade], token)
              : { ...(await fetchGooglePresentation(sourceIds[grade], token)), sourceType: 'google-slides' as const }
          // Modified time is optional in this read-only API; never invent a teacher-edit timestamp.
          const snapshot = buildCurriculumSnapshot(grade, payload, '')
          await publishCurriculumSnapshot(resolve(options.directory, `${gradeSlugs[grade]}.json`), snapshot)
          statuses.set(grade, { lastSuccess: snapshot.retrievedAt })
        } catch {
          statuses.set(grade, {
            ...statuses.get(grade),
            error: 'Google refresh or curriculum validation failed; the last valid snapshot is retained.',
          })
        }
      }
    })()
      .catch(() => {
        for (const grade of BETA_GRADES)
          statuses.set(grade, {
            ...statuses.get(grade),
            error: 'Google authorization failed; the last valid snapshot is retained.',
          })
      })
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end()
      return
    }
    if (Date.now() - lastAttempt > (options.intervalMs ?? 300_000)) void refresh()
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ automatic: Boolean(options.oauth), sources: Object.fromEntries(statuses) }))
      return
    }
    const grade = BETA_GRADES.find((g) => pathname === `/curriculum/beta/${gradeSlugs[g]}.json`)
    if (!grade) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const data = await readFile(resolve(options.directory, `${gradeSlugs[grade]}.json`))
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(statuses.get(grade)?.error ? { 'X-Curriculum-Warning': 'refresh-unavailable' } : {}),
      })
      res.end(data)
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No validated curriculum is available yet.' }))
    }
  })
  return { server, refresh, statuses }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const oauth =
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
      ? {
          clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
          clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        }
      : undefined
  const service = createCurriculumService({
    directory: resolve(process.env.CURRICULUM_DIRECTORY || 'public/curriculum/beta'),
    oauth,
  })
  service.server.listen(Number(process.env.PORT || 8788), '127.0.0.1', () => console.log('Curriculum service ready.'))
  void service.refresh()
}
