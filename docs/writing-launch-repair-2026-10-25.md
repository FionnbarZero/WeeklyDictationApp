# Writing launch repair — October 25, 2026

## Scope and behavior

The owner selected **Google Mandarin `cmn-CN-Wavenet-D`** and requested the confirmed Writing opening error be repaired. This change protects an asynchronous activity launch from automatic curriculum replacement in the isolated automatic-update app. It does not generate or install new recordings. The approved voice is recorded in the audio contract; current cached recordings remain Tingting pending supported provider setup and a working voice prototype.

The visible menu now owns its launch until the full grade-specific opening operation settles. The preview adapter explicitly enables that protection; the shared Learning Hub remains grade-neutral. Each grade's callback returns the existing opening promise instead of dropping it. The menu renders its pending state together with the resulting activity or error state. Automatic updates check that state before replacing a frame. Duplicate launches and menu-navigation controls wait for the opening operation; Report remains available. A failed launch releases the controls for retry. Successful exits allow the queued update to apply normally. This does not use the persistent diagnostic `reportPhase` as a lock, which would strand ordinary menus after a failure.

A focused failure test also found that Grade 5's launch error was inside the developer details hidden by the family-frame stylesheet. In this isolated prototype, actual errors now appear in an accessible alert outside those details; routine developer status stays hidden. Teaching sequence, timer, scoring, checkpoint formats, scheduled-date policy and curriculum validation are unchanged.

Only the existing `/automatic-curriculum/` test subtree will be updated after its gates pass. The retained root combined app, separate Warmup page, frozen fifth-grade presentation and canonical family app remain protected. This is source/automated review, not an independent-agent audit or physical-iPad acceptance. No family records or teacher documents are reset.

## Verification and development findings

The predecessor audit reproduced the race in nine update cases (three grades × three browser layouts), with nine no-update controls. Those negative receipts remain in the previous audit artifact.

The first repair's laptop run passed 11/12. The failure test first requested an alert, while Grade 5 used a status role. Correcting that locator exposed a real visibility problem: the status paragraph was inside the hidden developer details. The partial expanded run retained that failure, with 22 passes, two interrupted tests and 50 not run; it was stopped to finish the fixes before rebuilding. The subsequent refined laptop run passes **12/12**, including repeat launches, actual failed-save retry, Report during opening, and safe-menu update after Exit.

The initial full unit run caught an architecture violation: the shared presentation module directly imported the family curriculum flag. The flag is now passed by the preview adapter instead; architecture checks remain unchanged and pass. The next unit run passed 1,270/1,271; its one static Grade 2 routing assertion expected a callback without `return`. That assertion now requires the returned promise for Writing and Warmup, preserving the same underlying engines. No behavioral assertion was relaxed.

An intermediate production build exceeded the unchanged JavaScript budget by 12 bytes. Passing the existing start callback directly, instead of wrapping it, fixes this without changing the budget: **549,959 / 550,000 initial JavaScript bytes and 46,342 / 60,000 CSS bytes**. Failed/interrupted runs are retained rather than reported as passes.

The immutable package, complete final browser/unit results, hosted identity, protected-site checks and email receipt will be recorded after verification. Do not treat this source report as publication evidence. Native speaker/handwriting/microphone and real-device acceptance remain pending; automated WebKit is only browser coverage. Authenticated cloud/offline/cross-device acceptance and broader roadmap work remain separate.

Visual review of the packaged failure screenshot found the newly visible Grade 5 error could still sit above the scrolled viewport. The failure path now brings that alert into view; the browser test explicitly asserts it is in the viewport. The earlier package matrix was interrupted for this final repair, and its partial receipts are retained. This does not change normal successful-activity layout.

## Verified publication and handoff

Application **6bc14211351c3bb7f15a68b6dd0207df72cdb140 / Automatic curriculum updates · Prototype 2 — Writing launch repair** is published at [Kindergarten](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/automatic-curriculum/family-beta-preview.html?grade=kindergarten) · [Grade 2](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/automatic-curriculum/family-beta-preview.html?grade=grade2) · [Grade 5](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/automatic-curriculum/family-beta-preview.html?grade=grade5). Hosting version **5bce04ca1500e7e9**, expiry **November 1, 2026 at 10:09 PM Pacific**, tree **8cd59958c64bef15146110651506c5280c850d636ffee1774a1b17a0750a0a1c**. Exact **393 files / 2,358 headers** verified. One publication occurred, using the existing preview channel and disabling automatic auth-domain changes.

Final checks: **1,271/1,271 units**, **75/75 immutable-package local and 75/75 hosted browser cases**, TypeScript/lint/scoped formatting/build and the unchanged performance gates pass. The browser suite covers all three grades in desktop Chromium and portrait/landscape WebKit. It includes 36 opening/error/retry/Report cases and the 39 existing refresh/date/resume/outage/game/media cases. The predecessor's nine failures establish the original race. The earlier package run was stopped after 39 passes, with two interrupted and 34 not run, to bring the error into the viewport; those are not counted as final acceptance. The exact final screenshots were visually reviewed in desktop and portrait.

All **197 original combined/Warmup files**, frozen Grade 5 **1a9db3e** (183 files / 1,098 headers), canonical **9d06a02** and **18 other releases/expiries** are verified unchanged. The old writing audit hold is superseded for this scoped preview repair. Physical-device, selected-voice, native/canonical integration and authenticated cloud/offline/cross-device acceptance remain unestablished.

The owner email is verified **SENT: 1a176d76f8dbbf2d**. It contains these exact all-grade links, build/preview/expiry details, a 3–5 minute iPad checklist per grade, and the current voice/saving limitations. Mandarin D is recorded as approved but is not installed; no configured provider access or app recording replacement was performed.

Retained package/evidence: `/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/family-beta-artifacts/prototypes/automatic-curriculum-6bc1421`.
