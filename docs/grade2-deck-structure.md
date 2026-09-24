# Grade 2 Weekly Focus deck structure observed

Source: `26-27 G2 Weekly Focus`, Google Slides presentation ID `10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4`.

The deck was inspected read-only. It currently contains four valid weekly Mandarin slides:

| Slide | Page ID | Week | Tier 1 targets |
|---|---|---|---|
| 1 | `g40a01d2cf58_0_10` | 9/21–9/25 | 比如、部分、更、方便、美好 |
| 2 | `g40a01d2cf58_0_0` | 9/14–9/18 | 出生、但是、运动、地方、不同 |
| 3 | `g3fa28218657_0_10` | 9/8–9/11 | 美国、带、路、到、都 |
| 4 | `g3fa28218657_0_0` | 8/31–9/4 | 很短、也、笑、学校、说 |

`tests/fixtures/grade2-presentation.json` transcribes only these four observed slides and preserves their observed page IDs. It is test-only input, not a live export or production seed. The separate writing-workshop and malformed fixtures are synthetic parser-contract inputs; they are intentionally excluded from the canonical observed fixture and must not be described as source-deck observations.

The deck uses headings such as `Week 9/21-9/25`, with no parentheses around the date range. Tier 1 appears in the Mandarin vocabulary section as `Tier 1:` or `Tier 1：`, followed by comma- or Chinese-comma-separated terms. Tier 2 and Tier 3 follow the Tier 1 list and must not be imported by the initial Grade 2 path.

The importer also accepts explicit writing-workshop markers. A workshop slide with a valid date range becomes a zero-word placeholder dataset; a malformed slide remains an import error and is skipped.

## Tier 1 context boundary

The slide's `Sentence Frame` and example-writing content is unrelated to the Tier 1 target words. It must never be interpreted as a Tier 1 sentence, paired with a Tier 1 term, or used as the spoken context for Tier 1 dictation. Future importer work must not infer word-specific context from that section. Any Tier 1 audio context must come from a separately verified source or remain empty until such a source exists.
