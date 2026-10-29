declare const __DEVICE_ACCEPTANCE_PREVIEW__: boolean

/** Compile-time isolated prototype; ordinary releases keep their existing access. */
export const deviceAcceptancePreview =
  typeof __DEVICE_ACCEPTANCE_PREVIEW__ !== 'undefined' && __DEVICE_ACCEPTANCE_PREVIEW__

export function isDeviceTestAccount(email: string) {
  return /^ninja-(?:device|writing)-[a-z0-9-]{3,64}@example\.invalid$/.test(email)
}

/** Prototype scoping only, not JWT verification. Firebase still authorizes every
 * request. A changed browser display email must not admit a real parent's token. */
export function isDeviceTestIdentity(token: string, user: { uid: string; email: string }) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return (
      claims.sub === user.uid &&
      claims.email === user.email &&
      claims.aud === 'weeklydictationapp' &&
      claims.iss === 'https://securetoken.google.com/weeklydictationapp' &&
      isDeviceTestAccount(claims.email)
    )
  } catch {
    return false
  }
}
