import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { artifactFileRecords, fileTreeSha256 } from './familyBetaRelease.ts'

/** Only the canonical family package installs an offline shell. No API, auth,
 * curriculum, child data, or arbitrary navigation response enters this cache. */
export function packageOfflineShell(directory: string, revision: string) {
  const entries = [
    'index.html',
    'family-beta-preview.html',
    'kindergarten-learning-lab.html',
    'grade5-learning-hub.html',
    'family-game.html',
  ]
  writeFileSync(
    join(directory, 'offline-registration.js'),
    `
if ('serviceWorker' in navigator && window.parent === window) {
  const status = message => {
    document.documentElement.dataset.offlineShell = message;
    window.dispatchEvent(new Event('family-offline-shell'));
  };
  status('Preparing this browser for offline reopening…');
  navigator.serviceWorker.register('./family-offline-sw.js', { updateViaCache: 'none' }).then(registration => {
    const check = () => {
      if (registration.waiting) status('An app update is ready. Close all Ninja Dojo tabs, then reopen to use it. Saved lessons are preserved.');
      else if (registration.active) status('Offline app ready. Previously synced children can reopen saved lessons here; some voices still require internet.');
    };
    const watch = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        check();
        if (worker.state === 'redundant' && !registration.active)
          status('Offline preparation failed. Keep internet access and reopen to retry.');
      });
    };
    registration.addEventListener('updatefound', watch);
    watch(); check();
    navigator.serviceWorker.ready.then(check);
  }).catch(() => status('Offline reopening is unavailable in this browser. Keep internet access while practicing.'));
}
`,
  )
  for (const entry of entries) {
    const file = join(directory, entry)
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replaceAll('<script defer src="./offline-registration.js"></script>', '')
        .replace('</head>', '<script defer src="./offline-registration.js"></script></head>'),
    )
  }
  const files = artifactFileRecords(directory).filter(
    (file) =>
      entries.includes(file.path) ||
      file.path === 'offline-registration.js' ||
      file.path.startsWith('assets/') ||
      file.path.startsWith('audio/'),
  )
  writeFileSync(
    join(directory, 'family-offline-sw.js'),
    `
const revision = ${JSON.stringify(revision)};
const files = ${JSON.stringify(files)};
const scope = new URL(self.registration.scope);
const cachePrefix = 'ninja-dojo-shell-v1:' + encodeURIComponent(scope.pathname) + ':';
const cacheName = cachePrefix + revision + ':' + ${JSON.stringify(fileTreeSha256(files))};
const routes = new Map(files.map(file => [new URL(file.path, scope).pathname, file]));
const hex = buffer => [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  try {
    // Sequential requests keep installation bounded on tablets. Hash checks
    // reject a partial deployment or an unexpected clean-URL fallback page.
    for (const file of files) {
      const url = new URL(file.path, scope);
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok || new URL(response.url).origin !== scope.origin) throw new Error('Offline asset unavailable');
      const body = await response.arrayBuffer();
      if (hex(await crypto.subtle.digest('SHA-256', body)) !== file.sha256) throw new Error('Offline asset checksum mismatch');
      // fetch already decoded any transport compression. The cached body must
      // not retain headers describing the compressed wire representation.
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding'); headers.delete('Content-Length');
      await cache.put(url, new Response(body, { status: 200, headers }));
    }
  } catch (error) { await caches.delete(cacheName); throw error; }
})()));
// No skipWaiting or clients.claim: an update cannot replace an active lesson's
// engine, and the first install cannot take over an older uncontrolled page.
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key);
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  let path = url.pathname;
  if (request.mode === 'navigate') {
    if (path === scope.pathname) path += 'index.html';
    else if (!path.split('/').pop().includes('.')) path += '.html';
  }
  const file = routes.get(path);
  if (!file) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(cacheName)).match(new URL(file.path, scope));
    // Never substitute another build when this version's cache is unavailable.
    return cached || new Response('Offline app files are missing. Reconnect and close all Ninja Dojo tabs before reopening.', { status: 503 });
  })());
});
`,
  )
}
