# Grade 2 stroke teacher v4 — isolated hosted preview

Owner requested a website for testing the approved localhost prototype on another computer on October 14, 2026. This is **not** a canonical Ninja Dojo release or all-grade integration.

- URL: https://weekly-dictation-staging--stroke-teacher-v4-d8tetxd3.web.app/
- Application source: `a4009e70a84feee724c8807fa6f2fee035b19c0f` on `codex/grand-scroll-integration`.
- Firebase project/site: `weekly-dictation-staging`; preview channel: `stroke-teacher-v4`.
- Hosting version: `80c63f7b7d2d5602`; release: `1792015616270000`.
- Expires: November 13, 2026, at 22:06:53 UTC (2:06 p.m. Pacific).
- Public, fixed sample 英雄, session-only. No parent account, child records, cloud saving, retained handwriting, recording or curriculum service.
- Original Stroke Order Slay interface, six steps for 英 then 雄, followed by existing Grand Scroll acquisition. Whole-word audio per trial; vocabulary card hidden after seven seconds. Existing acquisition timers/correction remain unchanged.

## Scope and release evidence

The dedicated Vite mode builds only the prototype and required license notices. It excludes the normal app entries and unrelated public files. Prototype access stays disabled in ordinary production builds. The dedicated Hosting configuration publishes only those five public files; no Firestore rules, Auth domains, DNS or canonical hosting were changed. `--no-authorized-domains` was used.

The pre-existing staging live release remains `1791983894530000`, version `821ef068daa808cb`, confirmed after preview deployment. The canonical Cloudflare app was not deployed or modified. Current production integration status and its execution queue remain in the primary checkout's STATUS/ROADMAP; this older reference branch is not a replacement for current main.

Checks: TypeScript/build, scoped lint, all 1,083 unit tests and both built-artifact browser cases pass. Both cases also pass against the actual hosted URL (1.1 minutes): both-character six-step completion, scroll handoff and timers, immediate error feedback, seven-second card concealment, per-trial audio requests and no local/session storage. HTTPS root and all five public files return 200 and match the retained artifact byte-for-byte, with the expected source revision and headers. Real browser rendering and manually initiated audio show no browser errors. Physical-device sound quality, touch/trackpad feel and iPad optimization require owner feedback; automated audio is simulated, not proof of audible output.

## Owner check

Use Chrome on the other computer; allow about 6–10 minutes. Check whole-word audio (click Listen/Retry audio once if the browser blocks automatic sound), precise strokes and immediate direction/order feedback, the seven-second card, all six steps for both characters, then the unchanged scroll interface and timers. Refresh intentionally restarts this session-only sample. Full-app resume/saving, other words/grades and the deferred correction-protocol revision are not implemented here. Do not clear browser data or change teacher materials to test it.

Record feedback against **Grade 2 hosted v4 / a4009e7**. This standalone preview has no problem-report collector; report findings in this chat. The canonical app's existing problem-report mechanism remains unchanged.

Rebuild with `npm run build:stroke-teacher-preview`. Run the two production-artifact cases with `npm run test:stroke-teacher-preview`; set `STROKE_TEACHER_TEST_URL` to the exact hosted origin to run them against the preview. Redeployment is a separate authorized action, not an automatic follow-up.
