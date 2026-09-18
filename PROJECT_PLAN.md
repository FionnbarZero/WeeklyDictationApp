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

- A child joining during the year starts with the current week and the previous week.
- Older sets remain archived for future mastery features.
- Current and previous sets are practiced together in one randomized session.
- There is no combined session score.
- Every result remains associated with its original weekly set.

## Practice flow

For every term:

1. Speak the Mandarin term aloud.
2. Offer a Replay button.
3. The child writes the answer on paper.
4. Run a 20-second timer.
5. Reveal the answer only after Show Answer or timer expiration.
6. The child selects I got it right or I got it wrong.
7. Record the result and move to the next randomized term.

Every current-week and previous-week term should be practiced each day. If the child leaves before finishing, discard the entire session. Its attempts do not affect official scores, and the child must restart.

## Scoring and history

The first primary metric is percentage correct. Report separately by weekly set: current-week percentage, previous-week percentage, daily percentage, weekly percentage, and progress graphs for each child and each weekly set.

Preserve detailed completed-attempt records containing child ID, weekly set ID, term ID, session ID, date and time, correct/incorrect result, answer-reveal method, session status, and application version. The data must support future word-level accuracy, daily versus weekly averages, rolling averages, and new graph types.

## Audio

Use a consistent Mainland Mandarin China voice, such as a Google Cloud Text-to-Speech cmn-CN voice. Generate and cache audio when a new term is imported; Replay uses the stored file.

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

Build the practice experience with sample vocabulary, sample child profiles, current and previous sets, randomization, audio, Replay, timer, Show Answer, right/wrong controls, separate set scores, and basic graphs.

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

The first version will not include mastery or warm-up sessions, ten-word mastered rotations, sentence-writing activities, camera-based handwriting grading, or automated weekly emails. The detailed history model should support these features later without losing past data.

## Safety rules

- Never silently accept failed vocabulary extraction.
- Never display pinyin or English meanings to children.
- Do not count abandoned sessions in official scores.
- Do not delete historical weekly sets or completed attempts.
- Do not store private credentials in GitHub.
- Keep parent settings separate from child practice screens.
