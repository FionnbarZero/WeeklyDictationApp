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

The observed Mandarin curriculum is stored in multiline cells. `Writing character` maps to Tier 1, `High frequency word` maps to Tier 2, and Tier 3 is empty. Terms retain source order and repeated terms remain separate occurrences.

## Approved date rule

Every Kindergarten cycle starts Monday and ends the following Sunday. The adapter interprets the month/day in the tab title within the configured school year, moves backward to the previous-or-same Monday, and assigns the following Sunday as the end. Thus the Tuesday `09/08` tab after Labor Day belongs to the `09/07–09/13` cycle. The calculation does not inspect neighboring tabs.

## Validated source with inactive production registration

Vocabulary-bearing tabs now become canonical source-neutral candidates with workbook/tab provenance and normalized dates. The Kindergarten lifecycle activates a vocabulary cycle on its Monday, holds the latest available teaching set across a missing replacement, and groups every arrived Unit 1 set into one cumulative review. Unit 1 is explicitly configured as August 31 through September 27; its boundary is never inferred from tab order or an empty tab.

Empty tabs still receive `kindergarten_no_instruction_unresolved` and remain malformed because the workbook has no approved machine-readable no-instruction marker. The Kindergarten source registry entry and production practice profile remain inactive, so valid source candidates still cannot enter the child application.

Still unresolved:

- an approved machine-readable meaning for empty tabs such as review or no instruction;
- Kindergarten Warmup requirements and full Tier 2 assessment behavior;
- the trusted production sync deployment and administrator authorization.

The authenticated Node inspector uses OAuth and Google Sheets read endpoints only. The browser source lab uses the checked-in fixture or a user-selected local JSON file; it never contacts Google, hydrates application state, or writes Firestore. The fixture transcribes observed tab metadata and relevant Mandarin cells and is not a production data seed.
