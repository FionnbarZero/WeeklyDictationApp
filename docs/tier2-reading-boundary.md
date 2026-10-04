# Tier 2 reading boundary

Tier 2 Mandarin reading is a separate activity module that follows the exact curriculum lifecycle of Tier 1 writing for the same grade and school year. It does not calculate another lifecycle or move a curriculum set independently.

The boundary projects each grade-owned lifecycle resolution onto the canonical `dataset.vocabulary.tier2` occurrences:

- Grade 2 receives Acquisition, one Test Review, and Mastery from the Grade 2 replacement strategy.
- Kindergarten receives weekly Acquisition, its cumulative Unit Review grouping, and Mastery from the Kindergarten unit strategy.
- Grade 5 receives Acquisition, Test Review 1, Test Review 2, and Mastery from the Grade 5 progression strategy.

Reading Acquisition owns a separate strategy identity and separate Tier 2 Familiar-DT target objects. Grade 2 and Grade 5 currently mirror their grade-owned writing timers and sequences. Kindergarten reading keeps the writing Introduction and Correction presentation sequence but owns a calibrated Expanded Trials and scoring policy: `target, DT, target, DT, DT, target, DT, DT, DT, target, DT, DT, DT, target`. Its five independent targets use 10, 9, 8, 7, and 6 seconds. Correction is feedback-only and contributes no official target score. An incorrect final Expanded target runs Correction and then returns to that same six-second scored target; only a correct scored final target promotes the word into the Earned DT pool.

During an Acquisition show/copy presentation, the app says “Read and record,” then plays `word → approved context → word → word`; assessed trials do not reveal the model first. After one recording, the child hears their recording followed immediately by the correct model and self-assesses. The response cannot be replaced; an incorrect Acquisition response enters Correction. Final Boss also permits only one recording and defers all scoring until every response is collected. Spirit Realm compares and scores the current response immediately. Microphone audio exists only for the current prompt and is disposed after assessment, prompt change, or exit.

Tier 2 state is always scoped to `mandarin-tier2-reading`. Its progressions, attempts, DT observations, mastery terms, Warmup queues, graphs, and scores must never share Tier 1 writing state merely because the displayed term is the same.

This boundary is integrated into `App.tsx` for the active Grade 2 experience and into the Kindergarten and Grade 5 development labs. It remains session-only: it does not write Tier 2 attempts, progress, scores, adaptive state, or audio. Microphone audio remains prompt-local and is disposed on assessment, prompt change, or exit. Grade 5's pre-activity Warmup requirement remains undecided. Production activation retains the persistence, source, approved-reference-audio, privacy, and rendered-browser gates in [`ROADMAP.md`](../ROADMAP.md).

For manual development smoke testing, run `npm run dev` and open `/tier2-reading-lab.html`. The fixture-backed lab exercises all three grade profiles entirely in memory and requests microphone permission only after the child presses **Record my reading**. It is guarded by `import.meta.env.DEV` and is not linked from the production entry point.
