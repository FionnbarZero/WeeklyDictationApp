# Frozen prototype baseline

## Purpose

This baseline is the permanent reference for the prototype applications approved before the application-shell refactor. It provides two protections:

1. The Git tag and packaged static build answer, “What did we originally approve?”
2. The routes, browser tests, and visual snapshots retained on later branches answer, “Did today’s refactor change it?”

The archive is evidence, not a production release. It does not activate a curriculum source, add persistence, or make a grade production-ready.

## Baseline identity

- Untouched pre-freeze reference: commit `b1787f3` (`Merge PR #37`), including the completed Grade 5 reacquisition preview.
- Freeze branch: `chore/freeze-prototype-baseline`.
- Reserved immutable tag: `prototype-baseline-2026-10`.
- Only approved behavior correction: the Kindergarten Sky Writing exit callback must return to the hub instead of passing the React click event into status rendering.

On 2026-10-01, before the correction or any freeze infrastructure was added, the untouched reference passed 484 unit tests, the production build, 14 Playwright tests, and 7 Firestore Emulator tests. The Emulator run emitted only the expected permission-denied logs from rejection tests and the existing unauthenticated CLI warning.

The completed freeze candidate passed 484 unit tests, the normal production build, all 37 development-server browser tests, all 23 archived-static-build browser tests, both public-preview browser tests, and all 7 Firestore Emulator tests. The five selected visual references were inspected after capture. The Emulator run continued to emit only the expected permission-denied logs from rejection tests and the existing unauthenticated CLI warning.

## Frozen route inventory

| Route | Frozen input | Approved behavior | Persistence boundary | Known limitations |
| --- | --- | --- | --- | --- |
| `/grade5-learning-hub.html` | `tests/fixtures/grade5-presentation.json` | Four Learning Hub paths; Tier 1 writing and Tier 2 reading for Acquisition, both Test Review cycles, and cohort-specific Spirit Realm reacquisition | Session only; no account, local progress, Firestore, or source activation | Warmup policy and durable two-review persistence remain unresolved; source registry is inactive |
| `/kindergarten-learning-lab.html` | `tests/fixtures/kindergarten-workbook.json`, with manual week selection and an explicit Unit 1 window | Dojo writing/reading, three Ninja games, cumulative writing/reading Final Boss, writing/reading Spirit Realm, and a visit-only Ninja Record | Session-only scores; temporary reading audio is released; no source activation | Kindergarten/Tier 2 release relationship is undecided; no durable Tier 2 progress |
| `/tier2-reading-lab.html` | `src/tier2Lab/prototypeCurriculum.ts` scenarios assembled by `src/tier2Lab/fixtures.ts` | Grade-specific Acquisition, review-cycle, cumulative-review, and Mastery reading paths for Kindergarten, Grade 2, and Grade 5 | Entirely in memory; recording is prompt-local | A lifecycle smoke lab, not a production source or durable assessment |
| `/grade2-test-review-prototype.html` | The checked-in Grade 2 week in `src/testReviewPrototype/model.ts` | Collect all writing or reading responses, then assess them together on one final review page | Session only; reading clips are released on exit/refresh | Approved interaction prototype is not connected to production orchestration |
| `/learning-games-harness.html` | Explicit synthetic values in `src/learningGamesHarness.tsx` | Gallery and isolated interaction QA for all ten modular game formats | Nothing is saved | Synthetic component lab; it does not resolve curriculum or lifecycle state |
| `/skywriting-harness.html` | Ten source-derived target references in `src/skywriting/harnessSample.ts` | Cross-grade Sky Writing interaction and session summary | Session only | Source references are a fixed test sample, not runtime curriculum |
| `/skywriting-acquisition-harness.html` | Three source-derived Grade 5 targets in `src/skywriting/grade5AcquisitionSample.ts` | Acquisition-owned audio sequence, writing phase, reveal, and self-assessment | Session only | Interaction study; it does not advance or persist a real Acquisition session |
| `/skywriting-font-comparison.html` | The same three Grade 5 Sky Writing targets | Side-by-side Songti SC Light and Kaiti SC Regular tracing comparison | Nothing is saved | Rendering depends on installed platform fonts and records fallback availability |
| `/grade5-source-harness.html` | `tests/fixtures/grade5-presentation.json`, or tester-selected local JSON | Read-only extraction, progression evidence, candidate, and issue inspection | No application or source writes | Fixture is a reduced observed-source transcription, not a production seed |
| `/kindergarten-source-harness.html` | `tests/fixtures/kindergarten-workbook.json`, or tester-selected local JSON | Read-only workbook normalization, candidate, and blocker inspection | No application or source writes | Fixture is a reduced observed-source transcription, not a production seed |

The primary `/` application and `/testing.html` are included in the static build for orientation, but they are not frozen prototype routes in this inventory.

## Behavioral invariants

- The normal production build and `App.tsx` do not import or link the isolated harnesses.
- The public-preview build remains limited to its existing explicit entries.
- `VITE_PROTOTYPE_BASELINE=true` is the only production-mode switch that exposes all archived harnesses.
- Every frozen route must render its identifying heading without an unexpected `pageerror` or `console.error`.
- All Kindergarten activities must exit to the same Learning Hub without creating a score; unfinished Final Boss responses require confirmation and are discarded.
- Speech synthesis and microphone behavior remain browser capabilities. Reading recordings never enter the manifest or archive.
- Checked-in fixtures are immutable test inputs and must never be promoted to production fallback curriculum.

## Living regression references

- `tests/browser/prototypeRoutes.spec.ts` opens every route, loads both source fixtures, and rejects unexpected page and console errors.
- `tests/browser/kindergartenActivityExit.spec.ts` covers exit behavior for every Kindergarten activity. The more detailed Final Boss behavior remains covered in `tests/browser/kindergartenFinalBoss.spec.ts`.
- `tests/browser/prototypeVisuals.spec.ts` holds selected deterministic landing-screen references for Grade 5, Kindergarten, Grade 2 Test Review, the game gallery, and the font comparison.

Visual references use a fixed 1280×900 viewport, light color scheme, `en-US` locale, `America/Los_Angeles` timezone, and reduced motion. Snapshot changes require an explicit visual review; they must not be accepted as an incidental consequence of refactoring.

## Build, verify, tag, and archive

Run the complete candidate gates from a clean checkout:

```bash
npm ci
npm test
npm run build
npm run test:browser
npm run test:firestore
npm run test:prototype-baseline
```

After all gates pass, commit the freeze, create the tag, and package that exact tagged commit:

```bash
git tag -a prototype-baseline-2026-10 -m "Freeze approved prototype applications"
npm run package:prototype-baseline
```

The packaging command refuses a dirty tree or an untagged commit. It creates `prototype-baseline-2026-10.tar.gz`, a sibling SHA-256 file, and an internal manifest containing the commit, tag, tool versions, lockfile checksum, route inventory, and checksum for every archived file.

Publish the archive contents only from the root of a dedicated deployment with a stable versioned name, or attach the tarball and checksum to the matching Git release. Never rebuild or replace this artifact from a newer `main`; a later approved baseline receives a new tag and artifact name. Keep the archived build even after an integrated feature reaches parity.

## Refactor handoff

After this baseline is tagged and packaged, application-shell cleanup begins on `refactor/application-orchestration-boundary`. Stored schemas, revisions, receipts, retry behavior, lifecycle rules, target identity, and the child-facing behavior above stay frozen unless a separately reviewed behavior change explicitly authorizes a difference.
