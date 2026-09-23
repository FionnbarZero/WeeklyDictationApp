# Weekly Dictation

Prototype for the Mandarin dictation practice app described in [`PROJECT_PLAN.md`](./PROJECT_PLAN.md).

## Run locally

```bash
npm install
npm run dev
```

The prototype uses sample child profiles and six permanent date-range datasets covering the current week and the five preceding weeks. Completed results and dataset scores are kept in the browser's local storage so history survives on the same device. Incomplete sessions remain in memory only and are discarded on exit or refresh. Audio uses the browser's `zh-CN` speech synthesis voice as a temporary stand-in for the planned cached Google Cloud TTS audio.

## Included in this stage

- Permanent weekly datasets with Acquisition and Test Review lifecycle phases
- Required Warmup before every primary session
- Automatic Mandarin playback and Replay
- Each target follows a word → 1-second pause → sentence → 1-second pause → word → 1-second pause → word sequence
- Warmup, Word 1 / Word 2, and Test complete interstitials
- 5-second Warmup, 20-second Acquisition, and 10-second Test Review timers
- Right/wrong recording only during review and abandonment discard behavior
- Dataset-level scores and a separate graph for every date-range dataset
- Safe preservation of legacy records whose exact date range is unknown
- Sample family profiles with Switch Child behavior

Authentication, Firestore, Google Slides importing, administrator settings, and Cloud Run scheduling remain later stages in the plan.
