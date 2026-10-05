import { useState, type ChangeEvent } from 'react'
import { Download, ShieldCheck, Upload, X } from 'lucide-react'
import {
  applyLocalApplicationRestore,
  exportLocalApplicationBackup,
  previewLocalApplicationRestore,
  type LocalApplicationRestorePreview,
} from '../application/backup/index.ts'
import { loadLocalWorkspace, type LocalWorkspacePort } from '../application/workspace/index.ts'
import { useDialogFocus } from '../accessibility/useDialogFocus.ts'
import { APP_VERSION } from '../config.ts'
import type { AppState } from '../domain.ts'
import { createBrowserLocalRestore } from '../infrastructure/browserLocalRestore.ts'

export type LocalBackupExport = {
  fileName: string
  serialized: string
  checksum: string
}

function downloadBackup(backup: LocalBackupExport) {
  const url = URL.createObjectURL(new Blob([backup.serialized], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backup.fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function LocalBackupTools({
  onClose,
  state,
  selectedChildId,
  localWorkspace,
  onStateRestored,
}: {
  onClose: () => void
  state: AppState
  selectedChildId: string
  localWorkspace: LocalWorkspacePort
  onStateRestored: (state: AppState) => void
}) {
  const [busy, setBusy] = useState<'export' | 'preview' | 'safety' | 'apply' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<LocalApplicationRestorePreview | null>(null)
  const [previewRaw, setPreviewRaw] = useState<string | null>(null)
  const [safetyBackupChecksum, setSafetyBackupChecksum] = useState<string | null>(null)
  const [safetyBackupConfirmed, setSafetyBackupConfirmed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [applied, setApplied] = useState(false)
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose)
  const expectedScope = {
    mode: 'local-browser' as const,
    grade: 'Grade 2' as const,
    selectedChildId,
    origin: window.location.origin,
  }
  const createBackup = () => {
    const createdAt = new Date().toISOString()
    return exportLocalApplicationBackup({
      state,
      createdAt,
      applicationVersion: APP_VERSION,
      scope: { ...expectedScope, dataScope: 'whole-local-practice-state' },
      capabilities: localWorkspace,
    })
  }
  const previewBackup = (raw: string) =>
    previewLocalApplicationRestore({ raw, currentState: state, expectedScope, capabilities: localWorkspace })
  const applyBackup = async (raw: string, previewChecksum: string) => {
    const createdAt = new Date().toISOString()
    const restored = await applyLocalApplicationRestore({
      raw,
      previewChecksum,
      currentState: state,
      expectedScope,
      capabilities: createBrowserLocalRestore(window.localStorage),
      transactionId: `grade2-restore-${createdAt}`,
      createdAt,
    })
    onStateRestored(loadLocalWorkspace(localWorkspace))
    return restored
  }

  const exportBackup = async () => {
    setBusy('export')
    setMessage(null)
    setError(null)
    try {
      const backup = await createBackup()
      downloadBackup(backup)
      setMessage(`Verified backup downloaded. SHA-256 ${backup.checksum}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be created.')
    } finally {
      setBusy(null)
    }
  }

  const previewRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('preview')
    setMessage(null)
    setError(null)
    setPreview(null)
    setPreviewRaw(null)
    setSafetyBackupChecksum(null)
    setSafetyBackupConfirmed(false)
    setConfirmed(false)
    setApplied(false)
    try {
      const raw = await file.text()
      const result = await previewBackup(raw)
      setPreview(result)
      setPreviewRaw(raw)
      setMessage('Backup verified. This preview did not change any browser data.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be previewed.')
    } finally {
      setBusy(null)
    }
  }

  const prepareSafetyBackup = async () => {
    setBusy('safety')
    setMessage(null)
    setError(null)
    setSafetyBackupChecksum(null)
    setSafetyBackupConfirmed(false)
    try {
      const safetyBackup = await createBackup()
      downloadBackup({ ...safetyBackup, fileName: safetyBackup.fileName.replace('backup-', 'pre-restore-backup-') })
      setSafetyBackupChecksum(safetyBackup.checksum)
      setMessage(`Pre-restore safety backup downloaded. SHA-256 ${safetyBackup.checksum}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The pre-restore safety backup could not be created.')
    } finally {
      setBusy(null)
    }
  }

  const applyRestore = async () => {
    if (!preview || !previewRaw || !safetyBackupChecksum || !safetyBackupConfirmed || !confirmed) return
    setBusy('apply')
    setMessage(null)
    setError(null)
    try {
      const result = await applyBackup(previewRaw, preview.checksum)
      setApplied(true)
      setConfirmed(false)
      setMessage(
        result.status === 'idempotent'
          ? 'This profile already matched the backup. No browser data changed.'
          : 'Restore complete. The selected profile was replaced and other profiles were preserved.',
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The restore could not be applied.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="backup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Grade 2 data safety</p>
            <h2 id="backup-modal-title">Protect browser progress</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close progress protection" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="backup-introduction">
          Download the whole local practice state and both recovery journals in one SHA-256 verified file. This includes
          records for every profile stored in this browser, not only the profile currently selected. Keep the file
          private.
        </p>

        <section className="backup-action-card" aria-labelledby="backup-export-title">
          <div>
            <p className="eyebrow">Step 1</p>
            <h3 id="backup-export-title">Download verified backup</h3>
            <p>This reads the current browser state. It does not clear, replace, or upload anything.</p>
          </div>
          <button
            className="primary-button backup-action"
            type="button"
            disabled={busy !== null}
            onClick={() => void exportBackup()}
          >
            <Download size={16} /> {busy === 'export' ? 'Creating…' : 'Download backup'}
          </button>
        </section>

        <section className="backup-action-card" aria-labelledby="backup-preview-title">
          <div>
            <p className="eyebrow">Step 2</p>
            <h3 id="backup-preview-title">Preview restore</h3>
            <p>
              Select a backup to verify its checksum, schema, journals, browser origin, selected-profile context, and
              record counts. Preview never writes to browser storage.
            </p>
          </div>
          <label className={`backup-file-control${busy !== null ? ' disabled' : ''}`}>
            <Upload size={16} /> {busy === 'preview' ? 'Verifying…' : 'Select backup'}
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Select a Grade 2 backup to preview"
              disabled={busy !== null}
              onChange={(event) => void previewRestore(event)}
            />
          </label>
        </section>

        {error && (
          <div className="backup-error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="backup-message" role="status">
            {message}
          </div>
        )}
        {preview && (
          <section className="backup-preview" aria-labelledby="backup-preview-result-title">
            <div className="backup-preview-heading">
              <ShieldCheck size={20} />
              <div>
                <p className="eyebrow">Read-only result</p>
                <h3 id="backup-preview-result-title">Restore preview verified</h3>
              </div>
            </div>
            <dl>
              <div>
                <dt>Created</dt>
                <dd>{new Date(preview.summary.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Application</dt>
                <dd>{preview.summary.applicationVersion}</dd>
              </div>
              <div>
                <dt>Backup contents</dt>
                <dd>Whole local practice state</dd>
              </div>
              <div>
                <dt>Profile context</dt>
                <dd>Current Grade 2 profile matched</dd>
              </div>
              <div>
                <dt>Datasets</dt>
                <dd>{preview.summary.datasetCount}</dd>
              </div>
              <div>
                <dt>Results and scores</dt>
                <dd>
                  {preview.summary.resultCount} / {preview.summary.scoreCount}
                </dd>
              </div>
              <div>
                <dt>Acquisition progress</dt>
                <dd>{preview.summary.acquisitionProgressCount}</dd>
              </div>
              <div>
                <dt>Warmup visits</dt>
                <dd>{preview.summary.warmupVisitCount}</dd>
              </div>
              <div>
                <dt>Pending recovery</dt>
                <dd>
                  {preview.summary.pendingAcquisitionCount} Acquisition / {preview.summary.pendingWarmupCount} Warmup
                </dd>
              </div>
            </dl>
            <p className="backup-checksum">
              <strong>SHA-256</strong>
              <code>{preview.checksum}</code>
            </p>
            <p className="backup-no-write">
              No browser data was changed. Applying this restore replaces only the selected profile’s records.
            </p>
            <div className="backup-restore-report" aria-label="Selected profile restore report">
              <h4>Before → after</h4>
              <dl>
                <div>
                  <dt>Practice records</dt>
                  <dd>
                    {preview.restore.before.practiceRecords} → {preview.restore.after.practiceRecords}
                  </dd>
                </div>
                <div>
                  <dt>Acquisition records</dt>
                  <dd>
                    {preview.restore.before.acquisitionRecords} → {preview.restore.after.acquisitionRecords}
                  </dd>
                </div>
                <div>
                  <dt>Warmup records</dt>
                  <dd>
                    {preview.restore.before.warmupRecords} → {preview.restore.after.warmupRecords}
                  </dd>
                </div>
                <div>
                  <dt>Pending recovery</dt>
                  <dd>
                    {preview.restore.before.pendingRecovery} → {preview.restore.after.pendingRecovery}
                  </dd>
                </div>
                <div>
                  <dt>Other-profile records</dt>
                  <dd>{preview.restore.preservedOtherChildRecords} preserved</dd>
                </div>
                <div>
                  <dt>Historical datasets</dt>
                  <dd>{preview.restore.addedHistoricalDatasets} added</dd>
                </div>
              </dl>
            </div>
            {!applied && (
              <div className="backup-apply-controls">
                <div>
                  <p className="eyebrow">Required safety step</p>
                  <button
                    className="secondary-button backup-action"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void prepareSafetyBackup()}
                  >
                    <Download size={16} />{' '}
                    {busy === 'safety'
                      ? 'Creating…'
                      : safetyBackupChecksum
                        ? 'Download safety backup again'
                        : 'Download pre-restore backup'}
                  </button>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={safetyBackupConfirmed}
                    disabled={!safetyBackupChecksum || busy !== null}
                    onChange={(event) => setSafetyBackupConfirmed(event.target.checked)}
                  />
                  I saved the pre-restore backup in a private location.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!safetyBackupConfirmed || busy !== null}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Restore only the selected Grade 2 profile. Other profiles and shared curriculum must be preserved.
                </label>
                <button
                  className="primary-button backup-action"
                  type="button"
                  disabled={!safetyBackupChecksum || !safetyBackupConfirmed || !confirmed || busy !== null}
                  onClick={() => void applyRestore()}
                >
                  <ShieldCheck size={16} /> {busy === 'apply' ? 'Restoring…' : 'Apply selected-profile restore'}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
