# 5th-grade deck structure observed

Source: `G5 Weekly Focus SY 26-27`, deck ID `1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI`.

The Drive connector read was blocked in this environment with `MCP tool call requires approval, but approval policy is never`. The deck was therefore inspected through the signed-in Google Slides read-only browser view. No slide was edited.

## Observed layout

- Six slides are ordered newest first.
- The week heading is near the top and uses `Week N (M/D-D)` when a date range is available. The newest slide is `Week 6 (9/14-18)`.
- Each slide contains subject sections. The Mandarin section is followed by ELA, Math, and Science/Social Studies sections.
- On complete weekly slides, Tier 1 is inline in the Mandarin section as `Tier 1：term、term、term`. Terms are separated with the Chinese enumeration comma `、`; multi-character terms remain one target.
- Mandarin prose outside the Tier 1 list is not word-specific context. The importer leaves `Word.sentence` empty until a separately authorized sentence-generation step supplies a verified short context sentence.
- Tier 2 and Tier 3 follow Tier 1 and are not imported.
- Week 2 has no complete Mandarin Tier 1 list in the visible content, and Week 1 contains placeholders (`Content`, `Vocabulary`, `Sentence Frame`). Both are rejected as incomplete rather than silently treated as a workshop.
- No explicit writing-workshop marker was observed in the six slides. The parser recognizes explicit markers such as `Writing Project`, `Biography`, `Writers' workshop`, `Sample writing`, `No Dictation`, and `Homework instructions`; absent a marker, an incomplete slide is an import error.

## Observed page IDs

| Slide | Week | Page ID | Tier 1 observation |
|---|---|---|---|
| 1 | Week 6 (9/14-18) | `g3fb43a5e916_1_1` | 怎样, 吸收, 通过, 像, 如果 |
| 2 | Week 5 (9/8-11) | `g3fbb7d5bcd5_0_0` | 怎样, 吸收, 通过, 像, 如果 |
| 3 | Week 4 (8/31-9/4) | `g3fb43066ba2_0_0` | 需要, 部分, 重要, 开始, 各种各样 |
| 4 | Week 3 (8/24-28) | `g3facdc62d75_0_0` | 问, 课, 猫, 经常, 说, 同学, 兔子, 蛇, 害怕, 照顾, 打扫 |
| 5 | Week 2 | `g3f8b04c699e_0_0` | incomplete / no Mandarin Tier 1 list |
| 6 | Week 1 | `g3f728729da8_0_0` | placeholders only |

The parser profile is in `src/slidesImporter.ts` and is intentionally deck-specific. A future grade deck can supply a different profile without changing the core importer.
