# Shuriken cards and Ninja Skills menu cleanup

October 14, 2026. The owner requested easier fixes alongside the separate writing integration and confirmed GPT-6.1 Sol with High reasoning for this slice. These changes address reports `c6bf6a3e` (card presentation), `6f779ea7` and `e6f668cb` (standalone Sky Writing in Ninja Skills).

## Changes

Shuriken Match cards now devote their content area to larger Chinese words and English meanings. The repeated “word seal”/“shadow meaning” labels and speaker icons are removed. The existing tap-to-hear handler, accessible audio instructions, languages, matching, timer and saved-result behavior are retained.

The shared canonical Ninja Skills menu no longer adds standalone Sky Writing for Kindergarten, Grade 2 or Grade 5. Its writing input, acquisition use, retained results and development harnesses are preserved. This slice does not change teaching rules or the matching-game data policy.

The isolated branch starts from current main `d364c64146226a4268d3d18e5b2dd5b0e485c8b9`. It changes only the shared family hub, Shuriken component/styles and two assertions in the existing game-policy browser suite. The Grand Scroll checkout and its writing files are untouched; its later integration should include this compatible change from main.

## Verified local candidate

- Application/test commit: `6667b60145a31d118b9d90f5bec05b8fa6d19901`.
- Retained exact package tree: `7aaaedd1035fbdd143aee3048afded18922228c6f1a70588104101760688312e`, with 155 manifest files.
- All 1,079 unit tests, typecheck, lint, configured formatting, build/performance and dependency gates pass. Initial JavaScript remains 546,027/550,000 bytes and CSS 42,745/60,000 bytes. The existing time-bounded tooling audit exception is unchanged; the production audit reports zero vulnerabilities.
- All 12 exact-package desktop/tablet cases pass without retries or skips: six canonical menu cases and six complete reviewed Shuriken rounds across the three grades. Existing checks cover tier selection, report pause and completed results.
- Separate visual inspection verifies all 16 card labels fit at 1280, 1024 and 600 pixel viewport widths; minimum English sizes are 22.4, 20 and 16.8 pixels respectively. Card screenshots and generated logs remain in ignored `family-beta-artifacts/releases/w4a-game-polish/`.

## Publication and blocked live acceptance — October 14

PR #71 merged as `2f4d336f549af25192656d84fd52df5c76d8a1d8` after all five final-head checks succeeded. The merged runtime is unchanged from `6667b60`; 1,079 fresh merged unit tests pass. Independent source, preparation and immutable-record reviews pass. Prepublication all-grade disposable-backend acceptance passes, with its account and 20 documents removed.

The reviewed exact package is active on `ninjadojo.meghangames.com` as Cloudflare version `f88884c3-a8fc-4494-a9a0-961da0d49f85`, with guarded recovery `d528950a-d0f4-45b7-87f5-011acf46d5ac` retained inactive. Record SHA-256: `a98765ca50d23fc60634b2021683397954ce376f67c81f9033f0bf46ad0dd0a9`. The immediate activation verifier failed one asset comparison; a subsequent read-only provider/file/header verification passed, and the supported reconcile command finalized the existing journal as activated. No duplicate upload, activation or rollback occurred. Live verification passes all 153 public files, 180 header responses and six anonymous grade-entry/report cases.

**Full live acceptance is blocked, not passed.** The original live driver and an independently reviewed diagnostic-only copy both pass Grade 5's full saved round, report pause, second-device resume, immutable result and reload. Both stop at Grade 2's embedded Ninja Skills entry. Each run cleaned its disposable account and 13 test documents; no real-family records were changed. The original failure, diagnostic output and cleanup receipts remain separate and unmodified under `family-beta-artifacts/releases/w4a-game-polish/evidence/`. The frozen release record and original acceptance helper remain unchanged; no final successful execution receipt was produced.

Read-only diagnosis of the public Grade 2 source, payload hash `c99b3b814be2c1d8ed7b92ba0e34ad0ea82dd3eb073158bcb7fe01c99f153e16`, reproduces the failure even from empty local state. Seven weeks validate; a future October 19–23 slide has no confident Tier 1 section. The shell excludes it, while `hydrateAutomaticGrade2Curriculum` rejects every dataset when any error outcome exists and misleadingly reports a conflict with browser lessons. Relevant loaders, parser, curriculum code and application entry are byte-identical in predecessor `2f20c6d` and W4a. An independent GPT-6 Astra · High review reproduces this offline and confirms that rollback would not repair the cause.

Next: pull forward only the existing W1 curriculum-entry repair, preserving genuine source conflicts and saved progress, then repeat affected package and blocked live acceptance. GPT-6.1 Sol · High is the bounded-repair assignment; stage confirmation was requested. Do not edit teacher documents, clear data, bypass the embedded menu check, or invite owner smoke testing. The separate `strokeorder` vocabulary issue remains tracked in W1. Current primary-checkout ROADMAP/STATUS contain the integrated queue; historical pending-publication notes below are superseded by this section.

## Historical next gate

Independent GPT-6 Astra with High reasoning review is required before release. Verify the final PR checks, integrate through protected main, prepare the exact candidate and guarded recovery, then publish and verify the canonical build under existing standing release authority. No production authentication/security or record reset is part of this slice.

This candidate is not published. The last verified live application remains `2f20c6d`; it must not be used to test these unpublished card/menu changes. After publication, request only a short Shuriken-card/tap-audio and Ninja Skills-menu check on iMac/iPad. Physical sound and touch acceptance remain separate from the automated checks. Layout/scrolling, Lanterns recovery, broader Spirit Realm and the ongoing writing work retain their own scopes.
