# W1 curriculum and activity entry — October 23, 2026

## Scope and status

The owner requested W1 without routine approval prompts. This follows the detailed W1 curriculum/entry checklist in the primary roadmap, not the recent shorthand that incorrectly grouped parent target editing into W1. The parent target editor remains separately approved W0c prototype work. The standalone Grade 5 presentation and canonical family app remain frozen/unchanged by this work.

Implementation is in the existing managed worktree on `codex/w1-curriculum-entry`, based on `911ba28` and W0 application `711c389`. This is one combined **W1 curriculum and activity entry / Prototype 1**, carrying W0's latest correction and long-session repairs. It is synthetic browser-only testing, not authenticated cloud integration or canonical release. Working-interaction acceptance and the existing independent integration, authenticated compatibility/recovery and protected-release gates remain.

## W1 checklist

- **Instruction labels:** preserve exact source vocabulary/order/tiers; filter only the known “stroke order” resource heading, including a heading split across Slides text runs. Unknown English labels, including STROKE alone, remain visible to validation rather than being guessed away. The October 13–16 Grade 2 cohort remains 走、最、哪里、家、住.
- **Invalid pinned lessons:** an explicit “Use corrected lesson · keep old work” action is offered only for an unfinished Grade 2 lesson whose sole target difference is removal of the known resource label. The same-week replacement must be canonical and have all guides. Re-read current saved state, verify owner/identity and exact envelope/source equality, then add one immutable retirement marker. Never rewrite/delete previous checkpoints, responses, scores or reports; ordinary Writing starts the corrected edition. Unrelated teacher edits and valid pinned lessons do not use this repair.
- **Activity entry:** preserve the existing source-aligned Kindergarten Writing characters / High-frequency words fixes. Re-run ordinary all-grade writing/reading entry, repeated exit/re-entry, scheduled activation and report pause against the combined artifact. Reading is independent of writing-resource availability. No timer, scoring, correction or mastery policy changes belong to W1.
- **Resources:** executable inventory `scripts/audit-writing-resources.ts` records the exact retained source hashes, every week/word, guide availability, Kindergarten recorded-audio availability, pinyin/meaning gaps and current-date selection. Unit checks require every retained writing word's guide and every Kindergarten recording file. Missing supporting language remains separately visible W4 content work, not a reason to substitute or silently omit teacher words. Mandarin speech fallback is not evidence of audible physical-iPad playback.
- **Reports:** inherit explicit module/section/phase attributes through nested game shells; prefer visible launch errors over the underlying game; label paused/discard surfaces. Navigation clears stale launch context. Save real reports in browser tests, verify actual game/build attribution and Report pause/resume. Only whitelisted diagnostic attributes are collected, never input values, page text, handwriting or recordings.

## Safeguards and review

The corrected-attempt interaction is lazy and enabled only by `VITE_W1_CURRICULUM_PREVIEW`. Default production does not expose it. The immutable retirement mechanism and existing storage bounds are unchanged. A stale writer, wrong owner/source, missing guide, failed write or unconfirmed readback cannot erase original work. Tests exercise those refusals and confirm original record bytes are unchanged by the correction. A browser fixture seeds the historical invalid checkpoint through the real reducer, then exercises the visible correction action and ordinary Writing route in Chromium and WebKit.

Primary source/automated review only; no new independent-agent review is claimed. The architecture boundary test explicitly includes the narrow repair helper; no broad allowlist weakening or budget increase. The first browser fixture used the source-neutral projection rather than Grade 2's actual legacy projection; corrected the fixture to use the same importer as App. A Memory Lanterns assertion was corrected to its catalog ID `memory-flip`. Neither test-driver correction changed teaching behavior or removed an assertion.

## Verification before publication

The same test site includes an optional Grade 2 entrance `?grade=grade2&example=curriculum-repair`. It creates only the separate synthetic `w1-label-example` learner, using the real importer/reducer and validated retained source. It never reseeds or resets existing work and refuses a changed source fixture. Normal grade entrances retain their original learners. This makes the historical repair button directly testable on an iPad without importing/resetting records. It is gated off outside the isolated W1 build and whenever Firebase accounts are configured.

Initial full suite: **1,225 unit tests passed**. Focused W1 browser suite: **10/10 Chromium/WebKit cases passed**, including persisted problem-report metadata. Type/lint/format and build/performance checks pass; the production limit remains 550,000 initial JavaScript bytes and 60,000 CSS bytes. Final packaged regressions, publication verification and email receipt are appended below when complete; local passing tests alone do not establish any hosted change.

## Final publication and regression evidence

**Application source `47ac4510be61edbf32a2d2d794a85043f8b207b2`**, W1 curriculum and activity entry / Prototype 1, is published at one isolated origin:

- [Kindergarten](https://weekly-dictation-staging--w1-curriculum-oct23-v1-f2pjajxg.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--w1-curriculum-oct23-v1-f2pjajxg.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5 — regular curriculum](https://weekly-dictation-staging--w1-curriculum-oct23-v1-f2pjajxg.web.app/family-beta-preview.html?grade=grade5)
- [Optional Grade 2 correction example — separate synthetic learner, same site](https://weekly-dictation-staging--w1-curriculum-oct23-v1-f2pjajxg.web.app/family-beta-preview.html?grade=grade2&example=curriculum-repair)

Expires **October 30, 2026 at 11:54 a.m. Pacific** (`2026-10-30T18:54:10.676801549Z`). Firebase version `f13bf43d5e44f84b`; artifact tree `61512c5188e50a9954214c6f412b142606b94a2021b063445e0a18058e8ca264`. All **191 public files and 1,146 security/cache headers** match. All three grade entrances are reachable. Later documentation/test-driver commits do not change this served source or rebuild the artifact.

Final checks:

- **1,227/1,227 unit tests**, no failures/skips; type/lint/format pass. Production initial JavaScript **549,980 / 550,000 bytes**, CSS **46,342 / 60,000 bytes**. Limits were not increased; JavaScript has only 20 bytes of headroom, so future changes must rerun this gate.
- **33 local W0 browser cases** on `d1268e5`, covering all three grades and desktop/portrait/landscape; **12 final W1 cases** covering Chromium and iPad-sized WebKit. The remaining source changes improve repair touch size/current-date eligibility and report-alert precedence, not writing policy.
- **34 final hosted cases against the exact `47ac451` release**: 22 W0 desktop/portrait plus 12 W1 Chromium/WebKit. These include ordinary writing/reading launch/re-entry, guided teacher/acquisition, repeated Grade 2 correction, report pause/return, ordinary resume, crossing 500 saved answers without lost scores, protected invalid-lesson repair and real persisted report attribution.
- The first hosted W1 run passed 11/12. Its failed test clicked Enter the Dojo in the old iframe before the repair's deliberate reload completed. The error snapshot showed the healthy corrected overview. The driver now waits for the old repair action to disappear; the full 12-case rerun passes without an application change, weakened timeout or removed assertion. Formatting/import organization changes after that run affect only the test file.
- Final resource inventory: **20 retained weeks / 93 writing entries**, all guide-covered. Kindergarten 7 weeks/20 entries, recordings 20/20; Grade 2 7 weeks/43 entries; Grade 5 6 weeks/30 entries. Supporting-catalog meaning/Pinyin gaps: K 17/17, G2 25/37, G5 15/21 respectively, explicitly retained as W4 work. Inventory uses the exact retained source hashes and scheduled date selection. Speech mocks establish control flow, not audible physical-iPad sound.

Preservation checks: frozen standalone Grade 5 `1a9db3e` **183 files / 1,098 headers**, older Grade 5 preview `97c559d` **184 / 1,104**, W0 Prototype 2 `711c389` **187 / 1,122**, canonical manifest `9d06a02`, and **all 17 prior hosting channels' release/expiry values** are unchanged. The publication used a new isolated channel only, with no live deployment, family-record reset, teacher-source write or hosting retirement.

Retained package and generated evidence: `family-beta-artifacts/prototypes/w1-curriculum-47ac451/`, including publication verification, resource inventory, unit/build checks, local/hosted logs and screenshots. Original run directory: `/tmp/ninja-w1.OZyRd8`. Primary source/automated review only; no new independent-agent review is claimed.

## Owner handoff and remaining gates

Owner email to the previously confirmed address is **confirmed SENT** by Gmail metadata readback, message/thread **`1a16a22f0b2ab5fc`**, subject “W1 ready to test — all-grade Ninja Dojo links (47ac451)”. It includes the exact links/build/expiry, optional correction example, limitations and frozen presentation link. No child records or credentials were included.

**8–12 minute physical-iPad/Safari checklist:** open/exit/reopen Writing and Reading; test automatic sound/Hear, finger/Pencil and both orientations; open Report and return; exit mid-writing, reload and open ordinary Writing to resume; check a Memory Lanterns report names the game. Optional repair example: tap “Use corrected lesson · keep old work”, wait for refresh, then Enter the Dojo → Learn to Write; first character 走. Normal preview learner records remain unchanged by the example.

This closes W1 implementation/automated verification **in the isolated candidate**, not canonical release. Working-prototype approval and existing independent integration, authenticated compatibility/backend/recovery and protected-release gates remain. Browser-only synthetic progress is not cloud/cross-device saving or offline installation; the snapshot does not automatically refresh teacher documents. Parent target editing remains W0c, wider supporting content W4, and incomplete games/tests may restart. No physical sound/Pencil acceptance is claimed.

The Monday October 26 presentation must continue using frozen [5th grade Dojo](https://5thgradedojo.meghangames.com/) `1a9db3e`, with its approved eight-word presentation lesson. The W1 Grade 5 link intentionally uses regular retained curriculum and must not be substituted for that presentation website.
