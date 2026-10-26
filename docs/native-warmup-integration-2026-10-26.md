# Approved Warmup consolidation — October 26, 2026

The owner approved the working redesigned Warmup, requested it in all three grades, retired the separate Grade 5 eight-word assessment and older test links, and explicitly excluded live publication. The current Kore preview origin is retained to avoid moving its browser-local test progress. Canonical Ninja Dojo and the frozen standalone fifth-grade presentation remain excluded.

## Integrated interaction

- Normal Kindergarten/Grade 2 Spirit Realm writing review uses the approved large Slay writing boxes and native adaptive mastered words. Grade 2 and Grade 5 pre-writing Warmup uses the grade-owned selected queue. The Kindergarten legacy native entry also uses the shared design. Existing reading paths and the Grade 5 direct mastered-games menu remain intact.
- Hear the whole word, ten seconds **after complete prompt audio**, optional Skip Timer, then comparison. A wrong whole-word response leads to one guided trace per character, in order, then whole-word memory retry until correct. Numbered stroke direction/order feedback is immediate. This is not the five-step acquisition teacher.
- First independent answers remain immutable through correction. Only that original answer is passed to native mastery/scoring. Completed correction characters and word position survive Exit/reopen/reload. Unfinished ink is deliberately not persisted; reopening an unscored comparison repeats memory writing.
- Correction checkpoints are child/grade/visit/position scoped and fenced with Web Locks plus compare-and-set. Storage failure leaves the current comparison in place. Native mastery facts use stable event IDs so retrying between fact persistence and visit advance does not add credit twice. Corrupt or conflicting records are preserved with an error, never reset.
- Grade 2’s previous presentation reshuffled an already-durable adaptive queue. The approved integration now presents the durable queue in its actual order and restores its reviewed answers, preventing a shown word from diverging from the graded word. Ordinary production mode retains its prior behavior until a separately authorized release.
- Grade 5 unfinished Warmup visits pin the selected native words. Existing acquisition progress still resumes acquisition without inventing another Warmup. Completing Warmup hands back to the existing teacher/acquisition sequence.

## Publication scope

`--integrated-warmup` opts the combined preview into the approved behavior while retaining W repairs, automatic curriculum updates and Kore. It excludes `grade5-oct23-preview.html` and `warmup-design-preview.html`; parent controls no longer advertise the retired assessment. The accepted isolated reference remains in local immutable evidence/Git history. Its demonstration target list is never imported into native Warmup.

No live deployment, Git main merge, teacher record edit, authentication change, new voice generation or child-data reset is part of this work. Historical source and evidence required to reproduce the frozen standalone are retained.

## Verification and limitations

Final exact-build results, hosting retirement receipts and email receipt are recorded in STATUS and `family-beta-artifacts/native-warmup-2026-10-26/`. Development failures remain in the evidence: the first connection missed the preview's separate Spirit Realm adapter; Grade 2 initially rejected a new key in its legacy storage adapter; its preexisting queue shuffle broke correction resume. Each was repaired before publication. The development server's SPA fallback returned 200 for removed pages; the final static-server and hosted checks require actual 404 responses.

Browser-only preview learners; correction drafts are not authenticated cloud/cross-device checkpoints. Physical iPad speaker/Pencil acceptance remains a device check, not an automated-browser claim. English Niamh and recordings for unseen future teacher text remain separate work. Old preview browser data is not erased when its hosting channel is retired, but the retired URLs are no longer usable test entries.
