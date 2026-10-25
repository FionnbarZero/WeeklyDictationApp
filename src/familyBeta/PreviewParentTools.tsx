import { type ReactNode, useEffect, useState } from 'react'
import { grade5PresentationPreview, grade5Standalone } from '../grade5PresentationPreview/policy.ts'
import { standaloneGamesRetired } from '../learningHub/standaloneGameRetirement.ts'
import { writingCorrectionPreview } from '../writingAcquisition/correctionStrategy.ts'

/** The isolated preview keeps adult setup available without surrounding the
 * child's activity with testing controls. Closing this never unmounts a lesson. */
export function PreviewParentTools({ grade, page, children }: { grade?: string; page?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [page])
  return (
    <div className="beta-preview-strip">
      <strong className="beta-preview-child-label">{grade}</strong>
      <details className="beta-parent-tools" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Parent controls</summary>
        <div className="beta-parent-tools-panel">
          <p className="beta-preview-details" role="note">
            {import.meta.env.VITE_W2_RECOVERY_PREVIEW === 'true'
              ? 'W-roadmap combined repairs'
              : import.meta.env.VITE_W1_CURRICULUM_PREVIEW === 'true'
                ? 'W1 curriculum and activity entry'
                : writingCorrectionPreview
                  ? 'W0 integrated writing'
                  : grade5Standalone
                    ? '5th grade Dojo'
                    : grade5PresentationPreview
                      ? '10/19 – Fifth Grade Ninja Dojo'
                      : standaloneGamesRetired
                        ? 'Streamlined Dojo'
                        : 'Compact parent toolbar'}{' '}
            ·{' '}
            {import.meta.env.VITE_W2_RECOVERY_PREVIEW === 'true'
              ? 'Prototype 4'
              : import.meta.env.VITE_W1_CURRICULUM_PREVIEW === 'true'
                ? 'Prototype 4'
                : grade5Standalone
                  ? 'Standalone 1'
                  : writingCorrectionPreview
                    ? 'Prototype 2'
                    : 'Prototype 1'}{' '}
            · {import.meta.env.VITE_GIT_REVISION?.slice(0, 7) || 'local'}. Test learners only. Progress saves in this
            browser; no account, cloud sync or offline installation.
          </p>
          {children}
          <div id="compact-parent-report-controls" />
        </div>
      </details>
    </div>
  )
}
