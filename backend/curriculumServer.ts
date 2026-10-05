import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fetchGooglePresentation, googleAccessToken, type GoogleOAuthConfig } from './googleSlides.ts'
import { fetchGoogleSpreadsheet } from './googleSheets.ts'
import { buildCurriculumSnapshot, publishCurriculumSnapshot } from './betaCurriculum.ts'
import { BETA_GRADES } from '../src/familyBeta/model.ts'
import { gradeSlugs, sourceIds } from '../src/familyBeta/curriculum.ts'
import { createGoogleCurriculumStorage, validateStoredSnapshot, type CurriculumStorage } from './curriculumStorage.ts'

export function createCurriculumService(options: {
  directory: string
  oauth?: GoogleOAuthConfig
  intervalMs?: number
  storage?: CurriculumStorage
}) {
  let refreshing: Promise<void> | null = null
  let lastAttempt = 0
  const statuses = new Map<string, { lastSuccess?: string; error?: string }>()
  const storage: CurriculumStorage = options.storage || {
    async read(grade) {
      try {
        const snapshot = JSON.parse(await readFile(resolve(options.directory, `${gradeSlugs[grade]}.json`), 'utf8'))
        validateStoredSnapshot(snapshot, grade)
        return snapshot
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    publish: (snapshot) =>
      publishCurriculumSnapshot(resolve(options.directory, `${gradeSlugs[snapshot.grade]}.json`), snapshot),
  }
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
          await storage.publish(snapshot)
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
    // Public, projected curriculum only. No cookies, account data, arbitrary source IDs or write endpoints.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Expose-Headers', 'X-Curriculum-Warning')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end()
      return
    }
    const grade = BETA_GRADES.find((g) => pathname === `/curriculum/beta/${gradeSlugs[g]}.json`)
    if (pathname !== '/health' && !grade) {
      res.writeHead(404)
      res.end()
      return
    }
    // Await work inside the request: Cloud Run may suspend CPU after sending a response.
    // Reuse fresh durable snapshots across cold starts instead of repeatedly contacting Google.
    if (!lastAttempt) {
      const saved = await Promise.all(BETA_GRADES.map((g) => storage.read(g).catch(() => null)))
      if (saved.every(Boolean)) {
        lastAttempt = Math.min(...saved.map((s) => Date.parse(s!.retrievedAt)))
        saved.forEach((s) => statuses.set(s!.grade, { lastSuccess: s!.retrievedAt }))
      }
    }
    if (Date.now() - lastAttempt > (options.intervalMs ?? 300_000)) await refresh()
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ automatic: Boolean(options.oauth), sources: Object.fromEntries(statuses) }))
      return
    }
    if (!grade) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const data = await storage.read(grade)
      if (!data) throw new Error('No snapshot')
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(statuses.get(grade)?.error ? { 'X-Curriculum-Warning': 'refresh-unavailable' } : {}),
      })
      res.end(JSON.stringify(data))
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
    ...(process.env.CURRICULUM_BUCKET ? { storage: createGoogleCurriculumStorage(process.env.CURRICULUM_BUCKET) } : {}),
  })
  service.server.listen(Number(process.env.PORT || 8788), process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1', () =>
    console.log('Curriculum service ready.'),
  )
}
