/** Canonical static-host policy. No reporting endpoint: diagnostics stay in the
 * browser. Script/resource restrictions remain report-only until the exact
 * candidate AND guarded recovery pass the complete compatibility matrix. */
export function familySecurityHeaders(assetPaths: readonly string[]) {
  // Reserve exact-path rules for executable/style bundles. Public media stays
  // no-store over HTTP (the separate offline shell still caches reviewed files).
  // In particular, hashed curriculum JSON is metadata, not immutable policy.
  const immutablePaths = [...new Set(assetPaths)].filter((path) => /\.(?:js|css)$/.test(path)).sort()
  // Cloudflare permits at most 100 rules. Refuse a larger package rather than
  // caching the SPA fallback at an unknown /assets/* URL for a year.
  if (immutablePaths.length > 99) throw new Error('Canonical security policy exceeds the 100-rule provider limit.')
  // The long-lived path rule must never cover unhashed or private files.
  if (
    assetPaths.some(
      (path) =>
        !/^assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|json|woff2?|png|jpg|jpeg|svg|webp|gif|avif|ico|mp3|wav|ogg)$/.test(
          path,
        ),
    )
  )
    throw new Error('Canonical immutable assets must have reviewed content-hashed names.')
  const enforced = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'"
  const diagnostic = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.recaptcha.net",
    "frame-src 'self' https://www.google.com https://www.recaptcha.net",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join('; ')
  return `# ninja-canonical-security-v1
/*
  Cache-Control: no-store
  Content-Security-Policy: ${enforced}
  Content-Security-Policy-Report-Only: ${diagnostic}
  X-Frame-Options: SAMEORIGIN
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(self)
${immutablePaths
  .map(
    (path) => `/${path}
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`,
  )
  .join('')}`
}
