# Grand Scroll integration

The approved writing interface is preserved in a local integration based on main revision `dbc8a1a026d0f22f83c647987316921bb0da3e5c`. This combines the published OBS-001 reliability source with the local Grand Scroll, Hear, Type and single-word Pinyin changes. It is not a hosted release.

## Implemented changes

- Preserved the approved centered scroll, smooth brush, wheel protection, blue circular Hear button, large Type field and resized self-assessment buttons.
- Fixed detection of audio failure after the first cue starts. Hear permits retry without replacing the response, moving to another word or restarting the countdown.
- Applied the approved writing response windows across the shared writing presentation: targets, show-copy targets, Earned DTs and final-test targets receive 25 seconds; Familiar DT and Warmup/other writing trials receive 10 seconds. The countdown and Skip Timer remain unavailable until the complete spoken prompt sequence finishes.
- Development pages explicitly identify themselves as a local preview with unpublished changes. Production build labels are unchanged.
- Carried forward the narrow legacy Warmup rotation policy repair and its atomic-write, invalid-state and ownership tests. The historical policy hash guard now explicitly reverses only that amendment before comparing with the unchanged published baseline hash.

Teaching sequences, score rules, saved-data schemas and temporary-only handwriting are unchanged. The standalone final-test collection/review component remains separate. The acquisition strategy versions and persisted checkpoints are unchanged because this is a response-window presentation rule, not a progression migration.

## Verification

Node 24.21.0 and the pinned lockfile were used. The new late-audio-failure browser test failed before the repair and passed afterward. The full unit suite passes 1,081 tests. Type checking, lint, configured formatting checks, whitespace checks and build budgets pass: 545,791 initial JavaScript bytes and 46,288 initial CSS bytes.

Root-policy database tests pass 19 with three existing skips; family-policy tests pass 21 with one existing skip. These are emulator checks, not hosted cloud-save acceptance.

The focused layout, Pinyin, audio-completion, 10/25-second response-window, error-retry and final-review suite passes 12 tests. A further 10-case writing regression sweep initially exposed two Kindergarten fixtures that simulated audio starting but never ending; after those fixtures were corrected to complete the prompt, all affected cases pass. The earlier 31-case Grand Scroll integration run remains recorded, and the timer work adds the focused checks above.

## Preview and remaining work

The combined local preview is served at `http://127.0.0.1:5207/?testDate=2026-10-14`. This is a separate browser-data origin: no account or progress was copied from the earlier preview on port 5197. The earlier preview remains running and unchanged. Staging still serves its older UI.

The in-app browser opens Grade 2 Learn to Write through Skip Warmup with Hear and Type visible. Automated checks verify that the Familiar DT screen stays at 10 seconds throughout all prompt cues, then begins counting; final-test targets show 25 seconds. Physical laptop sound/trackpad feedback and iPad optimization remain necessary.

Pinyin is still the development-only `ren → 人` candidate tryout, not general conversion for the curriculum. The isolated tryout is at `/pinyin-person-preview.html`; normal native Chinese keyboard input remains available.

OBS-002 first-sign-in repair `2f20c6d` is still outside this integration's fetched main baseline. Its separate PR/release workflow is not changed here. The previously observed stale Warmup error banner after a successful retry remains unresolved. Exact hosted combined-build saving/reloading, independent release review and publication are still required; do not send families to this local preview as a production update.

For a bounded 3–4 minute laptop check, use the Grade 2 local preview above, Enter the Dojo → Learn to Write → Skip Warmup. Check the Hear and Type placement, draw/clear a stroke, confirm the first Familiar DT stays at 10 seconds until its complete word/sentence/word/word sequence ends, and confirm Skip Timer becomes available only afterward. Hear remains unavailable during ordinary Acquisition unless audio fails, preserving the existing replay rule. Use Report a problem for feedback. The Pinyin tryout separately accepts ren and offers three character choices. This is not a cloud-saving or iPad acceptance check.

Further persistence/integration work uses GPT-6 Astra with Extra High reasoning. No production/staging publication, authentication change, family-record access/reset/deletion or external push occurred during this integration.
