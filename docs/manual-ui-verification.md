# Manual UI verification

This is the acceptance contract for the read-only local canonical deck-driven flow. It does not write to Google Slides or Firestore. If a listed control or transition is unavailable, record it as an implementation failure rather than substituting another activity.

## Setup

1. Start the local app with `npm run dev`.
2. Open the displayed local URL with `?testDate=2026-09-23`, for example `http://localhost:5173/?testDate=2026-09-23`. The parameter works only in Vite development mode and is ignored by production builds.
3. Confirm a persistent banner says `Testing as September 23, 2026` and `Development only`.
4. Use a fresh browser profile. Confirm the app shows `Import deck JSON`; if it asks for a Firebase sign-in, stop because this is not the read-only local verification path.
5. Choose `Import deck JSON` and load `tests/fixtures/grade2-presentation.json`. The separate `grade2-writing-workshop.json` and `grade2-malformed-synthetic.json` files are synthetic parser-contract inputs and are not part of the canonical observed deck fixture.

The canonical fixture is test-only input. It is not production seed data and must not be copied into runtime fallback data. The test-date override changes only the app clock; it does not alter fixture dates, datasets, lifecycle calculations, persistence rules, or production configuration.

## Dashboard

1. Confirm the dashboard shows these datasets, newest first:
   - Acquisition: `9/21–9/25`.
   - Test Review: `9/14–9/18`.
   - Warmup sources include eligible words from `9/8–9/11` and `8/31–9/4`, while those datasets retain their permanent archived identity.
2. Confirm Acquisition and Test Review have separate start controls.
3. Confirm there are no placeholder or date-only datasets and that each canonical fixture dataset shows Grade 2 and five words.

## Acquisition

1. Start Acquisition. Confirm its six-word adaptive Warmup is offered first and may be completed or skipped.
2. Confirm every Acquisition prompt has its own timed writing frame, reveal frame, and Yes/No self-assessment without an extra transition screen.
3. Confirm Introduction presents two different 5-second Established DTs, one 10-second show/say/copy target, and one 10-second hidden weekly target.
4. Mark the Introduction target correct and confirm Expanded Trials use exactly `target, target, DT, target, DT, DT, target, DT, DT, DT, target`.
5. Confirm the five hidden weekly-target timers are `10, 9, 8, 7, 6` seconds.
6. Confirm Replay uses the active prompt and Skip Timer opens that prompt's review without skipping its self-assessment.
7. Complete the first target. Confirm it becomes an Earned DT and later DT positions can draw from both Established and Earned pools without immediate repetition when an alternative exists.
8. Mark a hidden weekly target incorrect. Confirm Correction uses `copy, copy, hidden target, new Established DT, final hidden target`, then resumes the next unfinished teaching position after success.
9. Confirm an incorrect Earned DT enters Correction and returns to the exact interrupted weekly-target position after success.
10. Confirm three consecutive assessed errors restart the affected weekly target or Earned DT at Introduction.
11. Select `Done for today`, refresh, and reenter Acquisition. Confirm the exact next prompt, timers, bags, Earned DT pool, and error state resume without duplicating the completed trial.
12. Refresh during an unanswered prompt. Confirm only that unfinished prompt restarts and previously reviewed work remains saved.
13. Complete all weekly targets. Confirm a later Acquisition visit becomes open-ended DT-only practice.

## Scoring and separation

1. Confirm `Done for today` creates a visit score only from that visit's hidden weekly-target responses.
2. Confirm Established DT, Earned DT, and show/copy responses never change the weekly Acquisition percentage.
3. Confirm reviewed DTs do not change the displayed weekly score and a DT-only visit creates no weekly score. The stored DT-observation stream is covered by automated tests until a dedicated child-facing DT report exists.
4. Start Test Review separately. Confirm its offered Warmup and primary `9/14–9/18` dataset remain independent from Acquisition and use the 10-second Test Review timer.
5. Confirm skipping or abandoning Test Review creates no Test Review score and does not count provisional answers.
6. Confirm no context sentence is spoken or displayed unless it came from an approved `word.sentence` source. Sentence Frames and unrelated slide prose must never be used.
