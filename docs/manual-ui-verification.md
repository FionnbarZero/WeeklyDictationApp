# Manual UI verification

This is the acceptance contract for the read-only local canonical deck-driven flow. It does not write to Google Slides or Firestore. If a listed control or transition is unavailable, record it as an implementation failure rather than substituting another lifecycle.

1. Start the local app with `npm run dev`.
2. In a fresh browser profile, choose `Import deck JSON` and load `tests/fixtures/grade2-presentation.json`. The separate `grade2-writing-workshop.json` and `grade2-malformed-synthetic.json` files are synthetic parser-contract inputs and are not part of the canonical observed deck fixture.
3. Confirm the dashboard shows these datasets, newest first:
   - Acquisition: `9/21–9/25`
   - Test Review: `9/14–9/18`
   - Warmup sources include eligible words from `9/8–9/11` and `8/31–9/4`, while those datasets retain their permanent archived identity.
4. Confirm Acquisition and Test Review have separate start controls and that the dashboard contains no placeholder or date-only dataset. Each canonical fixture dataset shows Grade 2 and five words.
5. Start Acquisition. Confirm its required Warmup runs first, uses the adaptive imported-word selection, and advances through the 10-second Grade 2 Warmup items before the 20-second Acquisition flow.
6. Complete the Acquisition session, refresh after returning to the dashboard, and confirm the completed Warmup and Acquisition progress remains.
7. Start Test Review separately. Confirm its required Warmup runs first and the primary phase uses the `9/14–9/18` dataset with the 10-second Test Review timer. Its results and score must remain separate from Acquisition.
8. Start another session and refresh before completing it. Confirm the incomplete session contributes no results, scores, adaptive-state updates, or completed-session record, while earlier completed progress remains.
9. Start Acquisition again and confirm the displayed and replayed target is the active acquisition prompt, not a flat queue item. Distractor prompts must not become primary scored answers.
10. Confirm no context sentence is spoken or displayed unless it came from an approved `word.sentence` source. Sentence Frames and unrelated slide prose must never be used.

The canonical fixture is test-only input. It is not production seed data and must not be copied into `sampleDatasets` or another runtime fallback.
