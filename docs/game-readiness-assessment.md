# EduGame readiness assessment

Status: code-grounded inventory prepared after the local A3.3 final review (October 8, 2026). This document is a planning gate, not a claim that any game is student-ready or published.

## Shared integration facts

- `src/ninjaSkills/content.ts` already resolves authoritative cohort terms and emits explicit unavailable reasons. It can materialize bounded subsets, target IDs, meanings, pinyin steps, context sentences, ordered tokens, and separate lifecycle inputs.
- `src/ninjaSkills/LearningModuleHost.tsx` owns the adapter boundary. The game components emit observations; the owning activity must apply Acquisition, Correction, Adaptive Mastery, audio provenance, attempt identity, persistence, and scoring policy.
- `src/learningModules` contains reusable interaction components, but the harness is synthetic and does not prove curriculum selection, lifecycle placement, persistence, or results.
- A3.3 is published at source `e9c5a54`. Its school-year policy repair passed live three-grade saving, failed-upload/reload recovery, and fresh-browser acceptance on October 8 Pacific. This establishes the shared saving prerequisite; each game's learning policy and per-target coverage still require their own acceptance.
- The family wrapper is a second target-selection boundary: `src/familyBeta/main.tsx` builds game capabilities from earlier reading targets, substituting writing capabilities only for Dictation Streak. Updating pack tier filters alone will not make Tier 1 Context Gap Dash/Sushi Scramble or mixed-tier Shuriken Match usable. Stage B must align `src/familyBeta/gamePools.ts`, the wrapper, and the central policy.
- `src/familyBeta/gameFrame.tsx` currently saves aggregate scores. Stage B must connect reviewed per-target results without persisting the reusable module's raw `response` values; any additional production schema/security change remains a separate concrete review and approval.

## Readiness by game

| Game | Existing capability | Missing contract/content | Dependencies | Shortest student-ready path |
| --- | --- | --- | --- | --- |
| Memory Lanterns | `memoryPack` selects distinct non-Tier-3 authoritative terms; the component has match interaction and result callbacks. | Policy must be restricted to the approved Tier 2 set for the final integration; per-target attempts and score persistence need an adapter check. | Curriculum tier resolver, result ledger, A3.3 publication. | Correct tier filter, add per-target result assertions, then a bounded Grade 5 release review. |
| Shuriken Match | `speedMatchPack` requires two targets and distinct meanings; component supports meaning matching. | Must allow validated Tier 1 + Tier 2 targets and distinguish generated/validated meanings without placeholders. | Meaning provenance/validation, subset policy, separate game-result persistence. | Add mixed-tier policy table, fixture coverage for every selected meaning, then release one grade. |
| Context Gap Dash | `contextPack` currently uses Tier 2 and validates sentence structure plus three choices; Phaser interaction exists. | Approved rule is Tier 1, with contextual sentences and choices validated against that tier; current error text and channel need correction. | Sentence validation, Tier 1 selection, performance check on iPad. | Switch policy to Tier 1, add sentence/token fixtures, run touch/performance review. |
| Sushi Scramble | `sentencePack` validates ordered tokens that concatenate to the sentence; component handles sequence input. | Approved rule is Tier 1; tokenization must support longer teacher/generated sentences and preserve target identity. | Sentence provenance, robust tokenizer, result adapter. | Change tier policy, add long-sentence fixtures, verify scoring and save/reload. |
| Shadow Strike Dojo | `targetBlastPack` prefers Tier 2 and falls back to non-Tier-3; target-blast component and movement regression exist. | Remove Tier 1 fallback; repair/measure choppy movement on iMac/iPad and verify audio/replay behavior. | Tier 2 coverage, animation budget, touch/mouse input, persistence. | Enforce Tier 2, instrument frame/input timing, then Sol High implementation and Astra High release review. |
| Dictation Streak | Catalog and pack already support pinyin steps and candidate selection for eligible terms. | Must include both tiers and enforce `word → context sentence → word → word`; per-character candidate input and audio contract need end-to-end persistence tests. | Pinyin provenance, audio sequence, shared result ledger. | Expand policy and fixtures, test candidate selection per character, then Astra High review. |
| Whispering Scrolls | Reusable read-aloud components exist; product rules specify temporary recording comparison. | Must be placed in acquisition and follow the full grade-owned teaching/comparison sequence, timers, correction, earned DT, resume, and recording cleanup. | Grade-specific lifecycle tables, microphone permissions, in-session-only audio. | Implement only after source-cited phase matrix and acquisition adapter are verified with Astra Extra High. |
| Stroke Order Slay | Writing components exist in the modular library. | Must be Tier 1 acquisition with full teaching/expanded-trial/correction/earned-DT rules, stroke-guide coverage, persistence, and thinner marker on all writing activities. | Grade-specific stroke guides, handwriting input, touch QA, acquisition checkpoint contract. | Build the phase matrix and guide validation first; then implement with Astra Extra High and test every grade. |

## Release order and gates

1. A3.3 publication and authenticated score-policy repair are verified. Preserve that baseline and its protected recovery path as Stage B begins; source merge/push remains separate from the completed publication.
2. Use GPT-6.1 Sol · High for the bounded first-game implementation, beginning with the smallest validated policy slices (Lanterns, Shuriken Match, Context Gap Dash, Sushi Scramble).
3. Keep Shadow Strike separate for performance work; use GPT-6 Astra · High for Dictation Streak review.
4. Reserve GPT-6 Astra · Extra High for Whispering Scrolls, Stroke Order Slay, security-sensitive work, and the final cross-grade release review.

Every game slice must prove target selection, lifecycle placement, per-target results, pause/report behavior, save/reload, and exact artifact identity across the affected grades before a smoke-test handoff.
