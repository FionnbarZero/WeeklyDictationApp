# OBS-001 startup and sync repair — published October 14, 2026

## Verified release

- Source integration: [PR #69](https://github.com/FionnbarZero/WeeklyDictationApp/pull/69), final reviewed head `69c5b89b4a46f549962e10a36816db70e9708fe1`, merged as `dbc8a1a026d0f22f83c647987316921bb0da3e5c`. The merge and reviewed head have identical Git trees.
- Exact published application: `c59a9ee41c5fa84fbea1f4bb3152644a0ac849e6`; later PR changes are tests/documentation only. Package tree: `d7bf912bfe662c5dcdf72a0d7562481f9294c7e3542ba1cb2ba96047ca5856f8`.
- Active canonical version: `c5c2ad85-e607-480e-8377-dc157ae9be72`, 100% traffic. Guarded E2 recovery `a63cd660-c860-4640-a911-1467b5f28d0b` is retained inactive; recovery tree `852c10ea0e638655f5185bfcc08a2b520ea6e134f954c4792e45a6fbb2ceeb22`.
- Immutable release record: `8be092e0fb2898f98b572f2ae9535996adfe5575e3db7c7f6c9645981aae5057`. Retained packages, hash-bound receipts, journals and execution logs are in the repair worktree's ignored `family-beta-artifacts/releases/obs001-durable-ack/` directory.

## Changed behavior and protection

Previously confirmed matching parent/family/child/grade access may continue local practice when an ordinary two-copy practice conflict blocks online reconciliation. Both copies remain preserved and syncing status is explicit. Denied access, mismatched/unconfirmed caches and invalid nested records remain gated. Nested partitions are validated across the complete remote response before reconciliation.

A separate pre-existing P1 could advance a staged download's baseline before the atomic workspace commit. If a later conflict aborted that commit, retry could overwrite newer online practice with older local data. Both download branches now acknowledge only after a successful durable commit; confirmed uploads and already-durable equal copies retain immediate acknowledgement.

No CAPTCHA, authentication/provider/rules change, real-family reset or retention deletion is included. Reports remain batched on their originating device. Recordings and provisional handwriting remain temporary.

## Acceptance and retained failures

- All five checks on final PR head passed: [run 38587883837](https://github.com/FionnbarZero/WeeklyDictationApp/actions/runs/38587883837).
- 1,079 fresh merged-source units; type/lint/format/build/performance and dependency gates pass. Initial JS remains 546,027/550,000 bytes; production audit reports zero vulnerabilities, with the existing time-bounded tooling exception retained.
- 64/64 exact-provider desktop/tablet cases and 30/30 repeated writing cases pass without retries/skips. Source re-review independently passes 86 focused units and four post-commit acknowledgement-failure probes; release/header review passes 83 tests. Package, receipt and fixture reviews pass.
- Canonical live verification confirms all 153 public file hashes and 180 header responses, plus six desktop/tablet grade-entry/report-window cases. All-grade real-backend reviewed progress, fresh-context resume, immutable completion, reload, report pause, startup-conflict copy preservation and anonymous denial pass. Each accepted prepublication/live run removed its own account and 21 test documents; real-family records were untouched.
- Earlier failed/partial runs remain recorded: transient-status expectation, missing predecessor worker-control setup, bounded installation waits, and the standalone writing test's enabled-check/disabled-at-click race. Tests now establish actual readiness/control without removing data/scoring assertions. Failed runs are not relabelled as passes.
- A single activation initially failed its immediate manifest check during propagation. Read-only inspection subsequently verified the active candidate, exact assets and headers. Reconciliation finalized only the local journal; activation was not repeated and recovery was not activated. Security-policy values are unchanged; the reviewed transition only refreshes fingerprinted asset cache paths.

## Owner smoke test — 3–5 minutes, live build c59a9ee

These are the verified permanent live links, not previews:

- [Kindergarten](https://ninjadojo.meghangames.com/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://ninjadojo.meghangames.com/family-beta-preview.html?grade=grade2)
- [Grade 5](https://ninjadojo.meghangames.com/family-beta-preview.html?grade=grade5)

Pause any unfinished activity, close all Ninja Dojo tabs, and reopen the appropriate link. Confirm the badge says `c59a9ee`; do not clear browser data. Updates deliberately do not replace an active lesson's engine.

On the iMac, open/resume one Grade 2 lesson, complete one reviewed answer, open/close Report a problem, then reload and confirm that reviewed progress remains. Check one spoken prompt/replay while there. On the iPad, use the same parent account, confirm saved progress is available and check a normal touch/handwriting action; briefly check microphone comparison if using a recording activity. Stop after this bounded check and keep any findings in Report a problem for the session-end batch.

Physical sound, microphone and handwriting acceptance cannot be established by automated Chromium cases. Broader stroke-guide coverage, full Spirit Realm integration and Grade 5's session-only Warmup remain limitations; this handoff is not a request to audit every game or revise teacher documents. Follow-up persistence work uses GPT-6 Astra · Extra High; routine release work uses GPT-6.1 Sol · High.
