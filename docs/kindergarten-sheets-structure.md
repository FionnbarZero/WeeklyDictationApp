# Kindergarten Weekly Focus workbook structure

Source: `Gan 2026-2027 Kindergarten Weekly Focus`, Google Sheets spreadsheet ID `1lBWZeDhb_IIhBJ8SIzZts637JBS6HETh6uFblNNTOxA`.

The workbook was inspected read-only on September 29, 2026. The spreadsheet ID is the yearly source identity; each weekly tab's numeric `sheetId` is its source-unit identity. A tab `gid` is never treated as the yearly source identity.

| Source order | Tab | Monday–Sunday cycle | `sheetId` | Tier 1 — Writing character | Tier 2 — High frequency word |
|---|---|---|---:|---|---|
| 1 | Week 7 09/28 | 2026-09-28–2026-10-04 | `459793081` | — | — |
| 2 | Week 6 09/21 | 2026-09-21–2026-09-27 | `1395217571` | 九、十、白 | 红色、蓝色 |
| 3 | Week 5 09/14 | 2026-09-14–2026-09-20 | `104196055` | 七、八、水 | 有、没有 |
| 4 | Week 4 09/08 | 2026-09-07–2026-09-13 | `1737284969` | 四、五、六、心 | 我、开心 |
| 5 | Week 3 08/31 | 2026-08-31–2026-09-06 | `1468078364` | 一、二、三、人 | 爸爸、妈妈、小 |
| 6 | Week 2 08/24 | 2026-08-24–2026-08-30 | `1237090927` | — | — |
| 7 | Week 1 08/17 | 2026-08-17–2026-08-23 | `1564071554` | — | — |

The observed Mandarin curriculum is stored in multiline cells. `Writing character` maps to Tier 1. `High frequency word` and the equivalent Kindergarten wording `High-frequency reading word(s)` both map to Tier 2 reading; the source wording never creates a separate activity or tier. Tier 3 is empty. Terms retain source order and repeated terms remain separate occurrences.

## Approved date rule

Every Kindergarten cycle starts Monday and ends the following Sunday. The adapter interprets the month/day in the tab title within the configured school year, moves backward to the previous-or-same Monday, and assigns the following Sunday as the end. Thus the Tuesday `09/08` tab after Labor Day belongs to the `09/07–09/13` cycle. The calculation does not inspect neighboring tabs.

## Validated source with an inactive release gate

Vocabulary-bearing tabs now become canonical source-neutral candidates with workbook/tab provenance and normalized dates. The Kindergarten lifecycle activates a vocabulary cycle on its Monday, holds the latest available teaching set across a missing replacement, and groups every arrived Unit 1 set into one cumulative review. The authoritative workbook defines Unit 1 teaching as August 31 through September 27 and the `Week 7 09/28` tab explicitly identifies the following September 28 through October 4 cycle as end-of-unit project making and assessment review. During that review week there is no Acquisition set; the Unit 1 cohorts stay in cumulative Test Review. They enter Mastery on October 5, after the review and assessment period ends.

Validated vocabulary candidates can now become canonical source-neutral datasets that preserve Tier 1, Tier 2, Tier 3, workbook provenance, tab provenance, and the content fingerprint. Tier 1 remains the shared writing-practice compatibility view. The Kindergarten writing profile and child-facing integration are implemented, but the source registry entry remains inactive, so these datasets cannot yet enter normal child practice.

The explicit `End of Unit Project Making` and `End of Unit Assessment Review` wording on `Week 7 09/28` is recognized as the Unit 1 review marker. It creates no new vocabulary dataset. Other empty tabs still receive `kindergarten_no_instruction_unresolved` and remain malformed because their instructional meaning is not explicit.

Still unresolved:

- an approved machine-readable meaning for empty tabs other than the explicit Unit 1 review week;
- full Tier 2 assessment, recording, and scoring behavior beyond the unscored look-listen-say teaching module;
- the trusted production sync deployment and administrator authorization.

The authenticated Node inspector uses OAuth and Google Sheets read endpoints only. The browser source lab uses the checked-in fixture or a user-selected local JSON file; it never contacts Google, hydrates application state, or writes Firestore. The fixture transcribes observed tab metadata and relevant Mandarin cells and is not a production data seed.
