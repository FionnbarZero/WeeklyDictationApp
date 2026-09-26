# Canonical curriculum source boundary

Curriculum input now follows one explicit, pure pipeline:

```text
raw source payload
→ source-specific adapter
→ WeeklyDatasetCandidate
→ shared canonical identity and validation
→ compatibility Dataset[] / Word[] output
```

No layer in this pipeline fetches Google data, reads or writes Firestore, or performs another network operation. A trusted caller is responsible for obtaining the raw payload. Existing browser, CLI, and backend callers may continue to use `importWeeklyDatasets`; it is the compatibility entry point and now routes Grade 2 input through this boundary.

## Responsibilities

`src/curriculum/adapters/googleSlides.ts` understands a Google Slides-shaped payload. It extracts source text, dates, vocabulary tiers, workshop markers, source order, and source provenance according to a supplied Slides parser profile. It produces candidates rather than application datasets.

`src/curriculum/model.ts` defines source-neutral payload, provenance, vocabulary-occurrence, and weekly-candidate types. Slides use the presentation ID and slide/page ID as source identity. A later Sheets adapter can use the spreadsheet ID and tab/range identity without pretending that a row is a slide.

`src/curriculum/identity.ts` owns school-year normalization, canonical dataset IDs, ordered vocabulary-occurrence IDs, and versioned vocabulary-content fingerprints. Ordered occurrences remain separate even when their text is identical. The fingerprint intentionally excludes the instructional role so the same vocabulary can move from preview to current confirmation without appearing to be different content.

`src/curriculum/canonical.ts` converts adapter drafts into normalized candidates and validates source identity, real ISO week dates, date order, tier contents, source positions, occurrence IDs, and fingerprints.

`src/curriculum/classification.ts` performs source-neutral batch classification directly on normalized candidates. It groups same-week candidates, chooses authoritative provenance deterministically, compares stored dataset references, and returns exactly one ordered decision with provenance for every source candidate. Several candidate decisions may select, confirm, or duplicate one canonical dataset, but the individual source outcomes are never collapsed.

`src/slidesImporter.ts` preserves the existing public Grade 2 importer API and converts validated Tier 1 candidates into the existing `Dataset` and `Word` shapes. Tier 2 and Tier 3 remain structured candidate metadata; they do not enter Grade 2 dictation practice in this refactor.

`src/practice/profiles/grade2.ts` contains Grade 2 child-facing settings. `src/practice/profiles/registry.ts` is the explicit runtime dispatcher. Acquisition timers and sequences, warmup size, and warmup-promotion thresholds are resolved through that dispatcher for the child's grade. Source parsing does not choose timers or teaching sequences, and practice code does not need to know whether vocabulary came from Slides or Sheets. A grade without a registered practice profile cannot silently inherit Grade 2 behavior.

`src/config.ts` exposes a source-neutral registry keyed by `sourceType` and `sourceDocumentId`. Slides-only compatibility names remain at the importer boundary, but a Sheets entry does not need fake deck fields.

## Collision safety

Within one source payload, candidates for the same canonical week are grouped before any write decision and compared by status and normalized vocabulary fingerprint. Identical candidates are idempotent duplicates. A matching preview/current pair is confirmation, with the current section authoritative. Equivalent candidates at the same role use stable source-unit identity—not slide order—as the deterministic canonical provenance. Different vocabulary for the same week marks every candidate in that group as a conflict and removes that week from the write plan.

Trusted dataset writes persist the fingerprint, candidate status, and instructional role as server-side dataset metadata. Later import runs and the guarded command-line write path read that metadata before planning writes. Local read-only hydration stores the same comparison reference separately from the child-facing Grade 2 dataset so a later changed source is detected without changing established Grade 2 output. When a stored preview is later confirmed by one or more identical current sections, its role is refreshed once while its original source provenance and vocabulary documents remain unchanged. A changed source for an existing week is reported as a conflict, no replacement is written, and the previous valid dataset remains intact. Legacy datasets that predate stored fingerprints remain ID-only duplicates until they are deliberately reviewed or migrated; the importer does not guess their prior content.

Per-source duplicate classifications and deterministic import-log identities remain unchanged. A duplicate-only batch is now explicitly acknowledged as a successful no-change operation.

## Grade 2 compatibility contract

The refactor must preserve:

- canonical dataset and Tier 1 word IDs;
- dates, labels, word text, and source order;
- deck and slide provenance;
- writing-workshop, malformed, duplicate, and import-log outcomes;
- empty approved context rather than inferred slide prose;
- existing Grade 2 lifecycle timers, BM vocabulary, and Acquisition sequences;
- the `importWeeklyDatasets`, `parseSlide`, and related compatibility APIs.

`tests/canonicalSource.test.ts` freezes the observed Grade 2 fixture output and separately verifies workshop, malformed, and duplicate behavior. It ignores only the volatile `importedAt` timestamp.

## Adding a future source adapter

1. Add a source-specific adapter that implements `SourceAdapter<Payload>` and produces `WeeklyDatasetCandidate[]`.
2. Give the adapter and its extraction rules explicit versioned IDs.
3. Preserve source order and neutral provenance (`sourceType`, `sourceDocumentId`, and `sourceUnitId`).
4. Route every candidate through `canonicalizeWeeklyDatasetCandidate`; do not generate final dataset or word IDs in the adapter.
5. Register one authoritative source for the grade and school year.
6. Add source fixtures and golden tests before activating the profile.
7. Keep source-profile rules separate from the grade's practice profile.

Grade 5 and Kindergarten extraction are intentionally not implemented by this refactor. Their later branches may add adapters and profiles only after the Grade 2 golden compatibility tests remain green.
