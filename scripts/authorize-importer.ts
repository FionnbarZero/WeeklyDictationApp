import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { IMPORTER_DECK_ID, IMPORTER_PRODUCTION_PROJECT_ID, importerSecrets } from './importerDeployment.ts'

type InstalledOAuthClient = {
  client_id: string
  client_secret: string
  redirect_uris?: string[]
}

export function parseInstalledOAuthClient(raw: string): InstalledOAuthClient {
  const parsed = JSON.parse(raw) as { installed?: Partial<InstalledOAuthClient> }
  const client = parsed.installed
  if (!client || typeof client.client_id !== 'string' || typeof client.client_secret !== 'string') {
    throw new Error('Expected a Google OAuth desktop-client JSON file.')
  }
  if (!client.client_id.endsWith('.apps.googleusercontent.com')) {
    throw new Error('The OAuth client ID is not a Google client ID.')
  }
  return {
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uris: client.redirect_uris,
  }
}

export function importerAuthorizationUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/presentations.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString()
  return url.toString()
}

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function requestAuthorizationCode(clientId: string) {
  const state = randomBytes(32).toString('hex')
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    const error = url.searchParams.get('error')
    const returnedState = url.searchParams.get('state')
    const authorizationCode = url.searchParams.get('code')
    if (error || returnedState !== state || !authorizationCode) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Authorization failed. You may close this tab.')
      rejectCode(new Error(error ? `Google authorization failed: ${error}` : 'OAuth callback validation failed.'))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Weekly Dictation importer authorization succeeded. You may close this tab.')
    resolveCode(authorizationCode)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const authorizationUrl = importerAuthorizationUrl(clientId, redirectUri, state)
  const opened = spawnSync('open', [authorizationUrl], { stdio: 'ignore' })
  if (opened.error || opened.status !== 0) {
    server.close()
    throw new Error(`Open this Google authorization URL in a browser: ${authorizationUrl}`)
  }
  console.log('Google authorization opened in the browser. Complete the read-only Slides consent there.')

  const timeout = setTimeout(() => rejectCode(new Error('Google authorization timed out.')), 5 * 60_000)
  try {
    return { code: await code, redirectUri }
  } finally {
    clearTimeout(timeout)
    server.close()
  }
}

async function exchangeAuthorizationCode(client: InstalledOAuthClient, code: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    error_description?: string
  }
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(body.error_description || `Google token exchange failed with HTTP ${response.status}.`)
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token }
}

async function verifyDeckAccess(accessToken: string) {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(IMPORTER_DECK_ID)}?fields=presentationId`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    },
  )
  const body = (await response.json().catch(() => ({}))) as {
    presentationId?: string
    error?: { message?: string }
  }
  if (!response.ok || body.presentationId !== IMPORTER_DECK_ID) {
    throw new Error(
      body.error?.message || `The authorized account cannot read the importer deck (HTTP ${response.status}).`,
    )
  }
}

function storeSecret(gcloud: string, secret: string, value: string) {
  const common = ['--project', IMPORTER_PRODUCTION_PROJECT_ID]
  const described = spawnSync(gcloud, ['secrets', 'describe', secret, ...common], {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const args =
    described.status === 0
      ? ['secrets', 'versions', 'add', secret, ...common, '--data-file=-']
      : ['secrets', 'create', secret, ...common, '--replication-policy=automatic', '--data-file=-']
  const stored = spawnSync(gcloud, args, { input: value, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] })
  if (stored.error) throw stored.error
  if (stored.status !== 0) throw new Error(`Failed to store Secret Manager value for ${secret}.`)
}

async function main() {
  const clientFile = flag('--client-file')
  const gcloud = flag('--gcloud') || 'gcloud'
  if (!clientFile) throw new Error('Pass the downloaded desktop OAuth JSON with --client-file <path>.')
  const client = parseInstalledOAuthClient(readFileSync(clientFile, 'utf8'))
  const { code, redirectUri } = await requestAuthorizationCode(client.client_id)
  const tokens = await exchangeAuthorizationCode(client, code, redirectUri)
  await verifyDeckAccess(tokens.accessToken)
  storeSecret(gcloud, importerSecrets.GOOGLE_OAUTH_CLIENT_ID, client.client_id)
  storeSecret(gcloud, importerSecrets.GOOGLE_OAUTH_CLIENT_SECRET, client.client_secret)
  storeSecret(gcloud, importerSecrets.GOOGLE_OAUTH_REFRESH_TOKEN, tokens.refreshToken)
  if (process.argv.includes('--delete-client-file')) rmSync(clientFile, { force: true })
  console.log('Slides read access verified and all importer credentials stored in Secret Manager.')
}

if (process.argv[1]?.endsWith('/authorize-importer.ts')) await main()
