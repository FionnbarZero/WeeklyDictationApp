# Family syncing and canonical app release

The owner approved secure family syncing on October 5, 2026, while preserving existing records and keeping sign-in parent-only. This release is being validated and is not yet the live grade release. The homepage link correction is live; application and database publication will be recorded here after verification.

## Destination and preservation

The maintained family entry point will be `https://ninjadojo.meghangames.com/`. Its three grade links use one origin and one parent session. Firebase project `weeklydictationapp` stores family-owned scores and practice; Cloudflare serves the app. The old Cloudflare Worker has no database bindings. Its rollback version is `a525a8e6-943c-49eb-adc0-1e6eac029ff5`.

The homepage initially received direct links to the existing grade apps in Worker version `3d9cf3eb-5e9a-4421-a8f6-d0c951d0a54b`; its prior version is `5d1f2f52-b5c2-46e5-a33c-132bfffbf83c`. Those links will point to the consolidated family app only after the new app is verified.

No child data is reset or automatically reassigned. Device-only histories remain at their original origins. Parent controls provide a private export of explicitly scoped app records, excluding authentication storage. Importing those histories into an online child requires a deliberate identity mapping. Problem reports remain local and can still be emailed in a batch. Voice recordings are never included in saved checkpoints or syncing.

## Saving behavior

Kindergarten and Grade 5 writing and all three ordinary reading acquisition paths use the existing grade-owned engine and validated checkpoint contract. Each reviewed response saves the next unfinished prompt and response history. Reloading restarts only that unfinished prompt. Done for today preserves the teaching position and starts a separate score on the next visit. Completed scores have stable IDs to prevent duplicate submissions after reload.

Grade 2's existing browser activity state and the family mastery records are also eligible for authenticated syncing. Server version preconditions protect concurrent writes. If both devices change the same record, neither copy is silently overwritten. Remote changes do not replace an open activity's state; the activity must close before hydration. This supports sequential use, not simultaneous cooperative editing.

Stroke Order, Whispering Scrolls, and explicit whole-set Dojo reentry retain their existing integration gaps; this release does not claim that all game acquisition paths have checkpoint continuity.

## Security release boundary

Production rules differ from the repository policy. Do not deploy the entire repository rules file over them. `scripts/prepare-family-sync-rules.ts` verifies the exact current baseline and inserts only the `betaResults` and `betaPractice` collection rules. It fails if the baseline changes and proves all other source text is preserved.

Rollback ruleset: `projects/weeklydictationapp/rulesets/5e26d078-a646-4def-9820-da43a02b74b8`. Baseline SHA-256: `8f5d9b2716d9530bc7ecad9bfc1251756a6f89243211ced9a934ea6f1d140d40`.

The additive policy is now published as `projects/weeklydictationapp/rulesets/a69cfc5b-abdd-4eb2-81ce-9ecdf129cd72`, with verified SHA-256 `8df044049f7c973d1bf0387492ae6534e7758c8c12c5b2b5c7790b85fd54470b`. Its exact source is `deployment/firestore-family-sync.rules`; use `firebase.family-sync.json` for this policy, not the root Firebase configuration. Existing email/password authentication was already enabled. The canonical domain and existing grade domains were added to authorized domains without removing existing entries; anonymous sign-in remains disabled.

Two stricter legacy acquisition/Warmup validation tests from the repository do not pass against the pre-existing production policy. Those unrelated rules were deliberately preserved, not silently upgraded in this release. The new family collections have their own owner isolation, immutable-score, versioned-write, interrupted-upload and concurrent-device tests. This release is not a claim that the entire legacy database policy matches the newer repository policy.

## Validation

- 634 unit tests passed before release packaging, with an additional completed-teaching resume test also passing; final full-suite count will be recorded below.
- All five new acquisition reload browser scenarios passed, including a Grade 2 teacher week containing reading targets.
- The repository database emulator suite passed 10 tests. The exact additive production policy separately passed five family/isolation tests, including sequential two-device recovery and conflict preservation.
- Full browser regression, authenticated browser acceptance, exact artifact publication, and live verification remain release gates.

Authenticated acceptance against the production backend passed using a new synthetic parent and three synthetic children: sign-up, second-browser sign-in, completed score recovery, exact unfinished acquisition recovery, all three grade hubs, and denied anonymous access. All synthetic records and the synthetic account were removed afterward; no real family records were accessed or changed.

Physical iMac/iPad sound and microphone quality still needs family testing. A parent must sign in and identify their children; the release process does not use or invent the parent's password.
