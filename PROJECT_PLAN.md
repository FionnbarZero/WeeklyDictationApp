# Weekly Dictation App — Project Plan

## Purpose

A browser-based Mandarin dictation practice app for children in Chinese immersion programs. The public interface will be hosted through GitHub Pages and support multiple families and children. The first target language is simplified Mainland Mandarin. Pinyin and English meanings will not appear in the child interface.

## Accounts and profiles

- Parents create an account with email and password.
- One parent account can contain several child profiles.
- Each child profile has a nickname and grade.
- Parents select a child from a private dropdown or profile buttons.
- A visible Switch Child option remains available.
- Child profiles are archived rather than deleted.
- Parents update a child’s grade at the beginning of a school year.
- One parent email receives separate future progress messages for each child.
- A Notes-page link should reopen the signed-in app on the same device without repeatedly asking for the parent password. A new device or browser may require one parent sign-in.

## Deck and school-year model

There is one Weekly Focus Google Slides deck per grade per school year. Every child in a grade uses the same deck.

| School year | Grade | Weekly Focus deck | Status |
|---|---|---|---|
| 2026–27 | Kindergarten | Kindergarten deck | Active |
| 2026–27 | Grade 2 | Grade 2 deck | Active |
| 2027–28 | Kindergarten | Future Kindergarten deck | Future |

The administrator configures grade-to-deck mappings once. Future school years can be added and activated later. Parents only choose a child’s grade; the grade determines the deck automatically. Deck links or IDs are stored rather than copying the entire presentation.

## Automatic Google Slides import

The administrator’s Google account is authorized once with read-only access to the grade-level decks. Parents do not need Google Slides access or Google authorization.

Every Monday at 3:00 p.m. California time, using the timezone America/Los_Angeles, the importer checks each active grade deck.

The importer must:

1. Read the assigned deck.
2. Find the section labeled Tier 1 Words or the clearly identified equivalent.
3. Extract vocabulary from the table’s second column.
4. Split comma-separated entries into separate terms.
5. Treat each term, including multi-character terms, as one scored item.
6. Read the Monday–Friday target date range shown on the page.
7. Store the target date range, school year, grade, deck ID, page ID, and import time.
8. Prevent duplicate imports.
9. Generate missing audio for new terms.
10. Record an import log.

Valid imports activate automatically and do not require routine word-by-word approval. The app should show a non-blocking import summary for later inspection. If extraction fails or the expected structure is missing, the new set must not replace the previous valid set. The administrator should receive a clear error and be able to correct the set later.

## Weekly assignment rules

- Every weekly focus is a permanent dataset identified by its learned date range, such as `8/31–9/4`.
- During that date range, the dataset is in Acquisition with a 20-second timer.
- During the following week, the same dataset moves to Test Review with a 10-second timer.
- Older datasets remain archived and keep their original date ranges and history.
- Dataset IDs must be stable and must not be replaced by labels such as current or previous.
- Warmup is required before every Acquisition or Test Review session.

Warmup selection includes all words from the previous week's Acquisition dataset now in Test Review, every complete dataset with an error in the previous seven days, and approximately 25% additional eligible isolated words. The additional count is `ceil(25% × the assembled A+B set)`; if A+B is empty but valid historical words exist, one eligible fallback word is selected so warmup is not empty. A word is reviewed only after a right/wrong result is recorded.

## Practice flow

For every warmup, Acquisition, or Test Review term:

1. Speak the Mandarin term aloud.
2. Offer a Replay button.
3. The child writes the answer on paper.
4. Run the phase timer: 5 seconds for Warmup, 20 seconds for Acquisition, or 10 seconds for Test Review.
5. Reveal the answer only during the review portion after the full dictation set is complete.
6. The child selects I got it right or I got it wrong.
7. Record the result and move to the next interstitial or review word.

The word/context/repeated-word audio sequence uses one-second pauses. Warmup uses the same sequence at approximately 1.5 times the normal speech rate, capped to a safe browser-supported rate. If the child leaves, refreshes, or otherwise abandons the session, erase all temporary warmup and primary results and do not create scores.

## Scoring and history

The primary metric is percentage correct. Create a score only after every word in the relevant dataset has been reviewed for that session. Warmup scores are tracked independently by source dataset and are created only when every word from that source dataset was included; isolated warmup selections do not create a dataset score. Show a separate history graph for every permanent weekly dataset, ordered newest first, with each point labeled by phase and date.

Preserve detailed records containing child ID, stable dataset ID and date range, word ID, grade, lifecycle phase, unique session ID, local session date, correct/incorrect result, error history, warmup-session history, complete-source-dataset status, scoring status, answer-reveal method, and application version. Duplicate session IDs must never create duplicate scores.

## Audio

Use a consistent Mainland Mandarin China voice. The preferred Google Cloud Text-to-Speech voice is `cmn-CN-Wavenet-C`. Use `en-GB-Neural2-F` for English instructions such as the final review reminder. Generate and cache audio when a new term is imported; Replay uses the stored file.

The dictation audio should preserve the approved sequence: word at the current speech rate, a 1-second pause, the context sentence, a 1-second pause, the word, a 1-second pause, and the word again. Warmup multiplies the current rate by approximately 1.5. The review instruction should be available as both visible text and English audio. The current browser speech synthesis is only a temporary prototype fallback; production audio must use the cached Google Cloud files.

The default process is automatic. Later, administrator settings may allow a hidden pronunciation correction for rare or polyphonic characters. Pinyin may be stored internally for pronunciation correction but must not appear in the child interface.

## Administrator functions

Only the administrator manages school years, grade-to-deck mappings, active school year, Google Slides authorization, import logs, extraction errors, vocabulary corrections, and pronunciation corrections. Weekly imports require no manual action when the deck format is valid.

## Recommended technology

- Frontend: React, TypeScript, and Vite
- Hosting: GitHub Pages
- Parent authentication: Firebase Authentication with email and password
- Application data: Cloud Firestore
- Scheduled importer: Google Cloud Scheduler
- Import and audio backend: Google Cloud Run
- Slides access: Google Slides API with read-only authorization
- Audio storage: Google Cloud Storage
- Speech generation: Google Cloud Text-to-Speech

Secrets, OAuth refresh tokens, and service credentials must never be committed to the public repository or exposed in browser code.

## Development stages

### Stage 1 — Prototype

Build the practice experience with sample permanent date-range datasets, required warmup, Acquisition and Test Review lifecycle phases, randomized words, audio, Replay, phase timers, interstitials, right/wrong review controls, dataset-level scores, legacy migration, and separate graphs.

### Stage 2 — Accounts and data

Add parent authentication, multiple child profiles, Firestore persistence, archive behavior, cross-device sessions, and security rules separating family data.

### Stage 3 — Administrator configuration

Add school-year setup, grade-to-deck mappings, active/inactive status, and administrator-only settings.

### Stage 4 — Google Slides integration

Add one-time administrator authorization, a manual Sync Now operation, Monday–Friday date recognition, Tier 1 extraction, comma parsing, import summaries, and failure handling.

### Stage 5 — Audio service

Add cached Mandarin audio, Replay, and later pronunciation corrections.

### Stage 6 — Automatic operation

Deploy the importer to Cloud Run and schedule it with Cloud Scheduler every Monday at 3:00 p.m. America/Los_Angeles. Add logging, duplicate prevention, and failure notification.

### Stage 7 — Public testing

Test multiple families, multiple grades, new midyear students, school-year transitions, archived profiles, cross-device parent sessions, and future weekly email reports.

## Deferred features

The first version will not include ten-word mastered rotations, sentence-writing activities, camera-based handwriting grading, or automated weekly emails. The detailed history model should support these features later without losing past data.

## Safety rules

- Never silently accept failed vocabulary extraction.
- Never display pinyin or English meanings to children.
- Do not count abandoned sessions in official scores.
- Do not delete historical weekly sets or completed attempts.
- Do not store private credentials in GitHub.
- Keep parent settings separate from child practice screens.

## Next session handoff — Stage 2 clarification questions

Stage 1 prototype work is complete and has been manually tested successfully. The repository is currently a React/Vite prototype using localStorage persistence. Firebase authentication, Firestore persistence, and account management have not yet been implemented.

Before beginning Stage 2, resolve these questions:

1. Should Stage 2 implement a fully working Firebase integration now, or only prepare the Firebase structure until a Firebase project and configuration are provided?

2. Who should be trusted to create official scores? Firestore client rules cannot reliably verify that every dataset word was completed. Should scores be client-created with documented limitations, or created through a trusted Firebase backend/Cloud Function?

3. Since Google Slides and administrator tooling are deferred, how should shared datasets be populated: bundled sample datasets, Firestore seed data, or both?

4. Should production require authentication before practice, or should the existing local sample mode remain available as a clearly labeled development/demo mode?

5. For incomplete cloud sessions, should the app permanently delete the session and attempts, or retain an `abandoned` session record while deleting temporary attempts and excluding it from scoring?

6. Because browser cleanup is not guaranteed during a crash or forced close, should startup automatically abandon and clean up stale `in_progress` sessions?

7. Should lifecycle and session dates use `America/Los_Angeles`, matching the project plan, while Firebase timestamps remain stored in UTC?

8. Should datasets be selected by the child’s grade and current school year? If no matching dataset exists, should the app use bundled sample data, show an empty state, or use the most recent dataset?

9. Should parent email verification be required before the parent can access the app?

10. During migration, should the parent import only data for the selected child, or should the app support mapping and importing multiple existing local sample profiles?

Recommended priority: resolve questions 1–6 before implementation. Questions 7–10 may use documented defaults if no separate decision is needed.
