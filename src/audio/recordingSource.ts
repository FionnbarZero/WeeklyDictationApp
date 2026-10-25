export type RecordingSource = { readonly url: string; release: () => void }

/** Fetch complete bytes before handing audio to Safari's media player. The
 * preview host does not honor its media range probe. Each play owns its URL;
 * neither recordings nor child data are stored in a persistent cache. */
export async function prepareRecordingSource(url: string, signal: AbortSignal): Promise<RecordingSource> {
  const response = await fetch(url, { signal, credentials: 'same-origin' })
  if (!response.ok) throw new Error('The recording could not be loaded.')
  const blob = await response.blob()
  if (signal.aborted) throw new DOMException('Recording cancelled.', 'AbortError')
  if (!blob.size || blob.size > 5_000_000) throw new Error('The recording is unavailable.')
  const source = URL.createObjectURL(blob)
  let released = false
  return {
    url: source,
    release() {
      if (released) return
      released = true
      URL.revokeObjectURL(source)
    },
  }
}
