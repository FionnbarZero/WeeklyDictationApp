# Modular learning games

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

`LEARNING_GAME_CATALOG` records channel eligibility. Writing formats are restricted to Tier 1, reading formats to Tier 2, and receptive formats may be used by either channel.

## Grade 5 integration sequence

The future Grade 5 adapter should map the resolved Test Review 1 cohort—shown as **Practice your Ninja Skills**—into these generic prompt contracts. It must reject unavailable input rather than inventing it. In particular, `ContextGapDash` and `SentenceScramble` require approved context sentences, which the current Grade 5 extraction does not supply.

Test Review attempts remain provisional until the entire required Test Review is submitted. A game completion callback must not directly create a Grade 5 score or mastery transition.

## Development harness

Run `npm run dev` and open `/learning-games-harness.html` to test every component independently. The harness uses a small, explicitly synthetic character set for interaction QA only. It does not import a curriculum fixture, resolve a lifecycle, call an Acquisition or Adaptive Mastery engine, or save results.
