# Kindergarten sound repair — October 25, 2026

The owner authorized fixing the three findings in the [October 24 audit](./kindergarten-sound-audit-2026-10-24.md). They are repaired in the **isolated W-roadmap combined repairs / Prototype 3**, application **`1b3e4f3777233ea6bf6c60fbc07c7792a8d4e817`**. This is a verified working prototype, not canonical integration or physical-iPad acceptance.

- [Kindergarten](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5 — regular curriculum](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade5)

Expiry: **November 1, 2026 at 3:24 a.m. Pacific** (`2026-11-01T11:24:19.953400563Z`). The older W1 `d6ee258` link is not this build.

## Repairs and boundaries

1. Shared word/instruction recordings are fetched as complete bytes and played through temporary per-play Blob URLs using the existing activated audio element. This avoids the hosted media range failure demonstrated in the audit. Failure retains the original speech fallback; voice, language and rates are unchanged. Downloads abort on cancellation; late downloads cannot start after Exit or Report. Object URLs are released after completion or cancellation. Empty, failed and oversized recordings are rejected.
2. Memory Lantern effects decode complete public recording buffers in a per-game audio context. Trusted input resumes the context. Report stops effects and invalidates pending work; Exit releases buffers, listeners and context. Failed fetches can retry. Optional effects never control scoring or progress.
3. Shuriken Match shows a sound-failure message and **Hear again**. Retrying replays the failed card without selecting another card or changing the turn. Memory Lanterns also offers **Hear again**, and tapping an already revealed card replays it without another flip or turn. Both retry controls use the existing large game-button style and measure at least 48 pixels high in the checked tablet layouts.

The behavior remains gated to the isolated W2 preview. All 45 recording files are byte-identical to the predecessor. Teaching, timer, pairing, correction, scoring, saving schemas, curriculum and security/header policies are unchanged. No child recordings are persisted. No real-family records, teacher sources, authentication settings or other hosting channels were changed.

## Verification and retained failures

Behavior source is `e0456f98c6f10b9d7667a2679d10e6a04eed4cbe`; final `1b3e4f3` adds only `className="lg-primary"` to the two retry buttons. Exact source comparison proves that restricted difference. Broader behavior evidence is carried forward with that proof; it is not misrepresented as a fresh full-suite run on the styling commit.

| Check | Result and scope |
| --- | --- |
| Final source/package checks | Type/scoped lint and package build pass on `1b3e4f3`; four visual/tap checks pass in Chromium and WebKit. Buttons are 48px high and at least 114px wide; retry and Exit remain usable. |
| Final audio regression suite | **12/12 local and 12/12 hosted** on `1b3e4f3`. Hosted recording success leaves network responses and native media playback intact, with speech fallback deliberately denied. Denied-download and delayed-download cases are explicitly controlled. |
| Unit and standard build gates | **1,256/1,256** units on behavior source; type/lint/format and default build budgets pass. Initial JS remains 549,980/550,000 bytes and CSS 46,342/60,000 bytes. The final two class additions cannot affect the ordinary preview-disabled bundle. |
| Complete game/recovery matrix | **72 distinct cases have passing coverage** across Chromium and tablet WebKit: initial run 70 passed, two interrupted by host sleep; both exact interrupted cases then passed three times each (**6/6**) without source, assertion or timeout changes. This is not a clean 72/72 single run. |
| Writing/reading | **12/12** fresh all-grade teaching, acquisition, Report/return and ordinary reopening cases on behavior source. Speech is simulated in this suite; it is not physical audio acceptance. |
| Native hosted game walkthrough | **20 visits**, covering three current Ninja Skills games plus all seven Spirit Realm games in each engine. No recorded-media rejection/error; replay and Exit controls resolve. Native speech interruptions caused by Replay/Report/Exit are retained, not counted as format failures. WebKit speech callbacks are not fully observable through this wrapper. |
| All-game failure/recovery | Final **14/14** controlled-denial cases across all seven games in both engines. Visible failures, same-prompt retry and Report pause pass. Initial run was 13/14 because the Chromium Lily driver inspected before its scene/audio callback was ready; a bounded 12-second visible-error wait fixes the driver. Initial evidence is preserved. |
| Negative control | Of the 12 new cases on predecessor `7b33d7b`, seven fail and five pass. Failures show the absent retry controls, same-card Lantern replay and WebKit return-from-Report behavior. The transport cause has separate direct-host/Blob controls in the original audit. |

The interrupted matrix traces align with the system sleep log: clamshell sleep began October 24 at 18:38:18 Pacific; wake occurred October 25 at 04:16:59, a 34,721-second interruption. Both browser calls span that gap. Failed traces and the repeated results are retained.

The final source review and automated checks were performed by the primary agent. No separate independent-agent review or physical-speaker acceptance is claimed. Four current Ninja Skills games remain unavailable where validated lesson content is missing; their available mastered-word versions were audited in Spirit Realm rather than inventing content.

## Publication and handoff

Only Firebase staging channel **`w-repairs-oct23-v1`** was updated. The first verified audio build `e0456f9` used provider version `c7d21026101f1827`; visual inspection then caught the undersized retry buttons before the owner handoff. The final deliberate two-class adjustment was built, checked and published as **`8b5bc5a813140434`**. Both receipts and packages are preserved.

Final tree: `4f5095a0af1b7e53c3cc1fd90eb68671ff93381d7ba2f37582a7225930a4f78f`. All **192 public files / 1,152 headers** match the retained final package. Frozen fifth-grade presentation `1a9db3e` remains exact across **183 files / 1,098 headers**. Canonical `9d06a02`, and all **18 other channel releases/expiries**, are verified unchanged. Existing CSP/security/cache headers and routes were preserved.

All-grade links, exact build, preview status, expiry, checklist and limitations were emailed to the confirmed owner address. Gmail metadata readback confirms **SENT**, receipt **`1a172cef593e7d08`**, with the intended recipient and subject. Opening the Kindergarten link in Codex was queued; this is not claimed as a visible browser interaction.

**Ready for a 3–5 minute iPad check:** automatic reading and replay in Lily Pads/Shadow Strike; tap the same open Lantern twice, then finish a pair; hear Shuriken cards and use Hear again if a failure appears; open Report, return and replay; Exit/reopen and try both orientations. Use Report a problem for feedback. Do not reset browser data or change teacher documents.

Actual iPad speakers, installed voices and touch acceptance remain a device check. This isolated preview uses browser-only test progress and retained lesson data. Authenticated/offline/cross-device acceptance, parent target editing, automatic source refresh, unresolved new mastery/shuffle policies and canonical integration remain unfinished. Keep the frozen standalone Grade 5 site for the presentation.

Evidence: `/tmp/ninja-k-sound-fix.qqmZCN/`, retained under `family-beta-artifacts/prototypes/w-combined-1b3e4f3/evidence/`. Final package: `family-beta-artifacts/prototypes/w-combined-1b3e4f3/package/`. Final release evidence is in `evidence/final-button/`; earlier failures, native walkthroughs, recovery recheck, sleep diagnostics and email receipt are retained in the parent evidence folder. Later documentation-only commits do not alter the served application.
