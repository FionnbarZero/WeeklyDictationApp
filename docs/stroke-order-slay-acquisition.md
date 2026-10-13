# Stroke Order Slay acquisition

## D2 readiness baseline

D1 is published as `092c57f`. D2 starts from that application source and its two local release-documentation commits. The owner confirmed **GPT-6 Astra · Extra High** for D2 on October 12. D2 is not published or ready for owner testing.

The existing `StrokeOrderActivity` is a session-only copy/review/memory/review loop. Grade 2 and Kindergarten launch it from their ordinary hubs; the family wrapper separately adds it for Grade 5. Its fixed 10/20-second rounds do not execute the approved acquisition engine. Replacing those family launches with a presentation over the existing engine is the shortest coherent path. Development-only prototypes remain unchanged.

The family acquisition store already supplies pinned curriculum/strategy snapshots, reviewed facts, separate activity identity, compare-and-swap updates, retirement, and cross-device completion identities. D1's completion lock protects pending and confirmed scores across mounted tabs. D2 must reuse these boundaries, with a separate writing module and score label, and restore its own saved route. Raw handwriting and typed provisional responses remain in memory only.

Baseline guide inventory against the bundled authoritative sources: Kindergarten has every writing target in its five available cohorts; Grade 5 has every writing target in its five available cohorts; Grade 2 has only its September 21 cohort. All 16 familiar-DT seed characters have guides. Add the missing Grade 2 geometry from the same licensed, revision-pinned upstream used by Grade 5. Invalid/missing geometry must prevent unsupported targets from launching. Do not guess paths, substitute vocabulary, or imply incomplete coverage is complete.

The requested half-width marker was already implemented in `ce92956`: Sky Writing ink is 9px (5px in its smaller review view), previously 18/10px; the standalone stroke pad is 2.4 units, previously 4.8. Reuse the shared writing pad without halving it again or altering printed guides.

## Teaching contract and acceptance

[ADR 0007](decisions/0007-parallel-stroke-order-acquisition-comparison.md) requires exact writing-acquisition parity with separate progress. [ADR 0008](decisions/0008-family-beta-product-and-release-policy.md) removes experimental labels and preserves grade-owned teaching rules. [ADR 0009](decisions/0009-activity-reliability-and-staged-delivery.md) adds durable per-trial resume, temporary-only drawings, report pause and scored-attempt protection.

F means familiar DT, T the current target, M model/copy, and D the engine-selected familiar or earned DT.

| Rule | Kindergarten writing | Grade 2 writing | Grade 5 writing |
| --- | --- | --- | --- |
| Strategy | `kindergarten-acquisition-v2` | `grade2-acquisition-v4` | `grade5-acquisition-v2` |
| Introduction | F F M T | F F M T | F F M T |
| Expanded trials | T T D T D D T D D D T | T T D T D D T D D D T | T T D T D D T D D D T |
| Expanded target seconds | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 |
| Familiar / earned DT seconds | 5 / 5 | 5 / 5 | 5 / 5 |
| Introduction / correction model and target seconds | 10 | 10 | 10 |
| Correction | M M M T F T; existing writing scoring | Same | Same |
| Target reveal | Model visible for M; hidden on independent trials until review | Same | Same |
| Three consecutive errors | Existing engine reacquisition; earned-DT demotion preserves interrupted target | Same | Same |
| Completion | Engine earns the target; ongoing DT on subsequent visits; Done for today saves scored facts separately | Same | Same |

Sources: `src/acquisition/strategies/{kindergarten,grade2,grade5}.ts`, `src/acquisition/engine.ts`, `src/acquisition/transition.ts`. Kindergarten **reading** has different spacing and correction behavior; do not apply it to writing. The ordinary `PracticeView` starts its response timer at confirmed audio start, supports timer skip and +10 seconds, and plays word → available context → word → word using the grade audio profile. D2 follows those timing/prompt semantics; audio failure requires retry before an independent response. Guides show ordered strokes during teaching and comparison, never reveal an independent answer early. The existing family hub's warmup and Spirit Realm policy remain unchanged.

Required evidence: all-grade teaching/correction/earned-DT parity, complete geometry validation, separate ordinary/D2 progress, retained-source resume and explicit discard, offline saving and fresh-device recovery, failed-save exact retry, pending/confirmed cross-tab completion, timer/audio/guide pause during reports, temporary drawing privacy, desktop/tablet layout, and compatible guarded D1 recovery. Physical iMac/iPad audio/touch acceptance follows reviewed publication. No production records, policies or authentication changes are part of this stage.
