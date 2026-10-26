# October 26 problem reports — separate all-grade prototype

## Scope and protection

The owner supplied three exports and requested repairs on **new links**, leaving the previous links static. They contain **21 unique reports**: the five Kindergarten reports recur in the larger export and the last two exports repeat the same 21 reports. Kindergarten observations identify `1f9ad3f`; Grade 2 observations identify `b36f736`. These different recorded builds do not establish when a defect was introduced.

The candidate is **Combined Dojo / Report repairs 2**, enabled only in the isolated combined preview. Keep the existing `kore-voice-oct26-v1` channel at `b36f736` with its existing expiry. The new proposed channel is `reports-oct26-v2`. Canonical Ninja Dojo, Firebase live, the frozen standalone fifth grade site, shared curriculum service, teacher documents and real-family records are outside this release. No main merge or old-preview deletion is authorized by this stage.

Existing Astra · Extra High implementation/review and Sol · High publication confirmations apply. Review is source/automated; no model switch or independent-agent review is claimed.

## Report crosswalk

| Report(s), abbreviated IDs | Cause or finding | Bounded repair and evidence |
| --- | --- | --- |
| 1/5 `f6e468b3`, `27a672f6` | Kindergarten's visible board summarized visits rather than the durable result ledger; test pathways differed by grade. | Shared Final Boss reading/writing adapter saves a stable attempt ID to the existing ledger, checks readback and permits retry. Saved Ninja Record reads the ledger for the selected learner/grade. Completed scores survive reload; incomplete tests remain unscored. Failed-save browser cases retain the review and retry without duplicate scores. |
| 2 `92c6ec73` | Broad report of writing/game stalls or premature advancement supplies no single reproducible trigger. | Full-game error/retry/completion checks, acquisition teacher progression and Report/Exit checks are covered. No claim of a proven universal cause or zero possible stalls. |
| 3/12 `645841bf`, `df081aca` | Reentry cluttered the test menu; reading test availability/layout was unclear. | Visible separate Reading Test and Writing Test, compact Re-enter the Dojo card containing reading/writing choices. Disabled unavailable content remains explicit. |
| 4/9/10 `192553e0`, `841ac85b`, `144e5c9b` | Old Final Boss writing presentation and pre-test Warmup conflicted with requested test behavior. | Slay background/boxes with thicker ink, collect every response then compare/score on the final page. Shared Boss entry goes directly to collection, with no expanded/correction trials or Warmup. Whole-word response count and grade-owned source sets are retained. |
| 6 `951ed543` | Mastered-game rotation advanced only after completed scores. | Reserve a child/grade/game/source-set visit on each new Spirit Realm entrance, including after an unfinished exit. Report and wrong answers do not consume visits. Cursor write/readback failure blocks launch. Same-device sequential entrances verified; this is not a cross-tab atomic lock. Small pools necessarily reuse words. Scoring rules are unchanged. |
| 7 `3ead2fd9` | Dictation input edits could restore old retained Hanzi when the new edit removed them before a Pinyin error. | Error recovery keeps the Hanzi in the newly edited value. Full games cover wrong character, retry, Report pause and all rounds. |
| 8 `0f4daa0e` | Redundant mastered-reading/writing launch wrappers. | Direct Spirit Realm game cards using the existing mastered pool and tier eligibility. |
| 11 `8b232385` | Reentry writing used the older practice view without the integrated teacher. | Five guided steps for each character of each new word, then Slay acquisition. Grade 2 new reentry uses the approved trace/independent/copy-memory strategy. Native ordinary Dojo checkpoint behavior is unchanged. Reentry remains a fresh, session-only revision exercise, as before. |
| 13 `6a694ce5` | Sushi's ordinary replay did not slow the sentence. | Hear sentence again now requests rate 0.5; the separate slow control remains. Native Kore playback-rate check. |
| 14 `659eb4a8` | Lantern word positioning was not anchored to the face center. | Center the text within the lantern face; repeated-flip layout checks. |
| 15/16 `f155f51b`, `e39a9d8b` | Context Gap spoke the complete answer-containing sentence too quickly. | Only the before/after snippets are voiced at rate 0.5, with 1,200 ms silence at the blank. Request ownership stops a superseded/abandoned suffix. Added native Kore snippet recordings; native playback and cancellation checks. |
| 17 `fed44b4c` | Requested book placeholder absent. | Add disabled Read the book / Coming soon in Dojo without duplicating an existing book entry. No book content is fabricated. |
| 18 `f4501bea` | Optional English introduction could fail before the Mandarin teaching prompt, and recording could interrupt that prompt. | New-preview reading introduction starts with Mandarin. Recording waits for successful teaching audio; failed teaching prompts expose retry. Native Mandarin check with English synthesis unavailable. |
| 19 `2e9ee938` | Freewriting ink thinner than the requested acquisition treatment. | Scoped seven-pixel SVG ink in the new preview. Stored response geometry is unchanged. |
| 20/21 `b60c7ce3`, `e6123647` | 最 contains all twelve source strokes; no missing median or altered source order was found. Font-based final reference did not use the tracing geometry. | Final model uses the same aligned geometry, with twelve pinned upstream outline paths for 最; guide/partial supplied strokes keep the existing assessment medians. Check all five steps, including 8/4 supplied prefixes and the final 12-stroke comparison. This is a rendering correction, not a claim that the teacher's stroke order changed. |

A candidate-only layout check also found that Reentry retained the old page header, pushing the pad below the viewport, and that the Final Boss pad overlapped Type in portrait. Both were repaired before publication.

## Grade 2 current-week carryover

The owner's preceding choice is **October 19 Wetland words for October 26–30 review**. The new preview includes committed `e69f504` recovery while the old link remains unchanged. Writing: 湿地、食物、还有、动物、蛋. Reading: 栖息地、昆虫、金蛙、蛇、鳄鱼、湿地. It preserves the October 19 source identity and existing earlier cohorts; no invented October 26 cohort. The general native-slide Math-before-Mandarin importer fix (`822236e`) remains unpublished on the shared service.

The 15 Wetland browser cases pass across laptop Chromium and two tablet WebKit layouts: actual teacher source, repeated tracing mistakes, interrupted/reopened checkpoint, source outage, both characters through all five trials, reading audio, Shuriken correction/completion and 19 selected new native recordings. The recording probe is a sample, not all 38 Wetland clips.

## Audio and storage

The previous 958 Kore files are unchanged. Prior Wetland work adds 38; this stage adds 216 context snippets, for **1,212 recordings**. Each new file is matched to its synthesis receipt/checksum. Voice remains `cmn-CN-Chirp3-HD-Kore`. The cumulative generation estimate recorded in the receipts is **$0.11979 before allowances**; this is an estimate, not an invoice. English Niamh is not added.

The new hostname has its own browser storage. Existing progress remains at the old origin and is not automatically transferred. No reset or migration of old browser data occurs. Browser-only sample learners do not establish authenticated/offline/cross-device family synchronization. Recordings/handwriting remain temporary; only existing result/checkpoint contracts persist.

## Verification accounting

Evidence directory: `family-beta-artifacts/reports-2026-10-26-v2` (ignored, local).

- Initial unit run: 1,293/1,295; one architecture dependency was removed, one test-review adapter allowlist updated for the new reviewed adapter. Subsequently 1,300/1,300 passed. A redundant legacy pre-test-Warmup branch and its test were then removed because the new Final Boss adapter bypasses that path directly; final suite count is recorded with the release below.
- Initial browser runs retained: incorrect accessible-name selectors, a pre-render reading-test race, old Grade 2 fixture expectations that omitted recovered Wetland, and measurement during lantern animation were test-driver issues. Actual candidate layout defects were fixed separately. Native instrumentation initially counted the silent browser-unlock media as prompt audio; it now measures only the fetched recorded clips. No clean-first-pass claim.
- Production budget initially exceeded by 638 bytes. Removing the redundant legacy branch restored the established 550,000-byte gate without increasing the budget.
- Whole-game completion and actual media checks are separate from physical speaker/microphone/Pencil acceptance. WebKit tablet-sized automation does not establish real iPad acceptance.

Final source gates pass: **1,299 units**, TypeScript, repository lint and required formatting, with production startup **549,992 / 550,000 JavaScript bytes** and **46,342 / 60,000 CSS bytes**. The final 36 interaction cases pass; 42 full-game completions pass within the broader 75/78 candidate run, whose three reentry failures were corrected by the separate 36-case rerun. The 15 Wetland cases pass. The initial final-unit rerun also found a source-format assertion requiring one-line JSX; its whitespace matcher was corrected and the complete 1,299 suite rerun passes.

**Nine native-audio cases pass** across Chromium and both WebKit layouts: slower Sushi replay, silent Context Gap with cancellation on Exit, and Mandarin before recording with English synthesis unavailable. The native observer was additionally made idempotent because WebKit re-entered the initialization script; the earlier duplicated-event failures are retained.

Publication/hosted verification will be recorded here after deployment.
