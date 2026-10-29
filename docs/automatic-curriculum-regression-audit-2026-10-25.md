# Automatic curriculum regression audit — October 25, 2026

## Finding: an automatic update can cancel an opening Writing lesson (P2)

**Hold physical-device acceptance and canonical integration.** The unchanged hosted automatic-curriculum prototype `f36fb8797314bcd37295d3fa40346e93a45ba1e7` has a reproducible launch race in Kindergarten, Grade 2 and Grade 5.

A Writing launch awaits the existing exclusive save lock before showing its teaching screen. The menu remains visible during that wait. If a new validated curriculum response arrives then, `curriculumMenuReady` treats that visible menu as idle (`src/familyBeta/automaticCurriculum.ts:64`). The parent removes its frame and installs a new one (`src/familyBeta/main.tsx:190`, `:195`). The original Writing launch cannot complete in the replacement screen. The child returns to the menu and must enter Writing again.

The shared activity button already marks `data-report-phase="activity-launch"` synchronously (`src/learningHub/LearningHub.tsx:84`), but this new curriculum guard does not check in-progress activity ownership. Simply adding an unconditional phase check needs care: errors, canceled launches and ordinary menu navigation must release that state. The repair should explicitly preserve a pending launch until it succeeds or is safely canceled, then allow a genuine idle menu to activate the new source. Keep scheduled dates, existing teaching rules and checkpoint formats unchanged.

The controlled probe delays the save-lock request, delivers a valid new source, and compares the actual frame identity before releasing the request. All **nine affected cases fail the frame-preservation assertion**: three grades × laptop Chromium / landscape WebKit / portrait WebKit. All **nine no-update controls pass**. All nine interrupted cases can recover by manually re-entering Writing, after which the teacher appears. No corruption or loss of previously reviewed child records is established by this fresh-learner probe; the confirmed impact is a canceled launch and required re-entry. These are controlled browser reproductions, not physical-iPad observations.

## Fresh regression and publication checks

- **1,271/1,271 unit checks pass.**
- **39/39 existing hosted browser cases pass** on the exact published build. Their launch calls complete before updates are introduced, so they missed this new timing case. These passes are not an all-clear.
- **18 targeted opening cases: nine controls pass / nine update cases fail**, with recovery verified in every case.
- Exact combined package: **393 public files / 2,358 headers** match. Frozen fifth-grade presentation: **183 files / 1,098 headers** match. Original combined/Warmup manifests and canonical identity are unchanged.
- All **19 hosting releases and expiries**, including the audited channel, match the pre-audit snapshot. Audited hosting version remains `254eaf8f1fac4882`; expiry remains November 1, 2026 at 3:31 PM Pacific.

The first six-case development probe was 1 pass / 5 fail. Two control failures were driver mistakes: Grade 2 and Grade 5 show Warmup after the delayed lock resolves, and the initial driver checked for it too early. The corrected driver handles that existing transition without changing the application. The original failures, all revised failures and controls, JSON frame-identity receipts, recovery receipts, screenshots and traces are preserved.

This audit changes tests/documentation only. No application code, publication, teacher documents, family records or voice installation changed. No new independent-agent review or physical-device acceptance is claimed. Evidence is retained in `family-beta-artifacts/prototypes/automatic-curriculum-f36fb87/regression-audit-2026-10-25/`.

## Physical-device acceptance and voice follow-up

The owner requested this next stage while the audit was running, then chose **Mandarin voice samples first**. The roadmap still has no final Mandarin voice selection. The existing cached voice is Tingting; Google WaveNet A and D remain the two candidates. English Niamh work is not selected in this step.

Both official sample links were verified HTTP 200 with WAV headers:

- [Google Mandarin voice A](https://docs.cloud.google.com/static/text-to-speech/docs/audio/cmn-CN-Wavenet-A.wav)
- [Google Mandarin voice D](https://docs.cloud.google.com/static/text-to-speech/docs/audio/cmn-CN-Wavenet-D.wav)

[Google's supported-voice reference](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) identifies both candidates. These are provider samples, not newly generated app words. No voice was selected on the owner's behalf. The current task environment has neither `GOOGLE_CLOUD_TTS_API_KEY` nor `KINDERGARTEN_MANDARIN_VOICE` configured; this does not prove the owner's cloud account lacks access. Do not expose credentials or claim installation. Once a voice is chosen, use a supported secure provider connection and an isolated working audition before replacing app audio.

After the launch race is repaired and the selected voice has a verified prototype, physical acceptance needs the owner's actual iPad/iMac results: automatic and repeated Hear playback; Mandarin pronunciation and volume; completion before timer advancement; touch/Pencil strokes and both orientations; Report/return; completing one teaching step, Exit/reopen and browser reopening; microphone comparison where applicable with recordings remaining temporary. Automated WebKit checks cannot establish speaker, hardware, Pencil or microphone acceptance. No physical acceptance result is recorded yet.
