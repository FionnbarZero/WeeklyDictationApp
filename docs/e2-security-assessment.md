# E2 security assessment and proposed changes

## Decision and scope

October 13, 2026: the source and public-response assessment identifies two confirmed canonical-hosting gaps: missing browser security headers and conflicting asset cache directives. Repair these locally and prove compatibility before publication. Do not copy the older Firebase hosting policy unchanged, turn on App Check enforcement, replace database rules or delete retained detail as part of this repair.

This work uses **GPT-6 Astra · Extra High**, already confirmed for E2. The owner approved local header/cache implementation, isolated tests and read-only Firebase security metadata inspection. The local baseline is implemented, tested and independently reviewed; exact-candidate compatibility and release approval remain required. Active database rules now match the intended source; App Check enforcement and traffic remain unresolved. No real family records were accessed, credentials were not printed or saved in evidence, and no live hosting, authentication or security settings changed.

## Public baseline

At **3:35 p.m. Pacific**, the canonical manifest identified source `b4c838d7a96967bf6ac90d6e531b1cbb45ac9061`, package tree `9c04ec457e95785eef28870cff246ca09661fdb8b16c96e74d190b59665e79af`. Eight public GETs checked the root, three grade-entry links, Kindergarten and Grade 5 frame entries, the manifest and one manifest-listed JavaScript asset. All final responses were 200; all seven resources with manifest entries matched their listed hashes. This is a sampled security-header check, not a repeat of the 153-file release verification.

The `.html` pages return same-origin 307 redirects to clean URLs, preserving grade queries. An initial no-redirect probe stopped at that redirect; the completed probe allowed at most three same-origin redirects and recorded each one. It sent no cookies or authorization.

Receipt: `family-beta-artifacts/e2-retention-preview/e2-security-public-headers.json`, SHA-256 `f55ff4289d011c008d40c0685c05b0052ea7519b212a4921e5e718e9422378ff`.

## Confirmed gaps and compatibility constraints

### Canonical browser protections

All sampled final responses lacked `Content-Security-Policy`, its report-only counterpart, `X-Frame-Options` and `Cross-Origin-Opener-Policy`. They did include `nosniff`, the configured referrer policy and microphone permissions policy. No HSTS header appeared on these responses; that alone does not establish whether an inherited or preloaded policy applies.

[Canonical packaging](../scripts/package-family-sync.ts) generates its own `_headers`. It does not use the CSP, frame denial or opener policy in [firebase.json](../firebase.json). This is a defense-in-depth gap, not evidence of an injection exploit or exposed family records.

Blindly copying that older policy would conflict with the app:

- [The family shell](../src/familyBeta/main.tsx) loads same-origin grade/game iframes. Blanket `frame-ancestors 'none'` or `X-Frame-Options: DENY` would prohibit those embeds; its old `frame-src` also omits the same-origin frames. Frame permission and allowed frame sources are different controls. [MDN frame-ancestors reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).
- The packager injects inline redirect scripts. Guarded recovery packages have their own inline bootstrap requirements. A strict script policy must externalize or hash the exact necessary code, not break routing or permit all inline execution by default.
- Recording comparison uses temporary blob media; offline reopening uses a service worker. The policy must preserve those features, parent email/password sign-in and token renewal, required Firebase endpoints, curriculum/audio sources and any verified App Check dependencies.
- Parent-only transport factories and `message` source/origin checks organize trusted application code, but the same-origin unsandboxed frames are not a security boundary against a compromised script. [Authentication storage](../src/firebaseClient.ts) contains parent tokens in localStorage. An origin-wide script compromise could reach them. This is a threat-model constraint, not a proposal to remove offline identity or redesign sign-in in this slice.

Propose a generated, tested policy with same-origin embedding allowed for internal frames and external framing denied. Determine top-level versus frame route handling explicitly. Start with an isolated diagnostic policy and enforce only after the browser matrix passes; do not create a production reporting endpoint or send report bodies containing child identifiers. HSTS needs a separate domain-scope decision; do not enable `includeSubDomains` or preload incidentally.

### Asset cache conflict

The sampled hashed asset returned `Cache-Control: no-store, public, max-age=31536000, immutable`; entries and the manifest returned `no-store`. The catch-all and asset rules both apply. Cloudflare documents that matching header rules accumulate and duplicate values are comma-joined. [Cloudflare static-asset headers](https://developers.cloudflare.com/workers/static-assets/headers/).

The result does not establish a year-long browser cache. `no-store` conflicts with that intent; restrictive directives should control HTTP caching. The separately managed service-worker Cache API is not measured by this header probe. [MDN Cache-Control reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

Propose one effective cache policy per resource class: immutable caching only for content-hashed public assets; no-store for entry HTML, release/curriculum metadata, service-worker/update scripts and unknown responses. Do not broaden caching to authenticated APIs, recordings or problem reports. Test both `.html` and clean routes plus guarded recovery and offline updates against the actual provider header parser.

### App Check is a separate gate

[Runtime initialization](../src/firebaseSdkRuntime.ts) returns no App Check headers when the key is absent outside staging. [Configuration](../src/config.ts) requires a key in staging, not universally. Family result, practice and game transports, plus sign-in and token refresh, call the shared header provider. A key's presence would still not establish server enforcement or successful attestation.

Before any change, inspect only the intended project's app registration, service enforcement settings and aggregate request metrics through separately scoped read-only access. Do not list users or read Firestore documents. Verify canonical-domain registration, current and retained-client behavior, and each backend service separately. Missing attestation after enforcement can reject legitimate older clients; Firebase recommends assessing request metrics first. [Firebase App Check metrics](https://firebase.google.com/docs/app-check/monitor-metrics).

Any later enforcement proposal needs explicit owner approval, synthetic current/older-client checks, offline continuation and pending-sync recovery checks, a recovery procedure and exact service settings. Do not add a production debug token, reset sign-in or silently turn a transient token failure into a confirmed saved result.

### Database policy identity and older clients

The production-intended source is [deployment/firestore-family-sync.rules](../deployment/firestore-family-sync.rules), not the root file selected by `firebase.json`. They have different hashes and intentionally different coverage. A generic rules deployment could substitute a different policy; neither local file proves the active production release.

The family source checks family ownership and active-child scope, denies deletion of totals, practice, game checkpoints, retirement markers and completions, and keeps completed totals and completions immutable. Some practice/game content remains bounded serialized payload validated by the client, rather than full teaching semantics interpreted by database rules. Authorized-client semantic integrity is therefore not the same guarantee as cross-family isolation.

The test suite explicitly treats additional legacy lesson hardening as a separate policy proposal. Compare active release/ruleset metadata and source hash with the intended file before proposing any rule change. Metadata-only inspection needs no family-document reads. Never deploy the root rules as a shortcut, bypass restrictions with admin writes or introduce TTL deletion from the retention preview.

## Initial assessment verification

Fresh local checks passed **30/30** focused auth-renewal, game transport, rule-source and offline-shell/recovery tests, and **11/11** family-policy emulator cases using `deployment/firestore-family-sync.rules` in synthetic project `weekly-dictation-test`. Expected permission-denied assertions are part of the emulator tests. The emulator shut down successfully. These checks do not test production enforcement, App Check attestation or all legacy lesson hardening.

Logs remain in `family-beta-artifacts/e2-retention-preview/e2-security-focused.log` and `e2-security-emulator.log`. Earlier E2 retention evidence remains **1,019 unit tests** plus its independent reviews; the full suite was not rerun for this documentation-only assessment. No application, release-tool or rules source changed.

Key inspected source hashes:

```text
351d1bbc347c0bf80389997a44b07c6371600fb87f93e0814e12fedb323882a9  scripts/package-family-sync.ts
3a9112a4fa983a0c0b8ad41381173cd59fd73f44a61b37459fddd4ccc4f733d5  scripts/canonicalFamilyRelease.ts
40af2a3aa02672b253af0ab61b75ec34581ca536bdd237f004ec09d7f68adb27  src/firebaseClient.ts
2b4d9d18e1cee6fac14cbc9f3fbc494b00bbe027937ee66cfe8b90a4393db45c  src/firebaseSdkRuntime.ts
ff108665b7c2b0fed1c8f476fcac0b5c4ed4b334cc3f71d630cae770491dd3c0  deployment/firestore-family-sync.rules
4d0c3b1665778286759f89dcf5c070c9756e448ea2ec7ef0f0b8f53b6a1458ab  firestore.rules
```

## Local implementation and verification

The canonical packager now uses `scripts/familySecurityHeaders.ts`. It enforces same-origin frame ancestors, same-origin form destinations and base URLs, and prohibits object/plugin embeds. `SAMEORIGIN` preserves the internal grade frames. The opener policy permits sign-in popups. Existing referrer, MIME and microphone restrictions are retained.

The stricter script/resource policy is **report-only**, with no reporting endpoint. It does not yet prevent script injection. Exact inline redirects, guarded recovery scripts, Firebase/App Check dependencies and all-grade activity compatibility still need the release matrix before stronger enforcement. HSTS/preload, account storage and database policy are unchanged.

Only explicitly listed content-hashed JavaScript/CSS bundles receive immutable caching. Each exact path detaches the inherited cache header before setting its own policy. Curriculum metadata, public media and unknown paths, including missing `/assets/` files, remain `no-store` over HTTP; there is no wildcard immutable rule. The separate offline cache behavior is unchanged. Generation refuses unrecognized names and more than 99 distinct JavaScript/CSS paths, preserving Cloudflare's 100-rule limit with the shared baseline rule.

A diagnostic family-mode build, explicitly marked with an all-zero revision rather than a release identity, contains 106 assets. The original all-asset exact policy correctly refused that inventory at the 100-rule cap. Restricting immutable rules to its 95 JavaScript/CSS bundles produces 96 total rules and preserves no-store for its hashed curriculum JSON. The final helper accepts that actual inventory. The diagnostic directory is not a release package; the official packager still requires a clean committed checkout.

Fresh local gates pass **1,024 unit tests**, typecheck, lint, format, release-tool, retention-tool and security-tool checks. The production build passes unchanged budgets of **546,027/550,000 initial JavaScript bytes** and **42,745/60,000 CSS bytes**. Production dependency audit reports zero vulnerabilities; the existing 11-finding Firebase tooling exception remains bounded through November 4, 2026.

`npm run test:security-local` passes one isolated provider/browser scenario using the reviewed local Wrangler **4.147.0**, the release path's **2026-10-04** compatibility date and Chromium. It verifies clean and HTML routes, no-store metadata/update scripts and unknown routes, a single immutable asset directive, allowed internal frames, blocked foreign-origin embedding, and offline reopening with the existing generated service worker. Offline cached responses retain CSP, frame and cache headers. The fixture is synthetic, contains no accounts and blocks external browser requests. This is not a complete application or release-artifact acceptance run. The opt-in command requires `NINJA_WRANGLER_BIN` to point to a reviewed installed CLI; it never installs one or selects remote execution. Its formatting gate and five unit cases are part of ordinary CI; the provider/browser gate remains explicitly invoked.

The first local provider launch failed because the draft test selected October 13, newer than the installed runtime supports. Correcting the test to the real release path's October 4 date resolved startup without changing the runtime or deployment configuration. Subsequent runs passed; the initial failure is not counted as a pass. Local logs are `family-beta-artifacts/e2-retention-preview/e2-security-units.log` and `e2-security-local-browser.log`.

## Read only Firebase metadata

At **22:39–22:40 UTC on October 13**, authenticated GET requests inspected project/app registration, active ruleset source, Identity Toolkit configuration and App Check service/configuration metadata. They did not list users, read family documents or change settings.

- Project `weeklydictationapp` is number `805227811488`; the registered web app is `1:805227811488:web:43c7e407165372a39d6fc5`.
- The active Firestore release references ruleset `07e55d6a-e6be-4672-8a50-af50975976e0`. Its source hash is `ff108665b7c2b0fed1c8f476fcac0b5c4ed4b334cc3f71d630cae770491dd3c0`, an exact match to `deployment/firestore-family-sync.rules`, not the root policy.
- The canonical domain is authorized for sign-in and email/password sign-in is enabled. No account operations were performed.
- The App Check service list returned no explicitly configured services. Direct Firestore and Identity Toolkit service reads returned `name`, `updateTime` and `etag`, but omitted `enforcementMode`. This evidence does not establish an explicit enforcement state. The list endpoint only returns explicitly configured services: [Firebase service-list contract](https://firebase.google.com/docs/reference/appcheck/rest/v1/projects.services/list).
- The reCAPTCHA Enterprise configuration returned a 3,600-second token lifetime and risk-analysis metadata, but no site key. That omission does not prove all App Check registration is absent. Attestation, aggregate traffic, key/domain settings and current/retained-client acceptance remain unverified.

## Remaining execution and approval boundary

1. Local-only implementation, metadata inspection and the independent local-slice review are complete. The owner approved committing the reviewed E2 work. Continue using **GPT-6 Astra · Extra High**; no repeat model confirmation is needed within E2. Publication remains unapproved.
2. Complete exact-package compatibility checks after an authorized reviewed commit; the canonical packager's clean-commit requirement remains intact. Cover all grades, sign-in/token renewal with synthetic identities, temporary audio, report pause, saving/reopening, offline update and guarded recovery. The local synthetic frame/offline test does not substitute for this matrix. Any hosted rehearsal or test-account operation requires its own exact scope approval; do not reuse old production test authority.
3. The local-slice independent review below passed; the exact release still needs its own compatibility evidence and final review. The canonical release controller rejects changed provider resources/runtime; retain that protection and establish exactly how header metadata changes are represented. If a reviewed transition mechanism is needed, bind it to exact before/after policy hashes and keep unapproved bindings/runtime changes refused. Do not bypass or relax the comparison merely to upload a candidate.
4. Request candidate-specific publication and security approval only after compatibility, review, recovery and provider-operation gates pass. App Check or database-policy changes are separate proposals after metadata verification; retention deletion remains out of scope.

No new owner smoke test is appropriate now. Request a short security-change continuity check only after a reviewed changed build is published and verified. E2 remains incomplete: these proposals do not finish mixed-history retention, older-client deletion compatibility, production security acceptance or cleanup.

## Independent local security review

October 13, 2026: the owner-authorized separate **GPT-6 Astra · Extra High** reviewer `/root/e2_security_independent_review` found no actionable introduced correctness, security or compatibility defect in this local slice. The reviewer made no source edits or live-service calls. This is not release approval.

Fresh independent checks passed **55/55 focused security-header, offline-shell, guarded-recovery and canonical-release tests**, **1/1 local Wrangler/Chromium scenario**, security tooling checks and the Node TypeScript configuration. The diagnostic family inventory has 106 assets, 95 JavaScript/CSS paths, 96 rules and a longest header line of 702 characters. The reviewer did not rerun the broader 1,024-unit suite or full build.

The ordinary matrix server at `scripts/serve-family-sync-test.ts:67` sets only Content-Type and no-store; it does **not** apply `_headers`. Candidate and guarded recovery compatibility must therefore run with actual provider-applied headers. Cover all-grade routing, synthetic sign-in/renewal, temporary audio, reporting, saving/reopening and predecessor → candidate → recovery → candidate offline transitions. Ordinary matrix passes cannot establish CSP, opener-policy or cache compatibility. Preserve the provider-resource equality guard at `scripts/canonicalFamilyRelease.ts:204`; verify header representation before any separately reviewed transition.

Exact reviewed SHA-256 identities, rechecked before the documentation-only commit handoff:

```text
bbd65e704706c2308b0bbf52c7d94a322a28486fb238425986823560d761fcc9  scripts/familySecurityHeaders.ts
13adb62d8971f6600efc98b52d46b7fa9c8b4fc6c16d2b29ca70f11d606971b6  scripts/package-family-sync.ts
621e4881ef7df350d92e970461002be84212c37947f7ade5e908058e3426ed84  tests/familySecurityHeaders.test.ts
9438e9c77c798848196905a9357eba83b9d8b8bcb96ffe0e4cfe98254ec7e30d  tests/familySecurityHeaders.browser.ts
941268f7f86821db09c70d970e2d648450e54e56a6a168b63d8a9791c841c3fb  tsconfig.node.json
1833b0ab420dc5c273bceff2061be4b563dff7a0f375171ff79f61c266f2d4b3  package.json
e7c109cc55d645ea2a4c12744ed1ced3f48aa3497e0fd79f7bfc0590523c8922  .github/workflows/quality.yml
```
