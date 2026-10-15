import assert from 'node:assert/strict'

const documentRoot = 'projects/weeklydictationapp/databases/(default)/documents'

/** Construct only from this run's verified signup response, never an existing account. */
export function syntheticWritingScope(uid: string, email: string, expectedEmail: string) {
  assert.match(uid, /^[A-Za-z0-9_-]{20,128}$/)
  assert.match(expectedEmail, /^ninja-writing-[a-f0-9-]{36}@example\.invalid$/)
  assert.equal(email, expectedEmail)
  const family = `${documentRoot}/families/family-${uid}`
  const user = `${documentRoot}/users/${uid}`
  const validate = (name: string) => {
    assert.ok(name === user || name === family || name.startsWith(`${family}/`), 'Unrelated document refused')
    assert.ok(
      name.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
      'Invalid document path',
    )
    return name
  }
  const url = (name: string) =>
    `https://firestore.googleapis.com/v1/${validate(name).split('/').map(encodeURIComponent).join('/')}`
  return { uid, family, user, validate, url }
}

/** Enumerate and delete only the newly created synthetic family's subtree. */
export async function cleanSyntheticWritingFamily(
  scope: ReturnType<typeof syntheticWritingScope>,
  request: typeof fetch,
) {
  let deletedDocuments = 0
  async function json(url: string, options?: RequestInit) {
    const response = await request(url, options)
    assert.ok(response.ok, `Synthetic cleanup read failed (${response.status})`)
    const value = await response.json()
    assert.ok(!value.nextPageToken, 'Unexpected synthetic cleanup size')
    return value
  }
  async function remove(name: string, depth = 0) {
    assert.ok(depth <= 8 && deletedDocuments < 200, 'Synthetic cleanup bound exceeded')
    const url = scope.url(name)
    const listed = await json(`${url}:listCollectionIds`, {
      method: 'POST',
      body: JSON.stringify({ pageSize: 100 }),
    })
    for (const collection of listed.collectionIds || []) {
      assert.match(collection, /^[A-Za-z][A-Za-z0-9_-]*$/)
      const children = await json(`${url}/${encodeURIComponent(collection)}?pageSize=100`)
      for (const child of children.documents || []) {
        scope.validate(child.name)
        assert.ok(child.name.startsWith(`${name}/${collection}/`), 'Unexpected cleanup child')
        await remove(child.name, depth + 1)
      }
    }
    const response = await request(url, { method: 'DELETE' })
    assert.ok(response.ok || response.status === 404, `Synthetic cleanup delete failed (${response.status})`)
    if (response.ok) deletedDocuments++
  }
  await remove(scope.family)
  await remove(scope.user)
  for (const name of [scope.family, scope.user]) {
    assert.equal((await request(scope.url(name))).status, 404, 'Synthetic root remains after cleanup')
  }
  return deletedDocuments
}
