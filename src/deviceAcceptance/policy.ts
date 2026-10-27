declare const __DEVICE_ACCEPTANCE_PREVIEW__: boolean

/** Compile-time isolated prototype; ordinary releases keep their existing access. */
export const deviceAcceptancePreview =
  typeof __DEVICE_ACCEPTANCE_PREVIEW__ !== 'undefined' && __DEVICE_ACCEPTANCE_PREVIEW__

export function isDeviceTestAccount(email: string) {
  return /^ninja-(?:device|writing)-[a-z0-9-]{3,64}@example\.invalid$/.test(email)
}
