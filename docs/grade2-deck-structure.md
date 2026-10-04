# Grade 2 Weekly Focus deck structure observed

Source: `26-27 G2 Weekly Focus`, Google Slides presentation ID `10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4`.

The deck was inspected read-only on October 3, 2026. It currently contains six valid weekly Mandarin slides:

| Slide | Page ID | Week | Tier 1 targets |
|---|---|---|---|
| 1 | `h1d5bf5efbcb9e870_3_0` | 10/5–10/9 | 英雄、每个、勇敢、保护、动物、让、因为、帮助、有爱心 |
| 2 | `h3a3f84970763d5dc_0_0` | 9/29–10/2 | 英雄、每个、勇敢、保护、动物、让、因为、帮助、有爱心 |
| 3 | `h612a9ed99849d410_0_0` | 9/21–9/25 | 比如、部分、更、方便、美好 |
| 4 | `g40a01d2cf58_0_0` | 9/14–9/18 | 出生、但是、运动、地方、不同 |
| 5 | `g3fa28218657_0_10` | 9/8–9/11 | 美国、带、路、到、都 |
| 6 | `g3fa28218657_0_0` | 8/31–9/4 | 很短、也、笑、学校、说 |

`tests/fixtures/grade2-presentation.json` retains the earlier four-slide observation for deterministic regression tests. It is test-only input. `public/curriculum/grade2-presentation.json` is the reviewed runtime snapshot: release packaging refreshes it from the registered deck in trusted Node/CI, strips non-Mandarin sections, validates it, and freezes its checksum and retrieval time into the artifact manifest. The browser never receives Google credentials or direct Slides API access.

The deck uses headings such as `Week 9/21-9/25`, with no parentheses around the date range. Tier 1 appears as `Tier 1:` / `Tier 1：`; the two newer writing weeks use the misspelled source label `Writing vocabualry：`, which is treated as the Grade 2 Tier 1 heading. The source adapter preserves Tier 2 and Tier 3 as structured candidate metadata, but only Tier 1 enters the current Grade 2 dictation datasets.

The importer also accepts explicit writing-workshop markers. A workshop slide with a valid date range becomes a zero-word placeholder dataset; a malformed slide remains an import error and is skipped.

## Tier 1 context boundary

The slide's `Sentence Frame` and example-writing content is unrelated to the Tier 1 target words. It must never be interpreted as a Tier 1 sentence, paired with a Tier 1 term, or used as the spoken context for Tier 1 dictation. Future importer work must not infer word-specific context from that section. Any Tier 1 audio context must come from a separately verified source or remain empty until such a source exists.
