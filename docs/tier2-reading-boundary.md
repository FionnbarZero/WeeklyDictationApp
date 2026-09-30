# Tier 2 reading boundary

Tier 2 Mandarin reading is a separate activity module that follows the exact curriculum lifecycle of Tier 1 writing for the same grade and school year. It does not calculate another lifecycle or move a curriculum set independently.

The boundary projects each grade-owned lifecycle resolution onto the canonical `dataset.vocabulary.tier2` occurrences:

- Grade 2 receives Acquisition, one Test Review, and Mastery from the Grade 2 replacement strategy.
- Kindergarten receives weekly Acquisition, its cumulative Unit Review grouping, and Mastery from the Kindergarten unit strategy.
- Grade 5 receives Acquisition, Test Review 1, Test Review 2, and Mastery from the Grade 5 progression strategy.

Reading Acquisition mirrors that grade's approved Acquisition timers and Introduction, Expanded Trials, and Correction sequences. It owns a separate strategy identity and separate Tier 2 Familiar-DT target objects. One shared response rule applies throughout Acquisition, Test Review, and Mastery: the target stays visible, the child reads it aloud, and the child self-assesses. The first boundary records no child audio; canonical audio remains a separate review control.

Tier 2 state is always scoped to `mandarin-tier2-reading`. Its progressions, attempts, DT observations, mastery terms, Warmup queues, graphs, and scores must never share Tier 1 writing state merely because the displayed term is the same.

This boundary is inactive. It does not import the module into `App.tsx`, register a production source, write storage, add microphone capture, or enable child-facing Tier 2 scoring. Grade 5's pre-activity Warmup requirement remains undecided. Production activation retains the persistence, privacy, source, and rendered-browser gates in `PROJECT_PLAN.md`.

For manual development smoke testing, run `npm run dev` and open `/tier2-reading-lab.html`. The fixture-backed lab exercises all three grade profiles entirely in memory. It is guarded by `import.meta.env.DEV` and is not linked from the production entry point.
