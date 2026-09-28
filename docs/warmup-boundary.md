# Adaptive Warmup boundary

Phase 1 extracts the existing Grade 2 Adaptive Warmup algorithm from `src/domain.ts` without changing behavior or persistence.

## Responsibilities

- `src/warmup/contracts.ts` owns the existing Warmup category, child-word-state, and selection shapes.
- `src/warmup/engine.ts` owns current state derivation, response transitions, allocation, shortage filling, and rotation selection.
- `src/domain.ts` remains the compatibility facade. It resolves the registered grade profile and lifecycle, adapts them to the pure engine, and preserves the existing public function signatures.

The engine receives lifecycle facts and policy values as inputs. It does not resolve lifecycle stages, load grade profiles, construct sessions, score visits, hydrate stored state, or write local or cloud data.

## Compatibility status

This boundary intentionally preserves current behavior, including behavior that the approved future Adaptive Warmup design will replace:

- shortage filling favors Mastery Rotation before Errored Word and Recent Review;
- Mastery Rotation words may repeat when the unique pool is smaller than the configured visit size;
- state remains keyed to weekly word occurrences;
- the stored category names and JSON shapes remain unchanged.

The tests label these as extraction evidence, not as approval of the future product rules. New mastery-term identity, names, fill priority, no-duplicate behavior, migration, durable visits, and reporting belong to later feature phases.
