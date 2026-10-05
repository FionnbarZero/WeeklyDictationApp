import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_VERSION } from '../releaseMetadata.ts'
import {
  captureScreenContext,
  exportProblemReports,
  problemReportsEmailUrl,
  readProblemReports,
  REPORT_CATEGORIES,
  saveProblemReport,
  type ProblemReport,
  type ReportCategory,
} from './problemReports.ts'
import './preview.css'

export function ProblemReporter({ grade }: { grade?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<ProblemReport | null>(null)
  const [saved, setSaved] = useState(false)
  const [reports, setReports] = useState<ProblemReport[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const defaultLauncherHost = document.getElementById('problem-reporter-controls') || document.getElementById('problem-reporter-root') || document.body
  const [launcherHost, setLauncherHost] = useState<HTMLElement>(defaultLauncherHost)

  useEffect(() => {
    const update = () => {
      // A fixed button outside a native modal is inert, regardless of z-index.
      // Move the same launcher inside the active modal without closing the activity.
      const modals = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
      if (dialog.current?.open) return
      setLauncherHost(modals[modals.length - 1] || defaultLauncherHost)
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    update()
    return () => observer.disconnect()
  }, [defaultLauncherHost])

  function begin() {
    setFinishing(false)
    setDraft({
      schema: 1,
      id: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      savedAt: '',
      category: 'Something looks wrong',
      description: '',
      context: {
        grade: grade ||
          ({ kindergarten: 'Kindergarten', grade2: 'Grade 2', grade5: 'Grade 5' } as Record<string, string>)[
            new URLSearchParams(location.search).get('grade') || 'kindergarten'
          ] || 'unavailable',
        ...captureScreenContext(document),
        appVersion: APP_VERSION,
        previewBundle: new URL(import.meta.url).pathname,
        browser: navigator.userAgent,
        viewport: `${innerWidth} × ${innerHeight}`,
        online: String(navigator.onLine),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    })
    setSaved(false)
    setNotice('')
    setError('')
    try {
      setReports(readProblemReports(localStorage))
    } catch {
      setReports([])
      setError('Saved reports could not be read. Nothing was deleted. You can still describe and copy this problem.')
    }
    dialog.current?.showModal()
  }

  function close() {
    dialog.current?.close()
    launcher.current?.focus()
  }

  function save() {
    if (!draft) return
    const report = { ...draft, savedAt: new Date().toISOString() }
    try {
      saveProblemReport(localStorage, report)
      setDraft(report)
      setSaved(true)
      setReports((current) => [report, ...current.filter((item) => item.id !== report.id)])
      setError('')
      setNotice('Saved on this device—not sent. Keep reporting as you play, then choose Finish session & email reports to send them together.')
    } catch {
      setError(
        'Could not save on this device. Your description is still here. Use Copy this report to keep it elsewhere.',
      )
    }
  }

  async function copy() {
    if (!draft?.description.trim()) {
      setError('Please describe the problem first.')
      return
    }
    try {
      await navigator.clipboard.writeText(exportProblemReports([draft]))
      setError('')
      setNotice('Copied. Paste this report into our chat. It has not been sent automatically.')
    } catch {
      setError('Clipboard access is unavailable. Select and copy the report text below.')
    }
  }

  function finish() {
    setError('')
    setNotice('')
    if (draft && !saved && draft.description.trim()) {
      setFinishing(false)
      setNotice('Save this unfinished report first, then choose Finish session & email reports again. Your activity and scores are unchanged.')
    } else {
      setFinishing(true)
      try { setReports(readProblemReports(localStorage)) }
      catch { setError('Saved reports could not be read. Nothing was deleted.'); setReports([]) }
    }
    dialog.current?.showModal()
  }

  async function emailSaved() {
    // Re-read at send time so another tab's saved reports are included too.
    let all: ProblemReport[]
    try { all = readProblemReports(localStorage) }
    catch { setError('Saved reports could not be read. Nothing was deleted.'); return }
    if (!all.length) { setNotice('There are no saved reports to email.'); return }
    const file = new File([exportProblemReports(all)], 'weekly-dictation-problems.json', { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Weekly Dictation problem reports' })
        setNotice('Reports handed to your sharing app. Complete sending there. All reports are still saved on this device.')
      } catch {
        setNotice('Sharing was cancelled or unavailable. Reports are still saved. You can export the file and attach it to an email.')
      }
      return
    }
    const url = problemReportsEmailUrl(all)
    if (url.length > 8000) {
      if (download()) setNotice('This batch is too large for a reliable email draft. A reports-file download was requested; attach the file to an email to yourself. All reports remain saved.')
      return
    }
    setNotice('Opening one email draft with all saved reports. Address it to yourself and press Send. If no draft opens or text is missing, export the reports file and attach it. Nothing has been sent automatically.')
    window.location.href = url
  }

  function download() {
    try {
      const all = readProblemReports(localStorage)
      if (!all.length) throw new Error('No saved reports')
      const url = URL.createObjectURL(new Blob([exportProblemReports(all)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `weekly-dictation-problems-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setError('')
      setNotice(`Exported ${all.length} saved report(s). Attach the file in our chat. Reports remain on this device.`)
      return true
    } catch {
      setError('Saved reports could not be exported. Nothing was deleted. You can still copy this report.')
      return false
    }
  }

  return (
    <>
      {createPortal(<div className="beta-report-launcher-group"><button
        className="beta-report-launcher"
        ref={launcher}
        onClick={() => {
          setFinishing(false)
          if (draft && !saved && draft.description.trim()) dialog.current?.showModal()
          else begin()
        }}
      >
        Report a problem
      </button><button className="beta-report-finish" onClick={finish}>Finish session &amp; email reports</button></div>, launcherHost)}
      <dialog
        className="beta-report-dialog"
        data-problem-reporter="true"
        ref={dialog}
        aria-labelledby="beta-report-title"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <h1 id="beta-report-title">{finishing ? 'Finish session & email reports' : 'Report a problem'}</h1>
        {!finishing && <>
        <p>
          {draft?.context.grade} · {draft?.context.game || draft?.context.activity || draft?.context.screen}
        </p>
        <p>
          Screen details are captured when you open this form. The activity may keep running; reporting does not submit
          or discard it.
        </p>
        <p>
          Reports stay in this browser until you email, copy, or export them. No names, answers, screenshots, or recordings are
          collected automatically. Please leave personal information out of your description.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <label>
            What kind of problem?
            <select
              disabled={saved}
              value={draft?.category}
              onChange={(event) =>
                setDraft((value) => value && { ...value, category: event.target.value as ReportCategory })
              }
            >
              {REPORT_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            What did you see or hear?
            <textarea
              required
              maxLength={4000}
              rows={5}
              readOnly={saved}
              value={draft?.description || ''}
              placeholder="What happened? What did you expect?"
              onChange={(event) => setDraft((value) => value && { ...value, description: event.target.value })}
            />
          </label>
          <details>
            <summary>Included screen details</summary>
            <pre>{JSON.stringify(draft?.context, null, 2)}</pre>
          </details>
          {error && <p role="alert">{error}</p>}
          <p role="status">{notice}</p>
          <div className="beta-report-actions">
            <button type="submit" disabled={saved || !draft?.description.trim()}>
              {saved ? 'Saved on this device' : 'Save report on this device'}
            </button>
            <button type="button" disabled={!draft?.description.trim()} onClick={() => void copy()}>
              Copy this report
            </button>
            <button type="button" onClick={finish}>Finish session &amp; email reports</button>
            <button type="button" onClick={close}>
              Close and return
            </button>
          </div>
        </form>
        </>}
        {finishing && <>
          <p>Send all saved reports together when you are done playing. Choose your email app, address the message to yourself, and press Send. This includes reports from earlier visits that are still saved; nothing is marked sent or deleted.</p>
          <p>Your activity and scores are unchanged. Reports contain your descriptions and screen details, not recordings or child answers.</p>
          {error && <p role="alert">{error}</p>}
          <p role="status">{notice}</p>
          <button type="button" disabled={!reports.length} onClick={() => void emailSaved()}>Email all saved reports together</button>
          <button type="button" onClick={close}>Close and return</button>
        </>}
        <hr />
        <p>
          {reports.length} saved report(s) on this device. Export includes all grades and your descriptions. Clearing
          browser data removes local reports.
        </p>
        <button type="button" disabled={!reports.length} onClick={download}>
          Export saved reports
        </button>
        {!finishing && draft?.description.trim() && (
          <details>
            <summary>Report text for manual copying</summary>
            <textarea
              aria-label="Report text for manual copying"
              readOnly
              rows={8}
              value={exportProblemReports([draft])}
            />
          </details>
        )}
      </dialog>
    </>
  )
}
