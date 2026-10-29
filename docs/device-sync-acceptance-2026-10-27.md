# Device and syncing acceptance — October 27, 2026

## Scope and release boundary

The owner requested work on the remaining physical-device acceptance and cross-device syncing. This stage prepares a **separate authenticated test-account prototype** of the latest combined app, rather than treating browser-only previews as synchronized. Existing Astra · Extra High persistence confirmation applies; no model switch or separate-agent review is claimed. The deployment skill is used for the separate Firebase preview; canonical Ninja Dojo, Firebase live, the frozen standalone fifth-grade website, existing preview releases, database rules, authentication-provider settings and real-family records are outside this release.

Candidate **8ca51a13bb1782478bbbc3b2d45edd74a1dfbfb8 / Combined Dojo · Device and syncing 1**, immutable package `family-beta-artifacts/device-sync-2026-10-27/package-final`, tree **1f54e626cc22ff0f8ad3f00743e0355bc840a2b9f3ce7a3db6f1c572e4af6ab5**. Later changes to test drivers do not alter the application files in that package. No application diff from that revision is allowed in the final receipt.

All previously approved features remain enabled: Slay-style writing and whole-word teacher, approved Warmup, Kore Mandarin, scheduled automatic curriculum, report/scroll repairs, Grade 2 Wetland recovery/book and Grade 5's 50-word reading-only review. Grade 5 Writing remains Coming soon for that review; Spirit Realm keeps its existing mastered pool. No teaching sequence, assessment policy, handwriting retention policy or new teacher word set was introduced.

## Implementation

- The prototype reuses the existing parent-authenticated Firebase family repositories, confirmed result outbox, versioned checkpoint synchronization and bounded offline shell. It creates no new backend or security rule. Synthetic acceptance uses only newly-created disposable families and explicit cleanup access.
- Its compile-time gate mounts the family reader only for a `ninja-device-…@example.invalid` or automated `ninja-writing-…@example.invalid` test identity. Real parent emails are rejected before sign-in/signup requests. Cached display metadata must also agree with the token's account, project and issuer; editing only the displayed email cannot admit a real parent token. This is prototype scoping, not a replacement JWT verifier: Firebase continues to authorize every server request.
- Profile setup is disabled until the family connection exists; the submit path also refuses a local-only fallback in this mode. This closes the early-setup exposure found while exercising a newly-created account. It does not change ordinary canonical setup or migrate older browser-only learners.
- Parent controls contains sound/microphone testing, explicit Check syncing, the existing save/error notices and the physical-device checklist. The browser-only notice is replaced by accurate test-account guidance for this prototype. Child writing/reading presentations remain the approved versions.
- The two retained native Grade 5 audit findings are repaired **in this prototype only**: reading and writing final-review callbacks propagate save failure and permit exactly-once retry while retaining temporary responses until confirmation; the embedded reading review uses the available width rather than duplicate viewport padding. Existing older links still contain their original code.
- The offline shell caches only its reviewed static assets/audio and entry pages, never private API responses or teacher-service responses. First-time access needs internet and a confirmed test family. Previously confirmed work can queue while disconnected; future unseen content and external books may need internet.

The device prototype is compiled separately. Ordinary builds do not enable this gate or the Grade 5 repair flag. A working owner test/approval remains required before integrating these changes into the general app. Canonical packaging/reconciliation, including the existing exact-path provider rule limit, remains a separate release gate.

## Verification

Evidence directory: `family-beta-artifacts/device-sync-2026-10-27/`.

- **1,305 unit tests pass**, including the synthetic identity policy and existing persistence/conflict/acknowledgement/privacy coverage. Type checking, lint, required formatting and production build/budgets pass. Initial JavaScript **549,992 / 550,000 bytes**; CSS **46,342 / 60,000 bytes**. The existing eight-byte JS headroom was not relaxed.
- Final device matrix: **34 passing browser cases and four explicit skips** across laptop Chromium and landscape WebKit. This covers test-only access, token/display mismatch rejection, delayed-family setup, 50-answer interrupted upload/recovery, all-grade guided-writing transfer, offline work/reconnect, Exit/reopen, native recorded Kore, denied microphone continuation, real wheel/touch input, Report/return and exact offline shell reopening. Three WebKit touch injection cases and WebKit offline-cache inspection are unsupported by these drivers and are skips, not physical passes.
- Two additional native Grade 5 writing-review cases pass: first-result storage failure retains the drawn ink, retry commits exactly one score, and reload preserves it. The paired reading retry/layout cases pass in the main matrix. Temporary recordings/ink are retained only within the open review; no audio or handwriting is uploaded.
- Six additional native activity-audio cases pass. Writing skips optional Warmup before checking the teacher's automatic model; independent reading waits for the existing comparison path before hearing the answer. Silent independent assessment is intentional, and the test does not change that rule. Actual media completion and Kore requests are observed; physical speaker audibility is still pending.
- Real Firebase acceptance on the exact package passed parent signup, three test learner profiles, current K/Grade 2 teaching transfer to fresh browsers, offline teaching upload/reconnect, current Grade 5 reading checkpoint recovery and the full 50-answer score saved once and recovered in another browser. Anonymous result reads are denied. The verified disposable family was removed: **18 documents and the authentication account**, receipt `cloud-verified-receipt.json`.

- Extended real-service acceptance also passes **complete whole-word teaching → first acquisition answer → fresh-browser recovery** in both Kindergarten and Grade 2. The hosted real-service checker repeats all seven authentication/teaching/acquisition/reading/score checks successfully on the exact published site. Its disposable family and authentication account were removed (**17 documents**, `cloud-hosted-receipt.json`); the extended local family removed 18 documents (`cloud-final-all-receipt.json`).
- **42 distinct local and 42 distinct hosted browser cases have passing executions**, with four explicit unsupported cases skipped. Local totals combine the 34-case final device matrix, two new writing retry cases and six new activity-audio cases. Hosted full execution has **41 passes, one initial offline-preparation timeout and four skips**; the focused unchanged-site offline rerun passes after allowing its measured preparation time. No redeployment or cache purge was used to obtain that pass. The first hosted offline budget was three minutes; downloading and hash-verifying the complete audio/static cache took **3.7 minutes** on the focused run. Cache progress was observed increasing until ready; reopening the confirmed family offline and the public-only cache allowlist then passed. This does not replace physical Safari acceptance.
- Final aggregate verification confirms **all 16 disposable test authentication accounts and their family/user roots are absent**. The first failed cleanup receipt is covered by an independent absence check. No real-family records were read or modified.

This is not an all-green first-pass audit.

## Failed-run accounting and review corrections

Preserve all initial logs, rather than counting a successful rerun as a clean initial run:

1. The initial attempt to use the canonical packager stopped at its 100-rule cache-header limit. The separate Firebase prototype packager uses strict no-store preview headers and leaves the canonical limit intact. That failure caused no deployment.
2. A TypeScript ES2020 compatibility error in token parsing was corrected without changing the compiler target. Early test helpers omitted Boss Test nesting, inspected a review after successful navigation, used a brittle init-script ordering hook, or used a taller viewport than the reported scroll issue. Those drivers were corrected; the expected behavior was not weakened.
3. Early cloud-driver failures included a cleanup receipt using Fetch `Response.ok` as a function, a profile-label mismatch, expecting the top-level menu after Exit returned to the Dojo section, and using a Node-only stroke catalog without the prototype's explicit validated Wetland guides. The first account deletion was independently verified absent after its receipt error. Other attempts record confirmed scoped cleanup.
4. A tentative interpretation of an Exit failure as a blank activity was rejected after inspecting the actual screenshot, which showed the correct Dojo menu. The unnecessary experimental Exit change was removed before the final candidate. The final prototype retains the original approved Exit behavior.
5. Extended acquisition helpers must wait for committed transitions, inspect actual acquisition controls and decode the existing compressed Grade 2 workspace. They must not treat an unsupported test observer or a container without a visibility box as a product failure. All raw attempts/receipts remain in the evidence directory.

6. The media observer was strengthened to count completed **recorded Kore clips**, excluding silent gesture primers. Its first refinement sampled a reused element’s previous `currentSrc`; using the newly assigned `src` matches the actual playback attempt. The corrected 12-case media matrix passes locally and hosted on the unchanged website. Those cases are stronger repeat executions of existing cases, not 24 additional distinct passes.

Real-service browser requests are restricted to the newly-created test UID/family; cleanup cannot enumerate unrelated families. No owner password is used, stored in source or emailed. Temporary recordings are excluded from saved/synced checkpoints. Synthetic test account credentials are generated in memory and discarded after cleanup.

## Exact publication and delivery

One new Firebase Hosting preview was published, using **`--no-authorized-domains`** so the CLI did not synchronize authentication domains. No security rules or provider settings were deployed. Hosting version **049e9a31086e78e6**; release **1793133893244000**. All **1,409 public files / 8,454 header values** match the immutable package. Every previous Hosting release/configuration/expiry and all protected manifests remain unchanged (`hosted-verification.json`).

**Isolated test-account preview, not live/canonical. Expires November 10, 2026 at 12:44 PM Pacific** (20:44 UTC):

- [Kindergarten](https://weekly-dictation-staging--device-sync-oct27-v1-mx4bf4m6.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--device-sync-oct27-v1-mx4bf4m6.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5](https://weekly-dictation-staging--device-sync-oct27-v1-mx4bf4m6.web.app/family-beta-preview.html?grade=grade5)

The site is a working interaction for owner approval, not approval of whole-app integration. Previous links remain static; use this new site for the authenticated test. Recordings, unfinished ink and an unsubmitted test review remain temporary. Ordinary session-only game rounds are not promised cross-device continuation; reviewed lesson checkpoints and completed scores are the tested transfer scope. English Niamh, unseen future-source content, main reconciliation and the protected canonical packaging/release gates remain separate.

## Physical acceptance remains an observation, not a code claim

Use one separate test parent account on both devices. Create each synthetic learner once; on the other device select that existing learner rather than creating a second child. Earlier browser-only progress remains at its original origin; it is not automatically assigned to this account.

Allow **15–20 minutes** for setup and a short sample in each grade across iPad and iMac. Exit after a confirmed step/answer, open Parent controls → Check syncing, wait for confirmation, then close that tab before continuing on the second device. This is sequential continuation, not simultaneous editing. Unfinished strokes and temporary recordings must be repeated.

| Observation | iPad | iMac |
| --- | --- | --- |
| Automatic model and Hear audible repeatedly; approved Kore voice | Pending | Pending |
| Adult test recording audible; Exit releases microphone | Pending | Pending |
| Drawing stays aligned; inside-pad input does not scroll the paper; outside scroll works | Pending | Pending |
| Portrait/landscape or laptop layout; native keyboard leaves controls reachable | Pending | Pending |
| Report pauses and returns to the same position | Pending | Pending |
| Confirmed word/teaching/acquisition step continues on the other device | Pending | Pending |

Record failures using **Report a problem**, including device/browser and whether audio was automatic or tapped. Do not reset browser data or alter teacher documents. A passing browser matrix or reachable website does not close these physical observations. Owner approval of the working prototype, main reconciliation and protected canonical release remain separate.

| Grade | iPad/browser result | iMac/browser result |
| --- | --- | --- |
| Kindergarten | Pending | Pending |
| Grade 2 | Pending | Pending |
| Grade 5 (current reading review) | Pending | Pending |

Keep internet access on first use; wait for **Offline app ready** before testing a closed-tab reopen without a connection. The first full cache can take several minutes.

## Email receipt

The verified three-grade links, exact build, preview status, expiry, test-account setup and physical checklist were sent to the owner’s confirmed address. Gmail returned **SENT**, message **1a17f28b9cf62b4a** (`email-receipt.json`). No child records or credentials were included.
