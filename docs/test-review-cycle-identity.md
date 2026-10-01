# Test Review cycle identity boundary

Test Review cycle identity now survives the complete shared Tier 1 writing path:

`lifecycle assignment → practice target → practice session → result/score → local or cloud hydration`

The focused `src/practice/lifecycleProjection.ts` boundary exposes every configured review cycle instead of collapsing the result to cycle 1. `domain.ts` keeps compatibility re-exports for existing callers. Cumulative reviews, such as Kindergarten Unit 1, remain one target containing their ordered source datasets. Ordinary multi-review lifecycles, such as Grade 5, produce separate cycle 1 and cycle 2 targets.

`reviewCycle` is optional only for backward compatibility. A stored Test Review record without the field is normalized to cycle 1, because Grade 2 was the only active production source before this boundary. New Test Review sessions, attempts, results, scores, completed-session records, and associated pre-activity Warmup identities write an explicit positive cycle. Acquisition and Warmup records cannot carry Test Review cycle metadata.

This branch does not activate Grade 5, register a Grade 5 production practice profile, redesign provisional Test Review persistence, or change child-facing behavior. Grade 5 remains behind its inactive source gate until its profile, per-cycle provisional persistence, cloud validation, and end-to-end gates pass.
