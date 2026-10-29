# Standalone Stroke Order Slay and Whispering Scrolls removal

Owner request, October 21: remove the two games from every version. This working prototype interprets that as **standalone launch entries across all three grades**, preserving the already-approved stroke teacher embedded in Writing. That scope was stated before implementation. No source file or saved record was destructively deleted.

## Ready for review

- [Kindergarten](https://weekly-dictation-staging--streamlined-dojo-oct21-v1-6aboxvup.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--streamlined-dojo-oct21-v1-6aboxvup.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5](https://weekly-dictation-staging--streamlined-dojo-oct21-v1-6aboxvup.web.app/family-beta-preview.html?grade=grade5)

**Streamlined Dojo / Prototype 1**, application **5f64beb65b69e1ee2a970bbb28303a847364bca1**, package tree **45018421ef136c222f42a2d8e09cc118998a1b7b3125293e2d240770c7d148e9**. New Firebase channel **streamlined-dojo-oct21-v1**, version **9a99c736305f4c28**. Expires **October 28, 2026, 11:47 a.m. Pacific** (2026-10-28T18:47:43.853249352Z).

The shared LearningHub renderer removes identifiers dojo-stroke-order, dojo-stroke-order-slay and dojo-whispering-scrolls wherever offered, including native fallback menus and the enriched family hub. Filtering is scoped by exact standalone identifiers, not by text that could match the integrated teacher. The parent saved-lesson listing omits experiences stroke-order-slay and whispering-scrolls without deleting their underlying records. Resume and extra-launch boundaries also reject a stale request for those standalone experiences. Ordinary reading/writing records, historical completed scores, exports and the legacy checkpoint readers remain.

The policy is explicitly enabled in this isolated build through --retire-standalone-games and VITE_RETIRE_STANDALONE_GAMES. Other builds retain their prior behavior pending owner approval and the existing integration/release gates. **Canonical ninjadojo.meghangames.com and older frozen preview URLs have not been changed.** No hosting retirement, expired-site cleanup or data migration is implied by the user's game-removal request. The separate Grade 5 shared-word page had neither standalone launch entry and retains its existing Writing teacher.

## Verification

Primary-agent source review covered shared renderer filtering, precise identifiers, closed retired resume requests, unchanged record writers, and preservation of embedded teaching. No new independent-agent review is claimed.

- Type, changed-file lint/format, production build and unchanged performance budgets pass (549,995 / 550,000 initial JavaScript bytes).
- **41 focused existing tests** pass for learning hubs, standalone checkpoint readers, preserved ordinary/standalone separation, result fences and saved-route validation. These run in the unchanged default policy; they verify retained recovery compatibility, not deployment of the removal.
- **Six local plus six hosted browser cases** pass: each grade in Chromium desktop and portrait WebKit. The driver seeds valid standalone stroke/reading bookmarks and an ordinary reading bookmark, first confirms all three exist through the actual saved-lesson reader, then verifies that the UI exposes only the ordinary reading bookmark. All seeded record values remain byte-identical after the interaction. Every available Dojo/Ninja Skills/Final Boss/Spirit Realm menu is checked for the retired headings/buttons.
- Every grade also opens ordinary Writing, traces the real first character, saves teacher step 2, opens/types/closes Report, exits/reopens and reloads at step 2, then opens ordinary Reading. There are no uncaught page errors. Screenshots confirm the simplified Dojo and compact parent row. Narration/microphone behavior is simulated; physical audio/Pencil quality is not proven.
- Exact hosted comparison passes **186 public files / 1,116 configured header responses**. The **15 channels present before publication** preserve release and expiry; canonical's retained manifest is identical. Only the new channel was published, once, with authorized-domain synchronization disabled.

A temporary verification-script copy initially referenced a removed old /tmp directory; it was recovered from the retained previous evidence before verification. A later JSON-summary read used a Node runtime path that had been cleaned up; the report was read using the available runtime. Neither incident changed application source or required rerunning successful application checks. Final evidence retains the actual passing test outputs.

## Handoff and next gate

A **3–5 minute physical-iPad check** is ready: verify the duplicate standalone cards are absent in each grade; Writing still enters stroke-order teaching; ordinary Reading opens; Report returns to the same activity. Use the same test link/browser and do not clear records. This preview uses synthetic browser-only progress without family accounts, cloud/cross-device sync or an offline app shell.

Project instructions require approval of a working isolated prototype before integrating a new appearance/behavior change into the regular app. That approval and regular-app release remain pending. Do not describe this preview publication as completion of removal from all historical or live websites.

The first email attempt was rejected by Gmail with HTTP 403 RATE_LIMIT_EXCEEDED (per-minute service quota). After useful documentation work, a successful sent-mail query found no matching sent message. One subsequent send succeeded; metadata readback confirms **SENT**, message/thread **1a15fcd859b00040**, to the standing confirmed owner address. The email includes all grade links, exact build, expiry, 3–5 minute checklist, preview/regular-app boundary and limitations. No duplicate send or successful-delivery claim was made during the quota failure.

Frozen package, verification scripts, six-local/six-hosted outputs, screenshots, 41-test output, build/performance output and provider before/after: family-beta-artifacts/prototypes/streamlined-dojo-5f64beb/ in the managed Grade 5 worktree.
