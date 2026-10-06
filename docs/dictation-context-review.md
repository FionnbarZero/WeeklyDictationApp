# Supplemental meanings and context policy

## Current owner decision

On October 5, 2026, the owner authorized generating supplemental meanings, Mandarin contexts, and pinyin without a manual preapproval queue. This supersedes the earlier requirement that every generated sentence be personally reviewed before use. Teacher documents still exclusively define vocabulary, target order, tier, grade, unit, and instructional dates. Generated material must not be described as teacher-authored or written back into those documents.

Shuriken Match may show Chinese words and English meanings as text with tap-to-hear audio. Context Gap Dash uses an audible Mandarin sentence with the target removed for selection. Sushi Scramble arranges words into a sentence containing the Tier 1 target and must allow more pieces for longer sentences. Dictation Streak keeps the four-part word → context → word → word sequence and teaches pinyin for both tiers. Sentences should fit the grade and intended meaning; a previous fixed six-unit cap must not silently truncate longer Sushi Scramble sentences.

Before release, validate target/source identity, vocabulary usage, pinyin and audio alignment, age-appropriate wording, and game-format constraints. Save a versioned content record so later corrections can be linked to problem reports and prior results are not silently rewritten. Reuse validated material rather than regenerate it randomly during a child's activity. Generation failure or invalid content should be contained to the affected prompt or game, not replaced by invented teacher targets.

The existing Kindergarten review Sheet below can remain a reference or correction workspace; it is no longer a mandatory human approval gate. Grade 2 and Grade 5 source identities have already been supplied and connected. The current importer still accepts only its existing Approved schema: changing that implementation and adding validated generated-content support are pending work, not accomplished by this policy edit.

See [ADR 0008](./decisions/0008-family-beta-product-and-release-policy.md) and the [game requirements](../ROADMAP.md#edugames-rules-within-ninja-dojo).

## Existing catalog implementation

The following describes the current approval-only catalog mechanism for compatibility and maintenance. It is not the new product approval requirement.

The teacher-owned grade spreadsheet or slide deck remains authoritative for target text, target order, tier, grade, unit, and instructional dates. It is never changed by the context workflow.

Short contexts live in a separate, grade-specific review spreadsheet. Each row is tied to the source document, source unit, tier, stable target occurrence ID, and exact target text. A context is written as one to six space-separated Chinese vocabulary units so the six-word limit can be validated without guessing Chinese word boundaries.

The existing Kindergarten companion is [Kindergarten Dictation Context Review](https://docs.google.com/spreadsheets/d/1L-JZJgiuTM_b61U0NfTIdCnIJ-BfkcGYuPbySwgczz8/edit). No new mandatory companion Sheet is required for Grade 2 or Grade 5.

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
