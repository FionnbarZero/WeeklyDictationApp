# Ninja Skills integration plan for all grades

The audited follow-on work for Kindergarten, Grade 2, and Grade 5 authoritative data plus the separate Enter the Dojo Stroke Order experience is recorded in [`source-data-stroke-order-integration-plan.md`](source-data-stroke-order-integration-plan.md). Its branch handoff gate must be satisfied before integrating the active Stroke Order worktree.

Weekly Dictation will expose the same six learning modules inside **Practice your Ninja Skills** for every supported grade from Kindergarten through Grade 5. The modules are transplanted, lazy-loaded React components rather than a separate game application. Grade profiles and authoritative curriculum adapters determine which cohort is used, how source content becomes module rounds, and whether each module has enough reviewed data to launch safely.

The learning modules will not read Google files directly, own curriculum selection, or change Acquisition, Test Review, or Mastery state. Weekly Dictation remains responsible for authoritative content, lifecycle selection, persistence, and learning-outcome language.

## Ownership boundary

The calling learning engine owns:

- authoritative target and distractor selection;
- the ordered or materialized prompt queue;
- Acquisition and Correction transitions;
- Adaptive Mastery bucket selection and state transitions;
- audio provenance and playback implementation;
- durable attempt identity, timestamps, persistence, and scoring; and
- whether an activity is available in a lifecycle stage.

Each transplanted component owns only its immediate interaction and emits `LearningGameAttempt` and `LearningGameSummary` values. Those emitted values are observations for an adapter; they do not update Acquisition or Adaptive Mastery by themselves.

## Component library and production lineup

The library exports ten independent components:

1. `SpeedMatch`
2. `TargetBlast`
3. `LilyPadPath`
4. `MemoryFlip`
5. `ContextGapDash`
6. `SentenceScramble`
7. `ReadAloudBossRush`
8. `DictationStreak`
9. `CopyHideWriteCombo`
10. `CorrectionRescue`

`LEARNING_GAME_CATALOG` records channel eligibility. Writing formats are restricted to Tier 1, reading formats to Tier 2, and receptive formats may be used by either channel.

The six production cards retain the existing internal IDs so component contracts and future records remain stable.

| Child facing title | Internal game ID | Primary input |
|---|---|---|
| Dictation Streak | `dictation-streak` | Production rounds |
| Shuriken Match | `speed-match` | Approved pairs |
| Shadow Strike Dojo | `target-blast` | Selection rounds |
| Memory Lanterns | `memory-flip` | Exact match pairs |
| Context Gap Dash | `context-gap-dash` | Approved sentence gaps |
| Sushi Scramble | `sentence-scramble` | Approved sentence tokens |

All six module cards appear in each grade's **Practice your Ninja Skills** section. A card may be unavailable for a selected cohort when required authoritative data is missing. The unavailable state must explain what is missing; the application must never fabricate a translation, Pinyin sequence, sentence, token boundary, distractor, or audio reference.

The audited EduGames implementations should replace the matching generic presentation components while preserving these IDs and public contracts. The copied modules must record their source commit. Direct relative imports across repositories and iframes are not production integration mechanisms.

## Shared production architecture

The production flow is:

```text
Authoritative Google source
    -> grade and school year source registry
    -> versioned grade source adapter
    -> canonical curriculum candidate
    -> validated canonical dataset and game metadata
    -> grade Ninja Skills profile
    -> Ninja Skills content adapter
    -> lazy-loaded learning module
    -> Weekly Dictation attempt and session persistence
```

The shared implementation adds six responsibilities:

1. `LearningModuleHost` launches one module, owns exit and completion navigation, stops active audio, and returns the learner to the same grade, section, and cohort.
2. A module registry maps stable internal IDs to child-facing titles, lazy component imports, input requirements, and supported learning channels.
3. A grade Ninja Skills profile selects eligible cohorts and controls grade-appropriate round limits, instructions, and input behavior.
4. A content adapter converts one canonical cohort into the exact pairs, rounds, or tokens required by a module.
5. A capability validator returns either a complete module pack or a child-safe unavailable reason. It never returns partially valid rounds.
6. A separate learning-module session boundary records attempts and completion without changing the curriculum lifecycle.

Context Gap Dash and Phaser must remain outside the initial application bundle. The build budget check must require the shared module host and every learning module to remain lazy-loaded.

## Grade hub integration

The application currently supports six grade labels, but production and lab coverage are uneven. The integration replaces the Grade 2-only application branch with a grade hub registry.

| Grade | Current authoritative-source work | Ninja Skills integration requirement |
|---|---|---|
| Kindergarten | Google Sheets adapter and development hub exist; source is inactive | Promote the hub through the shared host and retain unit-based cohort selection |
| Grade 1 | No source registry entry or grade hub exists | Add an authoritative source, adapter, lifecycle profile, and hub profile |
| Grade 2 | Google Slides source is active; production hub exists | Replace disabled previews with the six production learning-module cards |
| Grade 3 | No source registry entry or grade hub exists | Add an authoritative source, adapter, lifecycle profile, and hub profile |
| Grade 4 | No source registry entry or grade hub exists | Add an authoritative source, adapter, lifecycle profile, and hub profile |
| Grade 5 | Google Slides adapter and development hub exist; source is inactive | Promote the hub and place the learning modules in Test Review 1 Ninja Skills |

Each grade profile owns cohort semantics. Kindergarten may offer cumulative unit cohorts, Grade 2 may use the current Acquisition cohort or an approved mastery cohort, and Grade 5 may use its Test Review 1 cohort. Sharing the module host does not make one grade inherit another grade's lifecycle rules.

## Authoritative source boundary

There is one registered curriculum source per grade and school year. The source may be a Google Slides presentation or Google Sheets workbook. If a grade literally uses a Google Docs document, `CurriculumSourceType`, its payload contract, read-only fetch path, and a versioned `google-docs` adapter must be added before that source can be registered.

Every source registry entry records the grade, school year, source type, exact Google file ID, versioned source adapter, practice and lifecycle profiles, activation state, and a reviewed fixture representing the observed source structure.

The browser never reads Google curriculum files. The trusted importer reads each configured file with read-only authorization, validates its exact identity, produces a dry-run report, and writes only accepted canonical output. Source changes that conflict with an existing canonical dataset remain blocked for administrator review.

## Canonical learning-module metadata

The current vocabulary occurrence contract preserves text and source position. The learning-module pipeline also needs reviewed metadata tied to the stable target occurrence identity.

```ts
type AuthoritativeLearningModuleTerm = {
  occurrenceId: string
  text: string
  tier: 'tier-1' | 'tier-2' | 'tier-3'
  meaning?: string
  pinyinSteps?: readonly {
    pinyin: string
    candidates: readonly string[]
  }[]
  context?: {
    sentence: string
    tokens: readonly string[]
  }
  audio?: {
    wordStoragePath?: string
    sentenceStoragePath?: string
  }
}
```

If a teacher-owned source does not contain these fields, a companion authoritative Google Sheet may supply them. Companion records join by stable target occurrence ID and retain their own source file ID, source-unit identity, adapter version, validation outcomes, and content fingerprint. A text-only match is insufficient because repeated curriculum terms are valid.

Learning-module metadata participates in content fingerprinting. Changing a translation, Pinyin candidate, sentence, sentence token, or audio reference creates a reviewable canonical revision rather than silently changing an existing learning module.

## Learning-module availability requirements

| Learning module | Minimum authoritative data |
|---|---|
| Memory Lanterns | At least two valid target occurrences; each target becomes an exact character pair |
| Shadow Strike Dojo | Target text or approved audio cue plus enough same-channel cohort targets for distinct choices |
| Dictation Streak | Target text and playable word audio; complete `pinyinSteps` for guided Pinyin entry |
| Context Gap Dash | An approved sentence containing the target exactly once plus valid same-channel distractors |
| Shuriken Match | An explicit approved pair, normally Mandarin target and English meaning |
| Sushi Scramble | An approved sentence and explicit ordered tokens; character splitting is not an approved tokenizer |

Round limits are validated before launch. Supplied content is never silently truncated. A grade profile may request a smaller deterministic subset, but the subset rule must be explicit and tested.

## Attempts persistence and learning claims

Ninja Skills records are separate from formal writing and reading assessment records. A durable learning-module session records child, grade, school year, module, cohort, source provenance, timestamps, attempts, assessment mode, status, and a completion summary.

The interface may report **completed**, **correct**, and **attempted**. It must not report **mastered** based on a learning-module session. A module completion never advances a dataset or vocabulary term into Mastery. Any later use of module evidence by a learning engine requires a separate reviewed policy and migration.

Exiting a learning module saves observed attempts and marks the session exited. A later restart may link to the exited session, but the interface must not claim to resume an exact interaction state unless the module contract supports rehydrating that state.

## Implementation sequence

### Shared foundation

- Create the shared module registry, `LearningModuleHost`, grade profile contract, content-pack contract, and capability validators.
- Add a `learning-module` launch request to the grade Learning Hub adapters.
- Add a lazy-loaded learning-module experience to application orchestration and lock profile switching while it is active.
- Import the six audited EduGames modules while preserving their stable Weekly Dictation IDs.
- Add Phaser only through the lazy Context Gap Dash path.

### Existing grade sources

- Connect Grade 2 and replace its disabled game previews.
- Connect Kindergarten's unit cohorts without inheriting Grade 2 lifecycle rules.
- Connect Grade 5's Test Review 1 cohorts and preserve its source-progression lifecycle.
- Keep Kindergarten and Grade 5 production source gates inactive until their existing release requirements pass.

### Remaining grade sources

- Obtain the authoritative source link and file type for Grades 1, 3, and 4.
- Document each source's observed layout and create a read-only fixture.
- Implement and version a dedicated adapter and lifecycle profile for each grade.
- Register each source as inactive, run deterministic dry-run and conflict tests, and activate it only after review.

### Metadata and durable records

- Identify where approved meanings, Pinyin steps, context sentences, sentence tokens, and audio references live for every grade.
- Add companion authoritative metadata sources where the primary source lacks required fields.
- Require provenance, fingerprints, and validation for joined game content.
- Add local and cloud learning-module session contracts, backup and restore handling, Firestore rules, and emulator tests.
- Add component and Playwright coverage for all six grades, all six cards, valid launches, unavailable explanations, exit behavior, keyboard navigation, reduced motion, and the 390-pixel layout.
- Extend performance checks to prove all learning modules remain outside the initial bundle and optimized assets stay within budget.

## Acceptance criteria

- Every supported grade displays all six production learning-module cards under **Practice your Ninja Skills**.
- The selected grade and cohort determine all module content through a registered authoritative source chain.
- Every launched module receives a complete, validated, provenance-bearing content pack.
- Missing metadata produces a specific unavailable state and never synthetic curriculum content.
- No learning-module completion changes Acquisition, Test Review, Warmup, or Mastery state.
- Exited and completed sessions retain observed attempts without being called mastery.
- Kindergarten, Grade 2, and Grade 5 preserve their distinct cohort and lifecycle policies.
- Grades 1, 3, and 4 remain inactive until their exact sources, adapters, and profiles are reviewed.
- Keyboard, screen-reader, reduced-motion, phone-layout, build, and bundle-budget checks pass.

## Inputs required for source onboarding

For each grade from Kindergarten through Grade 5, source onboarding needs:

1. The authoritative Google file URL or stable file ID.
2. Confirmation that the file is Google Docs, Google Slides, or Google Sheets.
3. The school year and the source unit that represents one instructional cohort.
4. The location of Tier 1, Tier 2, and Tier 3 values.
5. The location of approved meanings, Pinyin, context sentences, sentence tokens, and audio references, or approval to use a separate reviewed metadata workbook.
6. Confirmation of the cohort used by **Practice your Ninja Skills** for that grade.

## Grade 5 integration constraint

The Grade 5 adapter maps the resolved Test Review 1 cohort into the shared prompt contracts. It rejects unavailable input rather than inventing it. In particular, Context Gap Dash and Sushi Scramble remain unavailable until the authoritative Grade 5 content supplies approved context sentences and ordered sentence tokens.

Test Review attempts remain provisional until the entire required Test Review is submitted. A learning-module completion callback must not directly create a Grade 5 score or mastery transition.

## Development harness

Run `npm run dev` and open `/learning-games-harness.html` to test every component independently. The harness uses a small, explicitly synthetic character set for interaction QA only. It does not import a curriculum fixture, resolve a lifecycle, call an Acquisition or Adaptive Mastery engine, or save results.
