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
