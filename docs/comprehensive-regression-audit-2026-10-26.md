# Comprehensive regression audit — October 26, 2026

## Scope and identity

Audit of **Combined Dojo / Approved Warmup 1**, all three grades, on the retained Kore test origin. Application revision **ab76131f538b60b143cded3d596bc061e679f50e**, hosting version **4f187d835667da7b**, immutable tree **9f52d114e9ae560eecd01f60d7efdc6b753d160c84a5b8c7401aa6624282f8cd**. This is an isolated, browser-local preview, not canonical Ninja Dojo or the frozen fifth-grade presentation.

This audit changes test drivers and documentation only. No application code, hosting release, teacher document, child record, authentication setting or email changed. Astra · Extra High remains the recorded review recommendation; no model switch or independent-agent review is claimed.

## Result

**Audit complete, with two open findings: an intermittent menu-loading first-click miss and incomplete supporting game content for two imported cohorts.** No teaching, checkpoint-loss, scoring or audio-pause regression was reproduced in the tested flows. This is a qualified result, not a clean first-pass matrix or a claim of zero bugs. Whether the startup miss predates Warmup integration is unproven.

All **1,284 unit tests pass**. The **365 distinct browser cases** have passing executions after the documented driver corrections and focused reruns, but the observed intermittent startup miss remains open despite its passing reruns. No live release is recommended by this audit alone.

## P2 — first click can be lost while the Kindergarten menu loads

One hosted WebKit tablet case returned successfully from clicking **Practice your Ninja Skills**, but the screen stayed on the main activity menu. It then timed out waiting for Shadow Strike. The sound/Report assertion had not started; this is not evidence of audio playing during Report.

The retained trace shows the same child frame throughout, one successful curriculum request, and an unstyled-to-styled menu change during the click. At input targeting, the Ninja Skills card measured **736 × 31 px**, with click coordinates **(384, 123.89)**. Screenshots **137 ms apart** show the compact unstyled buttons replaced by tall finished cards. The menu movement during input is the likely cause of the missed click; it was not a confirmed save, curriculum replacement or audio failure. Three unchanged focused reruns pass (**21.3 s**), which demonstrates intermittency rather than closing the finding.

**Follow-up:** reproduce cold-start menu readiness under delayed style application, keep the loading state until the menu is ready to accept input, and add a first-click check for each grade. Preserve existing navigation and teaching behavior. Scope observed here is Kindergarten/WebKit; do not infer that every grade or physical iPad fails. Evidence: `games-corrected/kindergartenAudio-a-pendin-bcaab-ad-cannot-play-after-Report-ipad/trace.zip`, `menu-race-0.jpeg`, `menu-race-1.jpeg`, `menu-startup-observation.json`, and `pending-report-repeats.log`.

## P2 — confirmed remaining content gap

Fresh teacher-service snapshots contain **22 weeks / 213 Tier 1/2 target occurrences**, including **102 writing-target occurrences**. Every current and retained writing character has a guide in the preview's combined median catalog, and every Tier 1/2 target word has a Kore recording. This is asset-coverage evidence, not a pronunciation or stroke-quality assessment.

The newest two imported cohorts still lack game support:

| Grade / source week | Missing support targets | Consequence for that cohort |
| --- | --- | --- |
| Kindergarten / October 26 | 大、马、绿色、黄色、吃 | Shuriken Match lacks validated meanings; Dictation Streak lacks Pinyin choices/context; Sushi Scramble lacks sentence tokens. Context Gap also requires at least three Tier 1 targets, while this cohort has two. |
| Grade 5 / October 13 | 名字、穷、穷苦、家庭、勇敢、喜爱、伟大、表现、州、造成、不便、成立、银行、国家、方便、建议、印在 | The same three games and Context Gap lack validated support for this cohort. |

Shadow Strike and Memory Lanterns can use these cohorts. Grade 2 has no missing game-support targets in the fetched inventory. Normal Ninja Skills selects earlier eligible writing/reading cohorts; this finding does **not** mean the currently presented games are all broken. It is a verified readiness gap when these new sets are selected for those games, not evidence that the Warmup change caused a regression. Adding language alone will not bypass Kindergarten Context Gap's minimum-target policy. Preserve teacher target membership; do not add invented vocabulary to enable a game.

The current source/capability evidence is `family-beta-artifacts/comprehensive-audit-2026-10-26/content.json`, with the fetched snapshots alongside it. Capability checks include the normal supplemental/Dictation builders. Guide inventory explicitly includes automatic-curriculum medians: a preliminary Node-only probe omitted the Vite preview flag and falsely reported missing guides; that rejected probe is retained as `content-without-preview-flags.json` and is not a product finding.

## Verification matrix

| Check | Result and coverage |
| --- | --- |
| Unit tests | **1,284 / 1,284 pass** on the current application revision. |
| Lint, typecheck, production build and size gates | Pass. Production budget: 549,959 / 550,000 JS bytes; 46,342 / 60,000 CSS bytes. |
| Native writing Warmup | **69 distinct cases pass** across laptop Chromium and landscape/portrait WebKit after test-driver corrections. Includes 27 new adversarial cases: conflicting tabs, failed native-owner saves, and Report while a checkpoint waits for its lock. Existing checks cover repeated correction, first-attempt-only scoring, save/reload, full visits, native handoff and audio-before-timer. |
| Automatic curriculum | **75 / 75 hosted cases pass**, including scheduled activation, safe-menu adoption, launch races, rejected saves/retry, source outages/validation and nine actual-teacher writing/reading launch cases. |
| Kore voice | **75 / 75 hosted cases pass**, including real recorded-media completion, slow replay, Report/Exit, writing/reading and each grade's games with Mandarin speech fallback disabled. |
| Compact games | **26 / 26 hosted cases pass** across laptop, both tablet orientations and narrow-screen/reduced-height layouts. Includes wrong answers, corrected answers, completion, reopening, lower matching cards and Pinyin choices. |
| Full game recovery/completion | Main corrected run **86/90**, with three outdated Dictation assertions and the one startup miss above. **6/6 focused Dictation cases pass** after the segmented-plan driver correction; **3/3 unchanged focused startup repeats pass**. All 90 distinct cases have passed, with the startup finding still open. Includes every available game, repeated mistakes/rounds, saved-game reload/retry/discard, competing tabs, completed-result protection and denied/delayed audio. |
| Writing acquisition and reading regression | **30 / 30 hosted cases pass** across all grades and three layouts: real five-step teaching for every character of the first word, acquisition, Report pause, ordinary-entry resume, next-word teaching, reading reopen, and Grade 2's repeated copy/memory errors with reload and return to distractors. |
| Hosted identity and retirement | All **1,122 files / 6,732 headers** match the immutable package; all 18 retired preview URLs return 404; removed assessment/Warmup demo routes and parent link remain absent. |
| Protected releases | Canonical manifest unchanged; frozen fifth-grade manifest and **182 assets** unchanged; Firebase channel inventory unchanged. |

Screenshots of native Warmup and game layouts were inspected alongside viewport assertions. Touch-sized WebKit emulation does not reproduce the physical iPad software keyboard, Pencil, audio routing or microphone.

## Failed runs and test corrections

All initial logs, error contexts and traces remain in the audit evidence directory; none are replaced with passing results.

- **Native Warmup:** initial run 65/69. The Grade 2 save-failure injection initially patched only the activity frame, although its workspace owner writes in the parent realm. After refusing both destinations, the app correctly stopped at position 1 and showed two legitimate error messages; an unscoped locator then failed on the duplicate alerts. The test now targets the Warmup error. Kindergarten's completion assertion read the ledger before the asynchronous Done lock finished and used an obsolete key prefix. It now waits for the activity to close and requires exactly one correctly scored result. Six focused cases across all three layouts pass, covering every originally failing case.
- **Game/compact fixtures:** old tests computed expected packs from an October 16 snapshot while the automatic preview fetched newer teacher data. Grade 2's seeded visit history also used the old preview child ID. Tests now route the same verified fixture they use for expected packs, and seed the observed isolated learner. Fresh teacher fetching remains separately tested in the curriculum matrix. The interrupted initial game/layout runs are not counted as complete matrices.
- **Dictation voice assertions:** the older test expected one browser-speech utterance. Kore owns a segmented word–sentence–word–word plan; quick automated answers could cancel its last repeats. The completion driver now blocks Kore only in this fallback-path test, waits for the full spoken plan before submitting, and checks the combined spoken text. Actual Kore playback is checked separately without that substitution.
- **Startup miss:** the final Kindergarten audio case failed before game entry. Its test was not changed or made to wait past the symptom. Three unchanged reruns pass; the original trace and open product finding are retained above.
- **Writing regression harness:** the current automatic build needs a validated teacher service response. An opt-in current-build fixture mode preserves the historical baseline tests while using the appropriate calendar/profile behavior for this audit.

## Limits and next action

Address startup menu readiness and complete the supporting content for the two imported cohorts in bounded repairs. Physical iPad/iMac listening, Pencil/touch/keyboard and microphone acceptance remain open, as do authenticated cloud/offline/cross-device acceptance and main-branch reconciliation. Passing browser-local checkpoint tests is not evidence of cross-device synchronization. English Niamh and audio/support for unseen future teacher text remain separate roadmap work.

The hosted preview remains `ab76131`, expiring **November 2, 2026 at 9:45 AM Pacific**. No new website was created, so this audit does not send another test-site email or authorize a live release.

## Evidence

Root: `family-beta-artifacts/comprehensive-audit-2026-10-26/`.

- `units.log`, `lint.log`, `lint-final.log`, `build.log`, `test-lint-final.log`.
- `native.log`, `owner-refusal-proof.log`, `native-corrected.log`, corresponding trace/screenshot directories.
- `curriculum.log`, `kore.log`, and their trace/source attachments.
- `games.log`, `games-corrected.log`, `dictation-corrected.log`, `layout.log`, `layout-corrected.log`, `writing.log`.
- `pending-report-repeats.log`, the unchanged repeat traces, and `menu-startup-observation.json` with before/after screenshots.
- `verify.mjs`, `verification.json`, `verify.log`; fresh teacher snapshots and `content.json`.
