# Dictation context review contract

The teacher-owned grade spreadsheet or slide deck remains authoritative for target text, target order, tier, grade, unit, and instructional dates. It is never changed by the context workflow.

Short contexts live in a separate, grade-specific review spreadsheet. Each row is tied to the source document, source unit, tier, stable target occurrence ID, and exact target text. A context is written as one to six space-separated Chinese vocabulary units so the six-word limit can be validated without guessing Chinese word boundaries.

The current Kindergarten companion is [Kindergarten Dictation Context Review](https://docs.google.com/spreadsheets/d/1L-JZJgiuTM_b61U0NfTIdCnIJ-BfkcGYuPbySwgczz8/edit). Grade 2 and Grade 5 companions remain blocked on their authoritative source links.

Statuses are `Draft`, `Approved`, and `Revise`. The app may use only `Approved` rows. Draft and revision-requested rows cannot enter child-facing audio. The target must occur at least once; repetition is allowed when it changes or clarifies meaning. Contexts are grade-specific and follow the same target through Dojo, Final Boss, and Spirit Realm.

The child-facing sequence is stored and played as separate segments:

1. target word
2. approved context sentence or phrase
3. target word
4. target word

Word and context audio paths remain separate so approving a revised context does not require regenerating the isolated word recording. Missing recorded audio falls back immediately to browser speech. Context generation and approval never happen live in a child session.

An approved companion spreadsheet export is converted to `DictationContextCatalog` schema version 1 and overlaid only after its source identity and target occurrence match the authoritative dataset exactly.

## Refreshing the app catalog

1. Export the reviewed grade tab from Google Sheets as CSV.
2. Run `npm run import:dictation-contexts -- kindergarten /absolute/path/to/export.csv`.
3. Run the test suite. Only rows whose Status is exactly `Approved` will enter projected Dojo, Final Boss, and Spirit Realm datasets. `Draft` and `Revise` remain present in the checked-in catalog but are ignored at runtime.
4. After the Mandarin production voice is selected, run the Kindergarten audio generator. It creates a separate cached file for every approved context and records it under `manifest.contexts`; isolated-word files remain independently reusable.

The checked-in Kindergarten catalog is `src/curriculum/contextCatalogs/kindergarten.json`. The app never reads the live review Sheet during a child session. This keeps curriculum stable and makes every approval change reviewable in source control.
