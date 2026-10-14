# Grade 2 first sync startup repair

Published and verified October 14, 2026. Grade 2 can now earn initial readiness after successful account, game and score checks even when a preserved practice conflict prevents reconciliation. The owner's Chrome session now opens the Grade 2 activity choices on `2f20c6d`; its conflict warning remains accurate and both saved copies are preserved.

## Release identity

- [PR #70](https://github.com/FionnbarZero/WeeklyDictationApp/pull/70) merged as `d364c64146226a4268d3d18e5b2dd5b0e485c8b9`. Its Git tree matches reviewed head `f7cbbd6c58c4e3d696f24a921a323d5b02fea373`.
- Published application: `2f20c6d893ed16842d387a8a6cb0330df99ca78f`; package tree `c74b4b5db8d46f511605a084d8d423c35608d5a48b4dcd1cb61b473e323f65f3`.
- Active version: `97984d5f-0240-4b80-9a2b-2fcc219caf5d`, at 100%. Guarded predecessor recovery `13623163-1103-4f29-85fd-0c47da9e1f52` is retained inactive, tree `21c3facd03cf7a53250551cf5c597c9c9e4d7bc08a04bba77a511c44ca041dc6`.
- Frozen release record: `5d6fe62fb7fbfa79965f116ff32027b33f058b6c6180e9ef842b3660d26e7491`. Packages, hash-bound receipts, journal and execution evidence remain in the repair worktree's ignored `family-beta-artifacts/releases/obs002-first-sync/` directory.

## Repair and acceptance

The earlier OBS-001 fallback required prior child readiness. The observed Grade 2 profile had never earned that marker, creating a startup deadlock. This repair defers only a typed, validated practice conflict while completing the existing authenticated game and result checks. Access denial, invalid records and unsuccessful first-time verification still block entry. Readiness is saved before the UI grants access, and late parent, child or grade changes cannot grant stale readiness.

The pre-fix synthetic regression fails on the unchanged published application. The repaired source passes 1,079 units, 34 packaged startup regressions and all 72 exact-provider desktop/tablet cases, including guarded recovery. Independent Astra Extra High review passes 140 focused units and 13 probes of the actual startup callback. Release/header review passes 83 units; package and frozen-receipt reviews pass. All five [final-head GitHub checks](https://github.com/FionnbarZero/WeeklyDictationApp/actions/runs/38604452136) and 1,079 fresh merged-source units pass. Type, lint, formatting, build/performance and dependency gates pass; the existing bounded tooling audit exception is unchanged.

Live verification confirms 153 public file hashes, 180 header responses and six desktop/tablet grade-entry/report-window cases. Disposable-family checks pass all-grade reviewed progress, fresh-context resume, immutable completion, reload and report pause, plus the exact first-time Grade 2 conflict case and anonymous denial. Cleanup removed each disposable account and its enumerated records: 21 documents before publication and 20 after publication, 41 combined. The logs do not identify which document differed. The reviewed evidence helper records the actual positive cleanup count rather than assuming both runs must create exactly 21 documents; all completion and isolation checks remain required.

One activation initially failed its immediate verification because an AuthScreen asset was unavailable. That failure is retained. Subsequent read-only checks verified the active candidate and all exact files/headers; reconciliation finalized only the local journal. No second activation or recovery activation occurred. Security-policy values are unchanged; the header transition refreshes only fingerprinted asset paths.

The owner's Chrome initially loaded cached `c59a9ee`. After its visible update-ready message, closing and reopening the agent-created app tab loaded `2f20c6d` and displayed the real Grade 2 activity choices. No readiness flags, practice copies or scores were manually altered. No activity answers were submitted in that family. The verification screenshot stays local and is not committed. New reports are preserved; the earlier separately approved clearing of 39 problem reports is not part of this publication. No CAPTCHA, authentication/rules change or real-family reset is included.

## Focused owner smoke test

These are permanent live links on build `2f20c6d`, not previews:

- [Grade 2](https://ninjadojo.meghangames.com/family-beta-preview.html?grade=grade2)
- [Kindergarten](https://ninjadojo.meghangames.com/family-beta-preview.html?grade=kindergarten)
- [Grade 5](https://ninjadojo.meghangames.com/family-beta-preview.html?grade=grade5)

Spend 2–3 minutes on Grade 2 first. On iMac, open or resume one lesson, complete one reviewed answer, open/close Report a problem, and reload to confirm that reviewed progress remains. Check one spoken prompt/replay. On iPad, briefly check touch/handwriting and microphone comparison if using a recording activity. Save findings with Report a problem for the session-end batch; no full-app audit is requested.

Chrome is left open on the updated Grade 2 page. On another device, wait for the update-ready message, pause any activity, close all Ninja Dojo tabs, then reopen and confirm `2f20c6d`. Do not clear browser data. The preserved conflict warning can remain while local practice continues; this release does not claim that every conflict has reconciled.

Physical audio, microphone and touch acceptance still require that brief device check. Broader stroke-guide coverage, full Spirit Realm integration and Grade 5 session-only Warmup remain known limitations. Persistence follow-up uses GPT-6 Astra with Extra High reasoning; routine release work uses GPT-6.1 Sol with High reasoning. Do not start a competing plan or reopen declined CAPTCHA work.
