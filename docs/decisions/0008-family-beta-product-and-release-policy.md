# ADR 0008 Family beta product and release policy

Status: Accepted — October 5, 2026. Implementation is partial; see [current status](../../STATUS.md).

## Context

The three family apps are live with automatic curriculum refresh and browser-local completed scores/reports. Older documents still describe undeployed, session-only prototypes and repeated per-grade approval gates. The owner clarified the next priorities and the embedded EduGames behavior after auditing those conflicts.

## Decision

- Work Grade 5 first. Prioritize bug fixes and reliable daily learning/Boss tests, then game integration, then UI. Target iMac and iPad. Children choose activities freely and end visits with Done for today.
- Publish tested fixes to the affected permanent live grade without requesting another routine deployment approval. Retain exact-artifact verification, live checks, and rollback. This is not permission to reset child data, weaken security, change production authentication, or perform an unreviewed migration. Default-branch integration follows repository protections; do not bypass a refused or protected merge.
- Keep writing acquisition and Stroke Order Slay, and reading acquisition and Whispering Scrolls, separately selectable with separate progress. Neither pair is to be labelled experimental. The alternatives follow the complete existing grade-owned acquisition rules. Completing one does not complete the other. Preserve the earlier shared Warmup policy unless separately changed.
- Checkpoint each completed acquisition trial. Resume at the next teaching position, restarting only an unfinished prompt. Do not restart completed work when the child returns tomorrow.
- Use the game-to-tier assignments in the [roadmap](../../ROADMAP.md#edugames-rules-within-ninja-dojo). Both-tier games mix tiers in a round. Other reinforcement games use the most recent earlier week containing relevant targets; acquisition uses its current targets; Spirit Realm uses eligible mastered targets and full Warmup rules.
- Collect separate results for each game and show progress across a week. Matching, reading, writing, pinyin, and game completion are distinct observations. Cohort progression remains Acquisition → Ninja Skills/Final Boss → Spirit Realm/Warmup after the configured grade-owned phase, without a new game-accuracy threshold. Do not equate entering the mastery pool with demonstrated perfect recall.
- Teacher sources define vocabulary, tiers, dates, and unit boundaries. Generate supplemental meanings, context sentences, and pinyin without requiring the owner's advance review. English meanings are explicitly allowed in Shuriken Match. Validate and version the material and allow reported mistakes to be corrected; do not alter teacher sources or represent generated material as teacher-authored.
- Shuriken Match displays Chinese and English text with tap-to-hear audio. Context Gap Dash uses an audible Mandarin cloze sentence. Sushi Scramble assembles words into a sentence containing a Tier 1 target and supports longer sentences. Dictation Streak mixes both tiers, preserves word → context → word → word prompts, and uses pinyin input for each character: show Chinese candidates, let the child choose the correct one, and repeat until the word or phrase is assembled. Reuse the existing module's input pattern rather than adding handwriting or a pinyin-only answer mode.
- Whispering Scrolls follows the existing reading acquisition rules: record, hear the child's recording followed by the correct model, then self-assess. Teaching/model presentations and independent assessed trials retain their different model-reveal rules. This is not automatic pronunciation grading. Audio remains temporary and is not uploaded or retained.
- Problem reporting pauses game movement and timers while preserving the exact position. Reports save locally and are shared together at session end; sending still requires the device's email/share action.
- Add grade links to the existing homepage, retaining each app's origin and saved data.

## Follow-up confirmations

The owner subsequently approved secure family syncing, including parent sign-in and production database access, while children remain signed out and existing records are preserved. This supersedes the one-device-only constraint for the new authenticated release. Consolidate the maintained family entry point at `ninjadojo.meghangames.com` with three grade links on the homepage so a parent signs in once per device at that origin. Retain existing browser records and prior hosted versions; do not silently assign device-only learner histories to new online profiles. Additive family-sync security changes are authorized; unrelated policy changes and data resets are not.

The owner confirmed Dictation Streak's pinyin-to-Chinese-candidate input and directed Whispering Scrolls to follow the existing acquisition rules rather than choose a separate comparison order. Grade-owned rules remain authoritative: Grade 5 and Grade 2 currently use five Expanded target presentations at 10, 9, 8, 7, and 6 seconds; Kindergarten reading has its own spacing and correction policy. Older archived four-target wording must not silently replace the current strategy.

## Consequences and supersession

ADR 0007 remains the acquisition-rule and isolation reference, but its experimental labels, one-off rollout scope, and repeated stable-promotion approval requirement are superseded here. ADR 0005's writing-only default does not describe the October 5 Kindergarten family beta, which includes completed reading results. The subsequent explicit family-sync authorization permits those beta results and ordinary reading checkpoints in the authenticated family collection; it does not activate unrelated legacy production capabilities or authorize historical migration.

Manual approval of every supplemental sentence and every ordinary beta deployment is no longer a gate. Existing importers may still enforce their earlier approval schema until deliberately changed and tested; documentation alone does not enable generated content or implement missing game behavior.

The owner wants local source, GitHub, and live behavior aligned. Release records must distinguish an implemented requirement from a planned one and record the deployed source revision. Documentation-only commits do not require rebuilding an unchanged app. A protected main-branch merge is separate from publishing an already-tested grade artifact and cannot be claimed complete unless verified.
