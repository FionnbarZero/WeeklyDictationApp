# Current product execution roadmap

Status date: 2026-09-29

This document records the audited product state and the approved execution order after the Grade 5, Kindergarten, Acquisition-persistence, Tier 2 reading, and public-preview work landed.

## Verified baseline

- `main` is synchronized with `origin/main` at `a512b42`.
- The full automated suite passes: 396 tests.
- The normal production build passes.
- The public Grade 2 app, Grade 5 lab, Kindergarten lab, and testing hub return successfully from GitHub Pages.
- Grade 2 is the only active production curriculum source.
- Grade 5 and Kindergarten remain fixture-backed public labs whose production sources are deliberately inactive.
- Tier 2 reading and recorded self-assessment are isolated development boundaries and are not activated in the production application.

## Product maturity

### Grade 2 primary application

Grade 2 is the active primary application. It supports canonical deck import, Acquisition, Test Review, the compatibility Warmup runtime, local browser state, and Firebase REST persistence scaffolding. Public local-mode testing still requires a trusted deck JSON import. The approved Acquisition persistence contract and Adaptive Warmup model are not yet connected to production orchestration.

### Kindergarten lab

The Kindergarten lab is the preferred visual reference and exercises weekly Tier 1 writing, Tier 2 teaching, games, the explicit Unit 1 cumulative review, and the shared Learning Hub. Its fixture and session state are intentionally non-production. The production writing/lifecycle scaffold exists behind an inactive source gate.

### Grade 5 lab

The Grade 5 lab exercises the source adapter, progression-driven lifecycle, Acquisition, Test Review 1, Test Review 2, and the shared Learning Hub. It does not persist progress and does not activate the Grade 5 source. Grade 5 still needs an explicit production practice profile and approved Warmup policy.

### Tier 2 reading

The shared Tier 2 reading boundary mirrors each grade's lifecycle without sharing Tier 1 writing state. The recorded self-assessment prototype keeps recordings ephemeral. Production activation, persistence, approved reference audio, and any recording privacy/storage policy remain separate gates.

### Public preview

The invited-testing site is published from `feature/public-multigrade-preview` to `gh-pages`. It is not a production-data deployment. Its build and deployment remain manual and must be made reproducible before it is treated as a release pipeline.

## Architectural assessment

The canonical source, lifecycle, Acquisition engine/transition, Acquisition persistence contract, Warmup compatibility engine, pure Adaptive Warmup model, shared Learning Hub, and Tier 2 reading boundaries are complete. The principal remaining architecture risk is the coexistence of approved pure boundaries with older production orchestration in `domain.ts` and `App.tsx`.

Do not begin another broad monolith refactor. Reduce those files by connecting one approved boundary at a time through the persistence work below. Preserve compatibility exports until each migration has passed backup, restore, and browser acceptance gates.

## Execution order

### 0. Roadmap and preview reconciliation

- Mark the Acquisition persistence contract, Tier 2 reading boundary, recorded Tier 2 self-assessment, Kindergarten Tier 2 alias, and GitHub Pages preview as completed or active at their correct maturity level.
- Correct the public testing hub: Grade 5 Warmup is undecided, not required.
- Document the repeatable preview build and deployment commands.

### 1. Focused Acquisition behavior repair

Branch: `fix/acquisition-earned-dt-recovery`

- Repair open-ended Earned-DT Correction advancement.
- Preserve the original interrupted weekly-target resume position through Earned-DT reacquisition.
- Return to the exact interrupted target after successful reacquisition.
- Preserve correct final weekly-target completion and Earned-DT-pool evidence.
- Add deterministic regression fixtures for every repaired path.
- Do not activate the persistence contract or change UI, scoring, lifecycle, sources, Warmup, or stored schemas.

### 2. Persistent Acquisition activation

Branch: `feature/persistent-acquisition`

- Connect the approved progress envelope and checkpoint reducer to one application coordinator.
- Persist the progression revision, scored attempt, DT observation, and exact next flow atomically or idempotently.
- Add a durable local pending-transition journal and exact retry behavior.
- Migrate valid legacy progress while retaining failed raw records as recovery artifacts.
- Add strict local/cloud validation, Firestore revision rules, Firebase Emulator coverage, and rendered-browser resumption coverage.

### 3. Persistent Adaptive Warmup visits

Branch: `feature/persistent-warmup-visits`

- Activate the approved mastery-term identity and Adaptive Warmup model.
- Add versioned migration and preserve unrelated child, grade, module, and historical data.
- Materialize unique visit queues and persist each completed response, resulting mastery transition, next position, and graph point.
- Support exact partial resumption, optional pre-activity skipping where explicitly configured, automatic continuation to the selected primary activity, and independent standalone Warmup.
- Add the Warmup line graph based on visit attempts rather than legacy monthly aggregates.

### 4. Production-level verification foundation

- Add Firebase Emulator configuration and security-rule integration tests.
- Add rendered browser tests for local persistence, refresh, exact Acquisition resumption, partial Warmup resumption, and grade isolation.
- Add backup/restore fixtures and a migration dry-run report before any production child-data migration.
- Make the public-preview build repeatable without hand-copying generated assets.

### 5. Grade activation, one grade at a time

Kindergarten is technically closer to activation because its writing profile and unit lifecycle are registered. Activation still requires reviewed future-unit boundaries, trusted empty/no-instruction meaning, staging import verification, and persistent-session acceptance.

Grade 5 activation follows after its production practice profile, standalone Warmup policy, bucket quotas, promotion thresholds, and pre-activity Warmup requirement are approved. It must pass staging import and progression-event verification before its source gate changes.

No grade activation branch may silently inherit another grade's profile or enable another inactive source.

### 6. Tier 2, handwriting, and rewards

- Activate Tier 2 only after the shared persistence foundation exists and the initial release is explicitly chosen as self-assessment-only or recorded.
- If voice recording is retained, approve family-scoped storage, access, retention, deletion, upload recovery, and consent behavior first.
- Prototype handwriting in memory without permanent stroke storage.
- Keep rewards Kindergarten-only and separate until award, redemption, balance, reduced-motion, mute/skip, and parent-control rules are approved.

## Decisions that block later activation but not the persistence work

- Grade 5 Warmup requirement and standalone Adaptive Warmup profile.
- Kindergarten unit boundaries after the explicit Unit 1 window.
- Trusted Grade 5 and Kindergarten no-instruction/workshop markers.
- Self-assessment-only versus stored voice recordings for the first Tier 2 release.
- Account invitation, verification, retention, and deletion policies.
- Handwriting replacement versus optional use.
- Kindergarten reward award and redemption rules.

These decisions must be made before their dependent activation branches. They must not be guessed during the Acquisition or Warmup persistence work.

## Branch and release hygiene

Retain `main`, `release/grade2-stable`, `feature/public-multigrade-preview`, and `gh-pages`. The merged Kindergarten alias branch and superseded original Pages preview are cleanup candidates. Historical Grade 5, Kindergarten, Adaptive Warmup, audio, and Tier 2 backup branches require a provenance audit before deletion.

Every implementation branch starts from updated `main`, changes one owned boundary, passes the full test/build/diff gates, receives a read-only audit, and merges before its dependent branch begins.
