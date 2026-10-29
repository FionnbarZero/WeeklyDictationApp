# Compact parent toolbar — isolated preview

The owner requested a much smaller adult/testing area above the child’s activities. The new default view has one 44px row, with 36px Report and Parent controls buttons. Learner selection, practice week, saved lessons, sound check, profile/score access, technical information and Finish session & email reports remain available within Parent controls. Parent setup opens over the page without resizing or remounting the activity iframe. Error banners remain visible when the menu is closed. The existing Report dialog, audio-check dialog and pause/focus behavior are retained.

Application **284dea08f3dcf8b99d58dcb6dd201edebe458118**, **Compact parent toolbar / Prototype 1**. Package tree **e33670368c8df978abc921068dfc354d697fa0b2e1c7a67f41f688e6f9621305**. Builds without the opt-in compact flag retain their existing shell. Production performance remains **549,995 / 550,000** initial JavaScript bytes; budgets were not raised. No teaching, timers, scoring, storage, curriculum or drawing algorithm was changed.

## Verified websites

- [Kindergarten](https://weekly-dictation-staging--compact-parents-oct21-v1-azjkz3sr.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--compact-parents-oct21-v1-azjkz3sr.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5](https://weekly-dictation-staging--compact-parents-oct21-v1-azjkz3sr.web.app/family-beta-preview.html?grade=grade5)

These main grade activity links share one isolated test website. It carries forward the reviewed application 13f6c30 repairs and existing grade-native curriculum. The separate eight-word Grade 5 page remains reachable through Parent controls and retains its previous approved banner; it is not the compact main shell. Old previews and their records remain at their old addresses. No records were copied, reset or erased.

Firebase staging site weekly-dictation-staging, new channel **compact-parents-oct21-v1**, version **23ca4d98e3b42768**. Expires **October 28, 2026, 1:54 a.m. Pacific** (2026-10-28T08:54:33.840148965Z). All **185 public files and 1,110 configured header responses** match the frozen package. All **15 previous releases/expiries** and canonical 9d06a02’s exact manifest remain unchanged. Deployment ran once using the pinned authenticated CLI with authorized-domain synchronization disabled.

## Review and checks

Primary-agent source review covered preview flag isolation, stable iframe ownership, collapsed-menu navigation, error visibility, reporter portal placement inside native dialogs, and preservation of saving/teaching handlers. No new independent-agent review is claimed for this small layout change.

- Type check, changed-file lint/format, production build and unchanged performance budgets pass.
- **11 focused report/reconciliation unit tests** pass.
- **12 local and 12 hosted layout cases** pass: all three grades across desktop Chromium and three WebKit tablet sizes. They measure 44px activity offset, 36px control heights and no button overlap/horizontal overflow; verify all four cards; repeat parent-menu open/close while preserving iframe identity/bounds; type/save a report; reach batch-email controls; report from the native sound-check modal; access a byte-identical synthetic saved score; return to activities; reach the native game menu; and retain visible saving failure outside the closed parent menu.
- **10 local compatibility cases** pass: all-grade writing teacher, Report, Exit/reopen/reload at the confirmed teaching step and repeated Grade 2/5 Shuriken matches on desktop/portrait WebKit. **Five hosted portrait compatibility cases** also pass. The shared test helper now recognizes the compact prototype note inside closed Parent controls, preserving its build-family assertion and all interaction/storage assertions.

No app acceptance failure was waived and no new broad test suite was added for this reversible layout. Earlier full-unit/behavior audit evidence on 13f6c30 remains historical evidence for the unchanged teaching and storage code, not a fresh full-suite run on this source.

## Email and owner check

Gmail send plus metadata readback confirm **SENT**, message/thread **1a15dad4edd939b7**, to the owner’s previously confirmed address. The email includes all three links, exact application build, preview expiry, scope and a **2–3 minute iPad check**: portrait/landscape, small top row, Parent controls open/close, Report/return and entering Writing. No child data or credentials were sent.

Synthetic browser-only progress; no family accounts, cloud/cross-device synchronization or offline installation. Physical iPad audio/recording and Pencil quality remain device acceptance work. Do not clear browser data. Owner approval of the working prototype precedes canonical integration and the existing compatibility/release gates.

Frozen package, screenshots, build output, local/hosted interaction results, provider before/after, publication verifier and email receipt: family-beta-artifacts/prototypes/compact-parents-284dea0/ in the managed Grade 5 worktree.
