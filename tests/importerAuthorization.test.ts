import assert from 'node:assert/strict'
import test from 'node:test'
import { importerAuthorizationUrl, parseInstalledOAuthClient } from '../scripts/authorize-importer.ts'

test('the importer accepts only a Google desktop OAuth client payload', () => {
  const parsed = parseInstalledOAuthClient(
    JSON.stringify({
      installed: {
        client_id: 'fixture.apps.googleusercontent.com',
        client_secret: 'fixture-secret',
        redirect_uris: ['http://localhost'],
      },
    }),
  )
  assert.equal(parsed.client_id, 'fixture.apps.googleusercontent.com')
  assert.throws(() => parseInstalledOAuthClient(JSON.stringify({ web: parsed })), /desktop-client/)
  assert.throws(
    () => parseInstalledOAuthClient(JSON.stringify({ installed: { ...parsed, client_id: 'not-google' } })),
    /Google client ID/,
  )
})

test('the importer authorization request is read-only, offline, consented, and state-bound', () => {
  const url = new URL(
    importerAuthorizationUrl(
      'fixture.apps.googleusercontent.com',
      'http://127.0.0.1:4321/oauth2callback',
      'fixture-state',
    ),
  )
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/presentations.readonly')
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
  assert.equal(url.searchParams.get('state'), 'fixture-state')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4321/oauth2callback')
})
