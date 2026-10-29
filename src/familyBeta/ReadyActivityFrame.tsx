import { type IframeHTMLAttributes, useEffect, useRef, useState } from 'react'

type Props = IframeHTMLAttributes<HTMLIFrameElement> & {
  'data-family-active': string
  'data-family-paused': string
}

function nextPaint(view: Window, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      view.cancelAnimationFrame(frame)
      reject(signal.reason)
    }
    const frame = view.requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    })
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  })
}

function stylesheetReady(link: HTMLLinkElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      link.removeEventListener('load', loaded)
      link.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
      if (error) reject(error)
      else resolve()
    }
    const loaded = () => {
      try {
        if (!link.sheet) throw new Error('An activity stylesheet did not load.')
        // Failed same-origin requests can leave an inaccessible sheet object.
        void link.sheet.cssRules
        finish()
      } catch (error) {
        finish(error)
      }
    }
    const failed = () => finish(new Error('An activity stylesheet did not load.'))
    const aborted = () => finish(signal.reason)
    // Listen before checking: a lazy stylesheet may still be downloading after
    // the document's load event, and must not be mistaken for a failed request.
    link.addEventListener('load', loaded, { once: true })
    link.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
    else if (link.sheet) loaded()
  })
}

/** A loaded module can render before WebKit applies the frame's linked CSS.
 * Keep that document mounted and paused until its presentation has settled;
 * otherwise a card can move between pointer down and pointer up. */
export function ReadyActivityFrame(props: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(0)
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const active = props['data-family-active'] === 'true'
  const ready = status === 'ready'

  useEffect(() => {
    const view = frame.current?.contentWindow
    if (!loaded || !view) return
    const leaving = (event: PageTransitionEvent) => {
      // A back/forward-cache restore resumes this exact styled document without
      // firing iframe load. Keep its readiness and checkpoint intact.
      if (event.persisted) return
      setStatus('loading')
      setLoaded(0)
    }
    view.addEventListener('pagehide', leaving)
    return () => view.removeEventListener('pagehide', leaving)
  }, [loaded])

  useEffect(() => {
    if (!active || status === 'ready') return
    const controller = new AbortController()
    let disposed = false
    const timeout = window.setTimeout(() => {
      controller.abort(new Error('Activity screen loading timed out.'))
      if (!disposed) setStatus('error')
    }, 30_000)
    if (loaded) {
      const settle = async () => {
        const document = frame.current?.contentDocument
        const view = frame.current?.contentWindow
        if (!document || !view || document.readyState !== 'complete') throw new Error('Activity document unavailable.')
        while (!controller.signal.aborted) {
          const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
          const urls = styles.map((link) => link.href)
          await Promise.all(styles.map((link) => stylesheetReady(link, controller.signal)))
          // Force style/layout before asking which fonts the rendered document needs.
          document.body.getBoundingClientRect()
          await document.fonts.ready
          controller.signal.throwIfAborted()
          await nextPaint(view, controller.signal)
          await nextPaint(view, controller.signal)
          controller.signal.throwIfAborted()
          const current = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
          // React/Vite can add lazy-module CSS while fonts or paints settle.
          // Include those links before exposing this document to its first tap.
          if (
            current.length === styles.length &&
            current.every((link, i) => link === styles[i] && link.href === urls[i])
          )
            break
        }
        controller.signal.throwIfAborted()
        if (!disposed) setStatus('ready')
      }
      void settle()
        .catch(() => {
          if (!disposed) setStatus('error')
          controller.abort()
        })
        .finally(() => window.clearTimeout(timeout))
    }
    return () => {
      disposed = true
      controller.abort()
      window.clearTimeout(timeout)
    }
    // A completed, kept-alive frame must not be reloaded when a grade changes.
    // Readiness restarts only for an actual load, explicit retry, or activation.
  }, [active, loaded, retry])

  return (
    <>
      {active && !ready && (
        <section className="beta-frame-loading" aria-label="Activity screen loading">
          <p role={status === 'error' ? 'alert' : 'status'}>
            {status === 'error'
              ? 'This activity screen could not finish loading. Please retry.'
              : 'Loading activities…'}
          </p>
          {status === 'error' && (
            <button
              type="button"
              onClick={() => {
                setStatus('loading')
                setLoaded(0)
                setRetry((value) => value + 1)
                if (frame.current) frame.current.src = props.src || 'about:blank'
              }}
            >
              Retry activity screen
            </button>
          )}
        </section>
      )}
      <iframe
        {...props}
        ref={frame}
        data-family-paused={String(!ready || props['data-family-paused'] === 'true')}
        data-family-presentation={status}
        inert={!ready || props.inert}
        style={{ ...props.style, visibility: ready ? props.style?.visibility : 'hidden' }}
        onLoad={(event) => {
          setStatus('loading')
          setLoaded((value) => value + 1)
          props.onLoad?.(event)
        }}
      />
    </>
  )
}
