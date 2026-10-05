import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { runImportJob, type ImportJobConfig } from './importJob.ts'
import type { ImportBatchOutcome } from '../src/slidesImporter.ts'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required backend configuration: ${name}`)
  return value
}

function configFromEnvironment(): ImportJobConfig {
  return {
    deckId: required('GOOGLE_SLIDES_PRESENTATION_ID'),
    projectId: process.env.FIREBASE_PROJECT_ID || required('GOOGLE_CLOUD_PROJECT'),
    googleOAuth: {
      clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
      clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
      refreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN'),
    },
    writeEnabled: process.env.IMPORT_WRITE_ENABLED === 'true',
  }
}

export function authorized(request: RequestLike) {
  const configured = process.env.IMPORT_RUN_TOKEN
  const supplied = request.headers.authorization
  if (configured && supplied) {
    const expected = Buffer.from(`Bearer ${configured}`)
    const actual = Buffer.from(supplied)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
  return process.env.IMPORT_AUTH_MODE === 'cloud-run-iam' && Boolean(process.env.K_SERVICE)
}

type RequestLike = Pick<IncomingMessage, 'method' | 'url' | 'headers'>

export function importHttpStatus(batch: Pick<ImportBatchOutcome, 'status'>) {
  return batch.status === 'ok' ? 200 : 422
}

export function createImporterServer() {
  let importInFlight = false
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
      return
    }
    if (request.method !== 'POST' || request.url !== '/run') {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    if (!authorized(request)) {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    const requestId =
      typeof request.headers['x-request-id'] === 'string' &&
      /^[A-Za-z0-9._-]{1,80}$/.test(request.headers['x-request-id'])
        ? request.headers['x-request-id']
        : randomUUID()
    if (importInFlight) {
      response.writeHead(409, { 'Content-Type': 'application/json', 'X-Request-Id': requestId })
      response.end(JSON.stringify({ error: 'An import is already running.', requestId }))
      return
    }
    importInFlight = true
    try {
      const result = await runImportJob(configFromEnvironment())
      response.writeHead(importHttpStatus(result.batch), {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      })
      response.end(
        JSON.stringify({ ...result, summary: result.batch.summary, message: result.batch.message, requestId }),
      )
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json', 'X-Request-Id': requestId })
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Importer failed.', requestId }))
    } finally {
      importInFlight = false
    }
  })
}

if (process.argv[1]?.endsWith('/backend/server.ts')) {
  const port = Number(process.env.PORT || 8080)
  createImporterServer().listen(port, '0.0.0.0', () => console.log(`Weekly Dictation importer listening on ${port}`))
}
