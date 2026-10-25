# Game-content regression audit — October 25, 2026

## Scope and result

Audit of published **Prototype 5 / application `389d2f3d4e3a904e9c1f786b43c5b053c33c68f7`**, compared with retained Prototype 4 / `0189a98`. This audit changes only tests and documentation. It does not repair or publish application code, clear progress, alter teacher documents, or touch the frozen fifth-grade presentation.

No new functional regression has been reproduced in the completed checks. This is a bounded audit of the isolated, retained-curriculum preview, not a claim that every historical issue or authenticated release gate is closed.

## Remaining usability observation

**The matching and Pinyin screens require vertical scrolling.** In Grade 2, Shuriken's large title/art panel leaves cards below the initial viewport, and Dictation's candidate row can extend below the initial screen. This occurs in desktop Chromium at 1366×900 and landscape WebKit at 1024×665. Each card/choice can be scrolled fully into view; the five-character reading target `各种各样的` can be matched and entered correctly. Exit and Report/return remain usable.

The same games already required scrolling on Prototype 4's available Grade 5 route. The predecessor/current screenshots preserve that comparison, and all **22 packaged stylesheet files are byte-identical**. Grade 2's newly enabled content exposes the existing layout; the evidence does not support a new CSS regression or blocked play. A later compact-header/layout prototype could improve the first view. No appearance change was made during this audit.

The five-character word is a retained **reading** target. This check does not add a five-character writing-acquisition target or change the approved writing rules.

## Source and content review

- The catalog covers **149 grade-specific targets / 191 Tier 1/2 occurrences / 20 retained weeks**, with no missing support in those retained occurrences. Meanings, Pinyin, character-choice membership, sentence occurrence and ordered tokens are checked.
- Enrichment requires the exact grade, allowlisted source document and target text. Teacher word identity, tier, order, dates and provenance are unchanged; Tier 3 stays excluded. Existing source language takes precedence in the overlay.
- Saved game packs bypass fresh enrichment. Existing writing checkpoints retain their pinned lesson wording and teaching step. Actual predecessor checkpoints were created through drawing interaction, transferred as synthetic browser state, reopened on Prototype 5, and advanced one further step without changing their pinned lesson.
- The new catalog remains behind the isolated-preview flag. No production or frozen-site change is claimed. This audit did not repeat the unchanged production build; its prior build/size evidence remains in the content handoff.
- Content completeness does not override game eligibility. Three Kindergarten two-writing-target weeks still lack enough choices for Context Gap Dash. Two Grade 2 writing-only weeks cannot independently supply reading/mixed games; the normal earlier-week resolver combines the appropriate retained cohorts. Future unlisted targets still need validated content.

## Fresh verification results

| Check | Result | Evidence |
| --- | --- | --- |
| Full unit suite | **1,261 passed** in one run | `units.log` |
| Full hosted game/recovery/audio matrix, all grades | **90 passed** in one run, 14.9 minutes | `hosted-games.log`; Chromium desktop and WebKit portrait |
| Hosted writing/reading, all grades | **12 passed** in one run | `hosted-writing.log`; desktop and landscape |
| Actual Prototype 4 writing checkpoint → Prototype 5 | **6 passed** | Upgrade cases in `upgrade-and-long-targets.log`; all three grades, both engines |
| Later Grade 2 visit / five-character matching and Pinyin | **4 passed** | Behavior cases in `final-layout-and-rotation.log`; desktop and landscape |
| Predecessor/current layout diagnostics | **4 covered successfully** after correcting a diagnostic assumption | Three passes in `final-layout-and-rotation.log`, final WebKit Dictation pass in `final-webkit-layout.log` |
| Content inventory and identity preservation | **149 targets / 191 occurrences / 20 weeks; no missing retained support** | `content-inventory.json` and full unit suite |
| Hosted package, headers, protected sites and expiries | **Passed** | `verification.json`, `exact-host-verification.log` |
| Application type check; audit-file Biome checks | **Passed** | `typecheck.log`, `audit-quality-final.log` |

The 102 broad hosted cases are clean runs. The ten focused upgrade/long-word cases have passing coverage across the stated runs; this is not a claim of one clean fourteen-case run including the diagnostics. Failed development runs and screenshots below are retained. No application changes were made to obtain these passes.

## Test-development findings retained

The failed audit runs remain evidence; they are not counted as passing application tests:

1. The first new suite passed all six writing-upgrade cases but failed four longer-word cases before interaction. The test incorrectly expected a saved-game iframe attribute on the ordinary game route. The driver now derives the expected pack through the real resolver and verifies its actual visible targets.
2. The next four probes required every card and choice to fit in the initial viewport. All four failed. Screenshots confirmed ordinary vertical scrolling, not inaccessible controls. The original strict probe is retained as `strict-initial-viewport.spec.ts`. The final interaction test separately checks full scroll reachability and successful play; the initial-view concern remains documented above.
3. The first scroll-accessibility run passed three cases. WebKit Shuriken matched correctly but its final Report-button assertion measured 97.22% visibility, corresponding to a one-pixel outer-toolbar crop after scrolling the iframe. The final check allows a bounded 95% visibility threshold and additionally opens Report and returns to the activity. No application layout or guard was relaxed.
4. The eight-case follow-up passed all four longer-word interactions and three layout comparisons. The WebKit Dictation comparison incorrectly required its choices to overflow after focusing the input; they were already in view. The final diagnostic records the measured positions without requiring overflow, and still asserts every control is reachable. This is not evidence of lost functionality.

The temporary command that attempted a nonexistent Prettier executable did not format anything. Repository Biome formatting/linting is used for the final audit files.

## Published identity and protected sites

The combined preview still serves hosting version **`a9627a620942ff3a`**, tree **`16c1952d760df800dc57b6759584f08bd8eb56f9d99e2fd9c99b6fc49070a096`**. All **192 files and 1,152 headers** match the retained package. All three grade entrances return successfully. Expiry remains **November 1, 2026 at 4:35 a.m. Pacific** (`2026-11-01T12:35:46.828557862Z`).

Frozen standalone Grade 5 remains **`1a9db3e34860fa886afa337ad42028d9bfb69014`** with all **183 files / 1,098 headers** verified. Canonical Ninja Dojo remains **`9d06a02f89e0807b202a82316841e25cf8c48c6d`**. The other **18 hosting releases and expiries**, plus this preview's release and expiry, remain unchanged.

No website was created or republished, so no new delivery email was sent. The existing Prototype 5 email receipt is `1a17314c911ab6de`.

## Limits and next device check

The automated runs cover Chromium and iPad-sized WebKit, not a physical iPad. Some cases deliberately control speech/media success or failure; the native recording cases leave hosted audio responses intact. These checks do not establish audible speaker output, native on-screen keyboard behavior, Pencil accuracy, or authenticated cloud/offline/cross-device acceptance. The synthetic old-checkpoint transfer proves compatibility, not cloud synchronization. No independent review agent was used.

The same isolated **Prototype 5 / 389d2f3** remains the device-test build:

- [Kindergarten](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5 — regular curriculum](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade5)

Allow **5–8 minutes** for a physical iPad check: automatic and repeated audio; Pinyin typing with the native keyboard, one incorrect choice and retry; scrolling to lower matching cards; a sentence round; Report/return; and unfinished writing exit/reopen. Check portrait and landscape. Confirm Prototype 5 / 389d2f3 under Parent controls, reopen the same link if necessary, and use Report a problem. Do not clear browser data. Parent editing, automatic curriculum refresh, broader voice/policy work, authenticated saving and canonical integration remain unfinished; this audit does not close them.

## Reproduction and evidence

Use supported Node 24. The new manual audit config is `playwright.game-content-audit.config.ts`; it requires retained `family-beta-artifacts/prototypes/w-combined-0189a98/package` and starts that predecessor on local port 5286. Tests use fresh synthetic contexts only. The current hosted URL is configurable with `CONTENT_AUDIT_URL`.

Original working evidence: `/tmp/ninja-content-audit.G9kQrY/`. Retained evidence: `family-beta-artifacts/prototypes/w-combined-389d2f3/regression-audit-2026-10-25/`. Logs, failed traces, screenshots, content inventory, stylesheet comparison and exact hosting/exclusion verification are preserved. Application source and the served package are unchanged by the test/documentation commit.
