# Acquisition strategy boundary

This boundary separates the pure teaching algorithm for Acquisition from application datasets, scoring, session orchestration, and persistence. It is a structural extraction only: the Grade 2 child experience and stored flow shape remain unchanged.

## Dependency direction

```text
src/acquisition/contracts.ts
        ↑
src/acquisition/engine.ts
        ↑
src/domain.ts compatibility wrappers

src/acquisition/contracts.ts
        ↑
src/acquisition/strategies/grade2.ts
        ↑
src/practice/profiles/grade2.ts
```

The engine receives an `AcquisitionStrategy` as an argument and never imports the concrete Grade 2 strategy. The contracts module has no application-level imports. The Grade 2 strategy imports only the neutral contracts.

## Contracts and compatibility

`AcquisitionTarget` is the minimum shape required by the engine. `AcquisitionTargetSet`, `AcquisitionStrategy`, `EngineAcquisitionPrompt`, and `EngineAcquisitionFlow` are generic so the same target type travels through the strategy, shuffle bags, prompts, and flow.

The compatibility boundary in `src/domain.ts` supplies complete `Word` objects and retains the public domain types as aliases over `EngineAcquisitionFlow<Word>` and `EngineAcquisitionPrompt<Word>`. Existing callers therefore keep the full optional word metadata, the same function names, parameter order, default arguments, prompt and target IDs, and stored flow representation.

`src/domain.ts` continues to own `shouldRecordAcquisitionAnswer`. Recording and scoring policy are not responsibilities of the teaching engine.

## Grade 2 ownership

`grade2AcquisitionStrategy` is the single owner of the current Grade 2:

- strategy ID and version;
- timers;
- Introduction, Expanded Trials, and Correction sequences;
- DT observation mode; and
- complete Familiar DT target objects, including stable IDs, dataset identity, order, and metadata.

The broader Grade 2 practice profile references that strategy object directly. `ESTABLISHED_DT_WORDS` remains a domain compatibility export referencing the same target collection rather than rebuilding it.

## Behavior-preservation proof

The checked-in pre-extraction fixture freezes exact serialized-flow hashes at the starting state, first Correction entry, return from Earned-DT Correction, teaching completion, and DT-only resumption. It also freezes the successful-path prompt trace and IDs, timer values, Familiar DT identities, edge-case no-ops, mismatch and empty-dataset behavior, public function arity, and the 50/50 DT boundary. Those fixtures are extraction evidence; structural value equality is the lasting application contract unless a later design deliberately hashes or signs serialized state.

Architecture tests enforce the import boundary and single-owner object identity. The full test suite and production build must pass before this branch merges.

## Deferred work

This extraction does not change `App.tsx`, Firestore clients or rules, persistence schemas, stored-flow validation, migrations, cloud transactions, session orchestration, scoring behavior, or child-facing behavior.

The `refactor/acquisition-transition-boundary` branch builds on this boundary with a storage-neutral result that pairs the next flow with an optional assessment. The application layer—not the engine or transition—adds child, session, dataset-envelope, timestamp, and persistence context.

The later `feature/persistent-acquisition` branch owns versioned progress envelopes, migration and strict validation, revision-aware atomic or idempotent persistence, conflicting-device handling, Firestore Emulator coverage, and reduction of Acquisition orchestration in `App.tsx`.
