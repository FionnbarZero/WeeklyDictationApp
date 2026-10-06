# A1: confirmed family game saving

October 6, 2026. Implemented and locally verified on `codex/a1-confirmed-game-saving`; ready for GPT-6 Astra High review, with CI still required. Not merged or published. No production accounts, records, authentication configuration, security rules, or hosting were changed.

## Reproduced defects

Baseline: main `843b233dd86d376f4680277cdb98305f95f1b0ec`. The regression-only revision `5eef762` uses the existing production `family-sync` packager, synthetic family fixtures, and the canonical host's `.html` → extensionless redirect.

- A completed Grade 5 Memory Lanterns game closed without storing a result on the canonical route. The regression expected one result and found zero.
- A simulated ledger-write failure after a successful outbox write left the game open, but retry generated another attempt ID and completion time rather than confirming the pending attempt.

The first failure came from identifying the outer family page by its URL suffix. Clean-URL hosting removes that suffix; `savePreviewResult` then returned `null`, which outer game completion ignored. Embedded activities could still enable family mode through their query flag, explaining the inconsistent behavior.

The second failure came from generating a result ID during each completion callback instead of assigning one when the game started.

## Repair boundary

- Family entry pages declare their role explicitly. Embedded activities require the build flag, their activity role, the embedding request, and a same-origin family parent. A query flag alone no longer enables family behavior on unrelated or standalone pages. These markers are routing context, not authorization; server security rules remain authoritative.
- A launched outer game owns one attempt ID. Retries reuse that ID; a separately launched game receives another ID.
- Completion closes the game only after a non-null result is read back from the existing durable device ledger. Missing child context, thrown storage failures, and unconfirmed writes show the existing retry guidance and retain the completed game.
- Partial-save retries recover the existing pending record, including its original timestamp. A reused ID with different child, grade, activity, channel, target-set provenance, or score is rejected without overwriting the record.
- The release-identity HTML injection preserves body attributes, so the explicit roles survive packaging without removing release metadata.

No stored schema, storage key, curriculum, scoring rule, or game-tier policy changes. The existing durable outbox still handles subsequent online synchronization. Device confirmation is not a promise that an upload has already succeeded.

## Verification

Application repair: `abb6ebc`. Browser-tested package source: `61ca9c652646acc991aa41e3530c2bbe097abd2c`. Its 122 recorded files were independently hash-verified against manifest tree SHA-256 `bed24cb8d4295340aff1258ddcd887328b777826afd8230ab06bcce7759b5fb4`. The subsequent acceptance-record commit changes only documentation; CI must rebuild and test the final PR head.

| Check | Result |
| --- | --- |
| Typecheck, repository lint/format, focused new-file checks, whitespace check | Passed |
| Complete unit suite | 636 passed |
| Exact family-sync package, desktop and Chromium tablet-touch layout | 28 passed |
| Existing cross-grade reconciliation regressions | 44 passed |
| Standalone prototype routes, activity exits, and visual references | 32 passed |
| Additive production-intended family policy, synthetic Firestore emulator | 2 scoped tests passed |
| Production dependency audit | No vulnerabilities |
| Development tooling audit | Existing bounded Firebase CLI exception verified; expires November 4, 2026 |

The packaged browser checks cover all three canonical grade selections, HTML-preserving aliases, packaged grade-entry redirects, selected-child embedded writing results, saved game results after reload, missing child context, partial-save retry identity, readback confirmation, and standalone isolation. All remote requests are intercepted; fixtures contain synthetic identifiers and no real family data.

The emulator loads `deployment/firestore-family-sync.rules`, not the stricter legacy root policy. The two selected family tests exercise results, idempotent retries, immutability, separate clients, interrupted uploads, forbidden payloads, and cross-family/anonymous denial. This does not establish acceptance of every unrelated legacy rule.

The new quality-workflow job builds and tests the exact publication package and runs these scoped family-policy tests. It does not deploy. Reproduce locally with:

```sh
npx playwright test --config playwright.family-sync.config.ts
FAMILY_SYNC_RULES_FILE=deployment/firestore-family-sync.rules npx firebase emulators:exec --only firestore --project weekly-dictation-test "node --experimental-strip-types --test --test-name-pattern='^family ' tests/firestoreEmulator.emulator.ts"
```

The packager requires a clean committed source tree. Do not run another Playwright configuration that clears the parent `test-results` directory concurrently with the family package suite.

## Review and remaining work

GPT-6 Astra High review and the declared Node 24 CI gates are required before merge/publication. Local checks ran on Node 26.8.1; this is not a Node 24 CI pass. Publication requires a separately recorded final artifact, rollback identity, and canonical live verification. No publication was performed; this task has not changed the recorded October 5 production release.

This increment does not complete A2 activity/navigation/reporting pause safety, A3 offline/curriculum/conflict handling, per-target game results, acquisition-game integration, or hosting retirement. The known sync-failure unmount behavior remains A2 work; device save confirmation must not be mistaken for completing that boundary. No claim is made about physical iMac/iPad audio, microphone quality, Safari behavior, or game performance.
