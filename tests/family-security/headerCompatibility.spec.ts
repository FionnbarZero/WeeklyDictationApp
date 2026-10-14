import { expect, test } from '@playwright/test'
import { grades, installFamilyFixtures } from '../family-sync/fixtures.ts'

for (const [slug, grade, id] of grades) {
  test(`${grade}: provider headers preserve synthetic sign-in, renewal and temporary blob media`, async ({
    page,
    request,
  }) => {
    expect(process.env.FAMILY_SECURITY_REVISION).toMatch(/^[a-f0-9]{40}$/)
    expect((await request.post('/__rehearsal__/version?version=candidate')).ok()).toBe(true)
    await installFamilyFixtures(page)
    const violations: string[] = []
    await page.exposeFunction('recordEnforcedPolicyViolation', (directive: string) => {
      violations.push(directive)
    })
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        if (event.disposition === 'enforce')
          void (
            window as unknown as { recordEnforcedPolicyViolation: (directive: string) => Promise<void> }
          ).recordEnforcedPolicyViolation(event.effectiveDirective)
      })
    })
    let signIns = 0
    let renewals = 0
    await page.route('https://identitytoolkit.googleapis.com/**', (route) => {
      expect(new URL(route.request().url()).pathname).toBe('/v1/accounts:signInWithPassword')
      expect(route.request().postDataJSON().email).toBe('synthetic@example.invalid')
      signIns++
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          localId: 'synthetic-parent',
          email: 'synthetic@example.invalid',
          idToken: 'synthetic-header-token',
          refreshToken: 'synthetic-header-refresh',
          expiresIn: '3600',
        }),
      })
    })
    await page.route('https://securetoken.googleapis.com/**', (route) => {
      renewals++
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id_token: 'synthetic-header-renewed',
          refresh_token: 'synthetic-header-refresh',
          expires_in: '3600',
        }),
      })
    })
    const response = await page.goto(`/family-beta-preview.html?grade=${slug}`)
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'self'")
    expect(response?.headers()['x-frame-options']).toBe('SAMEORIGIN')
    expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups')
    expect(response?.headers()['cache-control']).toBe('no-store')
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    await expect(page.getByText(`Beta build ${process.env.FAMILY_SECURITY_REVISION!.slice(0, 7)}`)).toBeVisible()
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Parent controls', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out parent', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid')
    await page.getByLabel('Password', { exact: true }).fill('synthetic-only-not-a-real-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByLabel('Child profile')).toHaveValue(id)
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    expect(signIns).toBe(1)
    await page.evaluate(() => {
      const key = 'weekly-dictation-auth-v1'
      const auth = JSON.parse(localStorage.getItem(key)!)
      localStorage.setItem(key, JSON.stringify({ ...auth, expiresAt: 0 }))
      dispatchEvent(new Event('online'))
    })
    await expect.poll(() => renewals).toBeGreaterThan(0)
    await expect(page.getByText(/Scores, saved practice, and game detail confirmed/)).toBeVisible()
    await page.getByRole('button', { name: 'Activities', exact: true }).click()
    const frame = page.frameLocator('iframe:visible')
    await expect(frame.locator('body')).toBeVisible()
    // A valid in-memory silent WAV verifies decode/play and blob policy, not
    // physical microphone/speaker quality. It is revoked, never stored.
    await frame.locator('body').evaluate(async () => {
      const bytes = new ArrayBuffer(1644)
      const view = new DataView(bytes)
      const text = (offset: number, value: string) =>
        [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
      text(0, 'RIFF')
      view.setUint32(4, 1636, true)
      text(8, 'WAVE')
      text(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, 8000, true)
      view.setUint32(28, 16000, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      text(36, 'data')
      view.setUint32(40, 1600, true)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
      const audio = new Audio(url)
      audio.muted = true
      try {
        await audio.play()
        if (audio.readyState < 2) throw new Error('Temporary media did not decode')
      } finally {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        URL.revokeObjectURL(url)
      }
    })
    expect(await page.evaluate(() => Object.values(localStorage).join('\n'))).not.toMatch(/blob:|data:audio/)
    expect(violations).toEqual([])
  })
}
