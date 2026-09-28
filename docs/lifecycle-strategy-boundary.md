# Lifecycle strategy boundary

This boundary separates **when a canonical vocabulary cohort changes stage** from the teaching, scoring, persistence, importer, and user-interface behavior that consumes that stage.

## Current implementation

`src/lifecycle/contracts.ts` defines source-neutral lifecycle inputs and outputs. A `LifecycleSet` contains only the stable dataset identity, grade, normalized school-year key, activation and instructional dates, and whether the source unit contains vocabulary or explicitly represents no instruction. A `LifecycleContext` carries those sets together with accepted source-neutral progression events.

`src/lifecycle/registry.ts` requires an explicitly registered, versioned strategy for the requested grade and normalized school year. There is no cross-grade or cross-year fallback. Grade 2 for 2026–27 is currently the only registered strategy.

The Grade 2 strategy is replacement-driven:

- A valid arrived vocabulary cohort is Acquisition.
- The immediately preceding valid cohort is Test Review 1.
- Older valid cohorts are Mastered.
- Assignments stay unchanged through weekends and source gaps.
- A duplicate, malformed source unit, or no-instruction unit does not rotate cohorts.
- A later valid vocabulary replacement rotates the cohorts once, regardless of how many calendar days elapsed.

Grade 2 receives the common progression-event list but remains replacement-driven and does not advance from those events. Curriculum stages map centrally onto practice behavior, so all numbered Test Review stages reuse the existing `test-review` practice phase without changing persisted session or score values.

`resolveDatasetLifecycles` remains as a compatibility wrapper for existing callers. It validates one grade and school-year scope, translates canonical application datasets into source-neutral lifecycle sets, delegates to the registered strategy, and projects the resolution back onto the original dataset objects. The dashboard, primary activity selection, and Warmup eligibility therefore share the same strategy result without changing the current Grade 2 public data shape.

## Future Grade 5 progression-event requirement

Grade 5 must not be implemented by changing the Grade 2 strategy or by configuring Grade 2 with two review cycles. It needs its own registered strategy because the progression event comes from a validated instructional source sequence, not merely from dates.

A Grade 5 progression event is one fully validated new instructional slide whose table roles establish:

- the prior cohort confirmation in the top `This week` row; and
- exactly one new Acquisition cohort in the bottom `Coming next week/Core vocab` row, according to the approved Grade 5 source-role mapping.

One accepted progression event advances active cohorts exactly one position:

1. the new cohort enters Acquisition;
2. the former Acquisition cohort enters Test Review 1;
3. the former Test Review 1 cohort enters Test Review 2; and
4. the former Test Review 2 cohort enters Mastery.

No new validated slide means no progression event. A conference week or other source gap freezes every assignment. The next valid slide advances the sequence once, not once for every elapsed or missing calendar week. A duplicate or preview confirmation also advances nothing.

A mismatch between the top-row confirmation and the previously accepted cohort is a blocking conflict. The existing vocabulary and lifecycle assignments remain unchanged; the bottom-row cohort stays pending until an administrator corrects the source or explicitly activates a reviewed revision.

The future Grade 5 source adapter should emit the explicit, stable `LifecycleProgressionEvent` identity and canonical cohort candidates needed by the Grade 5 strategy. The lifecycle strategy consumes that validated event data without importing Google Slides types, parsing table labels, accessing Firestore, or creating application `Dataset` objects.

Week 4 remains the approved Grade 5 activation baseline. Earlier inconsistent startup slides may be retained as provenance or import issues, but the strategy must not invent missing review cohorts from them.

## Non-goals of this extraction

This boundary does not add Grade 5 or Kindergarten parsing, vocabulary, practice profiles, Firestore writes, new persistence records, or child-facing behavior. Acquisition routines, Warmup selection, scoring, and session persistence remain in their existing modules until their own reviewed extractions.
