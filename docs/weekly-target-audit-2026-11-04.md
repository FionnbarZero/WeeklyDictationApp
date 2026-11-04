# Weekly target audit — November 4, 2026

**Result: not fully aligned.** The published app misimports Grade 2's November 2–6 vocabulary and fails to recognize Kindergarten's November 2 project week. This is an audit only; no application, hosting, teacher document or family record was changed.

## Sources and scope

- [Kindergarten Weekly Focus](https://docs.google.com/spreadsheets/d/1lBWZeDhb_IIhBJ8SIzZts637JBS6HETh6uFblNNTOxA/edit): all 12 available weekly tabs, August 17–November 2. Read spreadsheet metadata and bounded Mandarin ranges, including the current and preceding tabs.
- [Grade 2 Weekly Focus](https://docs.google.com/presentation/d/10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4): all 10 available slides, August 31–November 2. Compared the native Mandarin vocabulary cells with the curriculum service and deployed client importer.
- [Published Academy](https://ninjadojo.meghangames.com/): manifest returned 200 and source `185605beaf99ecb9824c4dbc195b7e10b3a6393c`, package tree `f46fb9df5e1814244fbb815c0a799f80f86b6b3a1b90469d3dc03c10379f04e4`. Relevant local application/backend/public source has no difference from that revision.
- Current week evaluated as November 2–6 using the owner's November 4 Pacific date. No future weekly source was present.

The hosted browser observation used fresh, synthetic intercepted family/authentication/storage fixtures (`ninja-device-weekly-audit@example.invalid`) and the exact live curriculum snapshots fetched for this audit. It loaded the published assets and opened each grade's Dojo. This verifies curriculum display without accessing a real family. It is not a new authentication, cloud persistence, audio or physical-device acceptance test. No real test account was created.

## Current-week findings

### Grade 2 — incorrect vocabulary displayed

The teacher's November 2–6 lesson is **《种子发芽了》**. Its vocabulary is:

| Level | Correct targets |
| --- | --- |
| Tier 1 — writing (6) | 种、第一、足够、每天、高兴、比 |
| Tier 2 — reading/listening/speaking (8) | 颗、袋、件、老师、种子、花园、阳光、希望 |
| Tier 3 — listening/speaking (7) | 发芽、开花、浇水、收获、剩下、向日葵、送 |

The source annotates 种 as `种（动词）`: the parenthesis identifies the verb meaning, not additional vocabulary.

The service contains the new source text. The client nevertheless accepts these incorrect extracted values as a valid current lesson:

- Tier 1: `Icansay`, `read`, `listen`, `andwrite`.
- Tier 2: `Icansay`, `read`, `andlisten`, `Tire3`, `Icansayandlisten`.
- Tier 3: empty.

The published Dojo visibly shows **4 writing · 5 reading**, with those English fragments. The real vocabulary headings omit colons; the Grade 2 parser requires colons and instead consumes a later explanatory legend. Validation does not reject the resulting English prose. The issue is import interpretation, not an absent teacher update.

Repair should extract the actual Mandarin vocabulary section, handle observed heading variations and the verb annotation, and prevent explanatory legends from becoming target lists. Recheck every retained week and current-week selection. Resource availability for newly imported words must be checked separately; this audit does not establish audio or handwriting support for them.

### Kindergarten — current project week excluded

The November 2 tab says **Unit 2: Needs and Environment — Final Project Creating** and supplies no new writing or high-frequency word list. It should not generate an invented vocabulary cohort.

The importer marks that tab malformed (`kindergarten_no_instruction_unresolved`, `missing_tier_1`). Its existing project/review recognition does not match this wording. The published Dojo therefore labels **Week 11 10/26** as **CURRENT WEEK** and shows the prior correct targets:

- Writing: **大、马**.
- High-frequency reading: **绿色、黄色、吃**.

Retaining earlier practice is not itself a vocabulary error. The defect is failing to represent the current project week and presenting October 26 as current. A correction should recognize the dated project-only source while preserving earlier learning/progress; the sheet alone does not specify an assessment or a new review cohort.

## Every available week

All eight Kindergarten weeks with explicit word lists match the teacher source. Eight of Grade 2's nine vocabulary weeks match after the already-published October 19 Wetland recovery; November 2 does not. Counts below preserve source order and tier membership, including words appearing in more than one tier.

| Kindergarten source week | Writing / reading counts | Result |
| --- | --- | --- |
| November 2 | No new list | Project week incorrectly excluded; October 26 shown as current |
| October 26 | 2 / 3 | Exact match |
| October 19 | 2 / 3 | Exact match |
| October 13 | 2 / 3 | Exact match; scheduled week normalized to Monday October 12 |
| October 5 | 2 / 3 | Exact match |
| September 28 | No new list | Explicit project/assessment-review week recognized |
| September 21 | 3 / 2 | Exact match |
| September 14 | 3 / 2 | Exact match |
| September 8 | 4 / 2 | Exact match; scheduled week normalized to Monday September 7 |
| August 31 | 4 / 3 | Exact match |
| August 24 | No explicit list | General learning topics; excluded as incomplete, no missing enumerated targets established |
| August 17 | No explicit list | General learning topics; excluded as incomplete, no missing enumerated targets established |

| Grade 2 source week | Tier 1 / 2 / 3 counts | Result |
| --- | --- | --- |
| November 2 | 6 / 8 / 7 expected | Incorrect English fragments imported |
| October 26 | No new list | Testing / Tier 1 review; previously approved Wetland review remains the relevant fallback |
| October 19 | 5 / 6 / 7 | Exact match through the published, reviewed Wetland recovery |
| October 13 | 5 / 9 / 4 | Exact match |
| October 5 | 9 / 0 / 0 | Writing-week list matches |
| September 29 | 9 / 0 / 0 | Writing-week list matches |
| September 21 | 5 / 7 / 8 | Exact match |
| September 14 | 5 / 7 / 3 | Exact match |
| September 8 | 5 / 4 / 6 | Exact match |
| August 31 | 5 / 5 / 5 | Exact match |

The shared service still truncates the October 19 and October 26 Grade 2 slides to their headings. The deployed client contains the specific reviewed October 19 recovery; applying it reproduces all 18 Wetland targets exactly. October 26 is a testing/review week with no new enumerated list. These qualifications prevent describing the general shared importer as fully repaired.

## Evidence and next step

Evidence is retained under `family-beta-artifacts/weekly-target-audit-2026-11-04/`:

- Native teacher metadata/ranges and compact Grade 2 Mandarin tables.
- Exact live service snapshots: Kindergarten retrieved `2026-11-04T19:57:15.253Z`, SHA-256 `ce729351e7d23ab5e450d462cbe3f3be29c3defbf6a4ad5b15ecf3403312e6e0`; Grade 2 retrieved `2026-11-04T19:57:15.800Z`, SHA-256 `2003376ada4c443b6191a866017b13901df85adeb39f95bda04862f7f1a4c81d`. Neither snapshot provides a source modification timestamp.
- Raw parsed candidates, Grade 2 inspection after the existing Wetland recovery, and `all-weeks-comparison.json` with every expected and actual target.
- `hosted-observation.json`, both grade screenshots, and `published-manifest.json`.

Recommended behavior/validation routing remains **GPT-6 Astra · Extra High**; routine audit documentation uses **GPT-6 Luna · Medium**. No model switch or independent-agent review is claimed. A new smoke-test handoff is premature until the import/project-week corrections are reviewed and served in a verified build. This audit has not implemented or published those corrections.
