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

`src/curriculum/identity.ts` owns school-year normalization, canonical dataset IDs, ordered vocabulary-occurrence IDs, and content fingerprints. Ordered occurrences remain separate even when their text is identical.

`src/curriculum/canonical.ts` converts adapter drafts into normalized candidates and validates source identity, week dates, tier contents, source positions, occurrence IDs, and fingerprints.

`src/slidesImporter.ts` preserves the existing public Grade 2 importer API and converts validated Tier 1 candidates into the existing `Dataset` and `Word` shapes. Tier 2 and Tier 3 remain structured candidate metadata; they do not enter Grade 2 dictation practice in this refactor.

`src/practice/profiles/grade2.ts` contains Grade 2 child-facing settings. Source parsing does not choose timers or teaching sequences, and practice code does not need to know whether vocabulary came from Slides or Sheets.

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
