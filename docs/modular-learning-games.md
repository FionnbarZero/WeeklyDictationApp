# Modular learning games

Current embedded product rules are in [the roadmap](../ROADMAP.md#edugames-rules-within-ninja-dojo) and [ADR 0008](./decisions/0008-family-beta-product-and-release-policy.md). The owner requires separate per-game results and weekly progress, generated supplemental content without manual preapproval, and two separately tracked acquisition alternatives. Library availability alone does not establish that these live integration requirements are complete.

`src/learningGames` is a presentation-only library for short reading, writing, and receptive games. It deliberately contains no curriculum terms, dates, grade-specific source IDs, lifecycle resolution, Acquisition transitions, Adaptive Mastery scheduling, persistence, or scoring policy.

## Ownership boundary

The calling learning engine owns:

- authoritative target and distractor selection;
- the ordered or materialized prompt queue;
- Acquisition and Correction transitions;
- Adaptive Mastery bucket selection and state transitions;
- audio provenance and playback implementation;
- durable attempt identity, timestamps, persistence, and scoring; and
- whether an activity is available in a lifecycle stage.

Each game component owns only its immediate interaction and emits `LearningGameAttempt` and `LearningGameSummary` values. Those emitted values are observations for an adapter; they do not update Acquisition or Adaptive Mastery by themselves.

## Available components

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

`LEARNING_GAME_CATALOG` records existing channel eligibility. The October 5 embedded requirements explicitly allow mixed Tier 1/Tier 2 rounds in Shuriken Match and Dictation Streak, with Dictation Streak teaching pinyin. Other games use the roadmap's exact tiers. Update adapters and validate their emitted observations deliberately; mixed vocabulary does not merge writing and reading mastery histories.

## Grade 5 integration sequence

Grade 5 is first in the current integration order. Extra-practice games use the most recent earlier week containing relevant targets. Stroke Order Slay and Whispering Scrolls instead follow the full grade-owned acquisition sequence for their current target sets, keeping progress separate from the existing writing/reading activities. Spirit Realm uses mastered targets under full Warmup rules.

Contexts and meanings missing from the teacher source may be generated and validated without manual owner review. Do not invent the teacher vocabulary or mislabel generated context as teacher-authored. Invalid content remains unavailable until corrected.

Game callbacks provide observations to the owning adapter, which records a separate game result and weekly history. They do not directly create an official Boss score or change mastery. Boss attempts remain provisional until the required review is submitted. Cohort progression to Spirit Realm follows the grade lifecycle rather than an invented game-accuracy threshold.

## Development harness

Run `npm run dev` and open `/learning-games-harness.html` to test every component independently. The harness uses a small, explicitly synthetic character set for interaction QA only. It does not import a curriculum fixture, resolve a lifecycle, call an Acquisition or Adaptive Mastery engine, or save results.
