# Family syncing and canonical app release

The owner approved secure family syncing on October 5, 2026, while preserving existing records and keeping sign-in parent-only. This release is now live. Application source is `ef9d1f75df7046152c4829e8f7cfca635f303461`, committed and pushed on `codex/family-beta-reconciliation`. Main was not merged. Deployments use the exact tested artifact, not an assumed latest-main build.

## Destination and preservation

The maintained family entry point is `https://ninjadojo.meghangames.com/`. Its three grade links use one origin and one parent session. Firebase project `weeklydictationapp` stores family-owned scores and practice; Cloudflare serves the app. The Cloudflare Worker has no database bindings. Live version is `8d6c4b13-a23e-44ad-bbd4-9dcf79aadd64`; rollback is `a525a8e6-943c-49eb-adc0-1e6eac029ff5`. No DNS or binding changes were needed.

The homepage initially received direct links to the existing grade apps in Worker version `3d9cf3eb-5e9a-4421-a8f6-d0c951d0a54b`; its prior version is `5d1f2f52-b5c2-46e5-a33c-132bfffbf83c`. After live family acceptance, homepage version `4c2fc8c6-50a1-42db-aae8-71d9d86fc9e9` published three canonical links: `/?grade=kindergarten`, `/?grade=grade2`, and `/?grade=grade5` on the Ninja Dojo origin. Other projects, artwork and layout remain intact.

Existing grade addresses were updated using the same tested JavaScript/CSS assets, without redirecting away from their local storage:

| Origin | Live release | Retained previous release | Artifact tree SHA-256 |
| --- | --- | --- | --- |
| Ninja Dojo | Cloudflare `8d6c4b13-a23e-44ad-bbd4-9dcf79aadd64` | `a525a8e6-943c-49eb-adc0-1e6eac029ff5` | `43dcb966c7f257428ddb3424f5f51eb91c65c6a5070011b6058ec042d3d2d7cc` |
| Kindergarten Firebase | `1cdad369b59f20cd` | `08c2e412a3095227` in `rollback-before-family-sync` | `b77c3220415384d8451df9533cb33d477f71151f8caf2c7c393ebd21c7ba6577` |
| Grade 2 Pages | `7a3278ca26725702dbc7ce4204b0d1318db17e74` | Parent commit `0b499f86676dcffe4a62fcf4173a8a32402d039a` | `c6111eaa67958c57d92c6c9b53d4a948aa8f87fca93e1010981b42fce067c640` |
| Grade 5 Firebase | `5487998f698eb099` | `424b6a63322ed355` in `rollback-before-family-sync` | `a01f7ef40dc87e6436a6cc3b1ff93faac0f2f6460fba8951680c392519752a7b` |

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

- All 635 unit tests, type checking, lint and repository format checks passed before release.
- All five new acquisition reload browser scenarios passed, including a Grade 2 teacher week containing reading targets.
- The repository database emulator suite passed 10 tests. The exact additive production policy separately passed five family/isolation tests, including sequential two-device recovery and conflict preservation.
- All 44 grade browser regressions passed, including both Grade 5 Boss rounds after fixing overlapping review controls and nested scrolling.
- The family-sync build now explicitly includes the family entry page; previously the new build mode omitted it and an unknown URL could fall back to the old Grade 2 screen. Packaged standalone routes now enter the parent-authenticated wrapper while embedded activity routes remain intact.
- Desktop and iPad-style entry navigation and homepage link layouts passed. The public files (120 per origin) matched their exact manifest hashes across canonical Cloudflare, both Firebase aliases and Grade 2 Pages.
- Fresh-browser navigation from the published homepage passed for every grade, and each old grade root opened the updated parent sign-in screen. Report and end-of-session batching controls remained available. No browser page errors occurred on these public-route checks.

Authenticated acceptance against the production backend passed on the exact packaged build and again on `https://ninjadojo.meghangames.com`, using a new synthetic parent and three synthetic children: sign-up, second-browser sign-in, completed score recovery, exact unfinished acquisition recovery, all three grade hubs, and denied anonymous access. All synthetic records and accounts were removed afterward; no real family records were accessed or changed.

Physical iMac/iPad sound and microphone quality still needs family testing. A parent must sign in and identify their children; the release process does not use or invent the parent's password.
