# Missing game content — October 25, 2026

The owner prioritized missing game content before the other roadmap work. This stage fills supporting language in the existing combined isolated preview; it does not change the teacher's targets, grade, tier, order, dates, game policies or the frozen fifth-grade presentation.

## Scope and provenance

`practice-language-2026-10-25-v1` contains **149 grade-specific entries / 191 retained Tier 1 and Tier 2 occurrences across 20 weeks**:

| Grade | Distinct targets | Occurrences | Weeks | Newly usable lesson/game combinations |
| --- | ---: | ---: | ---: | ---: |
| Kindergarten | 37 | 38 | 7 | 21 |
| Grade 2 | 62 | 75 | 7 | 20 |
| Grade 5 | 50 | 78 | 6 | 12 |

Every retained Tier 1/2 target now has a meaning, Pinyin, one choice set per character, an original Mandarin sentence containing the exact target once, and explicit ordered sentence tokens. These are generated supplemental materials, **not teacher-authored curriculum**. Tier 3 remains excluded under the existing game policies. New imported words outside this catalog remain unsupported until validated; this is not automatic content generation.

The catalog is matched to exact grade/source-document/target text. Existing source-provided language takes precedence, including alternate pronunciations. Immutable saved packs bypass catalog enrichment and keep their original language and eligibility. The preview flag is enabled only by the combined W preview builder; ordinary production builds retain the previous catalog and unchanged initial bundle budget.

Sentence wording and child-friendly meanings were authored for this stage. Pronunciations were cross-checked against the [CC-CEDICT project's published dictionary](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), using its linked UTF-8 archive as a reference, not as bundled application data. Neutral syllables include *měi ge, tài yang, yòng chu, gào su, dì fang, yǒu yì si*; adjectival phrases and *有爱心 / 很短* were checked by their component words. Character choices use common sound or shape contrasts; distractors are not represented as exact-tone homophones. Standard lexical tones are shown rather than encoding every spoken tone change. Existing audio voices and playback safeguards are unchanged.

## Deliberate availability limits

**53 additional lesson/game combinations** are usable in the per-week inventory. This count is not 53 new games. All six existing content-driven games remain unchanged.

- Kindergarten's October 5, 12 and 19 weeks have only two Tier 1 targets. Context Gap Dash requires three; these three combinations remain unavailable.
- Grade 2's September 29 and October 5 weeks have only Tier 1 targets. Viewed alone, four games require Tier 2 or both tiers and remain unavailable. Ninja Skills already combines the most recent relevant reading and writing weeks under its approved rules; that route is tested separately and uses only those source targets.
- Grade 5 has supporting content for all six games in every retained week. Its regular curriculum is distinct from the frozen standalone eight-word assessment.

Run `node --experimental-strip-types scripts/audit-game-content.ts` to reproduce the before/after inventory. It validates the retained source files and generated packs without editing them or reading family records.

## Verification and release record

Content invariants and saved-pack checks pass for all retained weeks. The full unit suite passes **1,261 tests**; lint, formatting and production build/size checks pass. Initial production JavaScript remains **549,980 / 550,000 bytes** and CSS **46,342 / 60,000 bytes**.

The first content-test run exposed two test-setup mistakes: including Tier 3 in a game checkpoint, and an oversized synthetic attempt identifier. The test now exercises the application's Tier 1/2 checkpoint contract with a bounded identifier; no validator was relaxed. Both runs are retained. Browser interaction, exact hosted verification and delivery are recorded below once complete. These checks do not establish physical-iPad sound acceptance or authenticated cloud/cross-device acceptance.

The source/automated review remains within the already-confirmed Astra · Extra High stage. No model switch or separate-agent review is claimed. Canonical integration remains subject to the existing working-prototype acceptance and protected release gates. Parent editing, automatic source refresh and other unfinished roadmap items are not closed by this content work.
