# Grade 2 approved Slay writing integration

## Owner decision — October 15, 2026

Owner selected the working Slay-style comparison B (`33a6191`, hosting version `fc74ec248116afbb`) over Grand Scrolls and explicitly requested embedding that appearance with guided stroke-order teaching and acquisition in Grade 2. The frozen comparison remains unchanged at https://weekly-dictation-staging--slay-acquisition-compare-reevz808.web.app/. It intentionally omits teaching; it is not the integrated build.

## Implementation boundary

- Actual Grade 2 Enter the Dojo → Learn to Write now combines the existing original StrokeTeacher and its per-character saved five-step chain with the approved Slay-style acquisition surface. Every character of a new word finishes teaching before its whole-word acquisition; the next new word opens teaching again.
- New Grade 2 writing-pilot attempts pin the already-approved v7 strategy: one trace, one independent, then the existing expanding distractors/target pattern. The exact policy identity remains pinned. Existing five/six-step and ordinary legacy lessons are not reinterpreted or reset; an already-started ordinary target finishes under its original rules.
- The acquisition surface reuses the comparison CSS verbatim and the existing PracticeView/WritingPad. The teacher source/UI, brush, 25/10-second response windows, audio/replay rules, whole-word scoring and existing correction procedure are unchanged. The existing silent gesture primer runs synchronously on Learn to Write for the pilot, before async loading.
- The owned Grade 2 writing frame occupies the viewport beneath the existing report controls. Exit restores family navigation; Warmup/other grades are not marked. This avoids family navigation shrinking the approved layout. Report pause and frame ownership remain in the existing lifecycle mechanism.
- Initial launch, teaching milestones and answers continue through the existing confirmed atomic writing/workspace path. No new storage schema, cloud adapter, permissions, production feature activation, real-family changes or deployment is included.

This is an actual-app **local pilot integration**, still behind `VITE_GRADE2_WRITING_PILOT`; it is not yet enabled on canonical Ninja Dojo. The old pilot and all hosted reference packages remain separate. New retained output: `writing-slay-integration-dist`; testing uses `playwright.writing-slay.config.ts`, not the older port-5210 reference.

## Verification

Supported Node 24.22: 1,126/1,126 units, typecheck, full lint, production build/performance pass. Initial JS budget 549,823/550,000 bytes, CSS 46,288/60,000; the JS budget has little spare capacity and must remain a release gate.

Six actual-app Chromium cases pass. Two WebKit cases each pass at 1024×768 and 768×1024. Coverage: failed initial save/readback retry; pending-launch alternate-activity guard; both characters of 英雄 through five steps; reload resuming the exact teaching step; one trace → independent → familiar DT with 25/25/10-second displays; repeated trials to 每个 teacher step 1; control/box viewport bounds; Exit restoring the family selector; failed teaching save retaining ink; original six-step saved-policy recovery; report pause preserving the seven-second clue.

The existing old-save fixture initially paired a new v7 envelope with a six-step lesson and correctly failed validation. The fixture now represents a genuine old strategy; no validator was relaxed. Added unit coverage preserves both existing five/six-step lessons and confines new-policy selection to Grade 2/new attempts, including a fresh restart while old records remain unchanged.

Visual inspection caught family-host navigation consuming vertical room; the writing-only viewport host fixes it. Desktop and both WebKit orientation screenshots were inspected. Speech is mocked, and automated pointer drawing is not physical iPad/Pencil acceptance.

## Remaining gates

Independent GPT-6 Astra · Extra High integration/saving review (new approval required to delegate), current-main reconciliation/normal protected integration, retained-package compatibility and isolated real-backend acceptance for this candidate, followed by release authorization/exact publication verification and a bounded physical iPad/iMac check. Prior candidate's cloud/review receipts do not establish acceptance of this new candidate. No new email or publication was requested for this stage. The revised correction protocol remains outside scope.

## Retained candidate identity

Application commit `232be873f1a6a8fe79e3804f977f704a13942f4c`. Dedicated rebuilt package: `writing-slay-integration-dist`. Exact HTML revision plus 115 served entry/manifest files verified at http://127.0.0.1:5218/family-beta-preview.html?grade=grade2. This URL works only on this computer, uses synthetic profiles and browser-only saving, and is **not an owner smoke-test recommendation before independent review**. Existing 5210/5213/5214 and hosted comparison/v8/v7/v4 outputs remain unchanged. No claim of audible real-device sound, physical Pencil acceptance, or new-candidate real-cloud verification follows from the automated checks.

Five additional post-commit retained-package Chromium cases pass on Node 24: launch/readback retries, alternate-activity guard, failed teaching-save retry, pinned six-step recovery and report pause. An earlier post-commit command with a mistyped runtime path was stopped and is not acceptance evidence. Final output is `/tmp/ninja-slay-final-identity-tests-node24`; the full desktop run is `writing-slay-test-results`, and WebKit evidence is `/tmp/ninja-slay-integrated-landscape` and `/tmp/ninja-slay-integrated-portrait`.
