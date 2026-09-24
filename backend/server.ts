import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { runImportJob, type ImportJobConfig } from './importJob.ts'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required backend configuration: ${name}`)
  return value
}

function configFromEnvironment(): ImportJobConfig {
  return {
    deckId: required('GOOGLE_SLIDES_PRESENTATION_ID'),
    projectId: process.env.FIREBASE_PROJECT_ID || required('GOOGLE_CLOUD_PROJECT'),
    googleOAuth: { clientId: required('GOOGLE_OAUTH_CLIENT_ID'), clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'), refreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN') },
    writeEnabled: process.env.IMPORT_WRITE_ENABLED === 'true',
  }
}

export function authorized(request: RequestLike) {
  const configured = process.env.IMPORT_RUN_TOKEN
  return Boolean(configured) && request.headers.authorization === `Bearer ${configured}`
}

type RequestLike = Pick<IncomingMessage, 'method' | 'url' | 'headers'>

export function createImporterServer() {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'GET' && request.url === '/healthz') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ok: true })); return }
    if (request.method !== 'POST' || request.url !== '/run') { response.writeHead(404); response.end('Not found'); return }
    if (!authorized(request)) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Unauthorized' })); return }
    try {
      const result = await runImportJob(configFromEnvironment())
      response.writeHead(result.batch.status === 'ok' ? 200 : 422, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ...result, summary: result.batch.summary, message: result.batch.message }))
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Importer failed.' }))
    }
  })
}

if (process.argv[1]?.endsWith('/backend/server.ts')) {
  const port = Number(process.env.PORT || 8080)
  createImporterServer().listen(port, '0.0.0.0', () => console.log(`Weekly Dictation importer listening on ${port}`))
}
