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

1. Reviewed retention previews and header/cache safeguards are committed as `134cc52`; the new compatibility tooling and evidence remain local and uncommitted. Their independent reviews pass. Continue using **GPT-6 Astra · Extra High**; no repeat model confirmation is needed within E2. Publication remains unapproved.
2. Exact committed-package compatibility now passes the 98-case local provider-applied matrix below. The canonical packager's clean-commit requirement remains intact. These synthetic tests do not establish hosted backend/attestation acceptance. Any hosted rehearsal or test-account operation requires its own exact scope approval; do not reuse old production test authority.
3. Read-only hosting metadata verification establishes that both raw and parsed asset headers are nested inside `script_runtime`. The local controller now has an independently reviewed exact-policy transition and public-header verifier, described below; ordinary releases retain full runtime equality. No executable production release record has been prepared. Complete an authorized commit/PR and final-head verification before binding merged-source evidence. Never bypass the guard or edit a failed-operation journal to continue.
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

## Exact package preparation and local provider matrix

The owner authorized the next local compatibility step after committing the reviewed source as `134cc52f70aae431de2f5c530617ca829a8bdfb2`. The official packager ran from that clean commit before any new test-tooling edits. Its candidate and matched guarded E1 recovery are retained under `family-beta-artifacts/releases/e2-security-134cc52/`; both copied inventories are hash-verified.

| Package | Source | Tree SHA-256 | Manifest-listed files | Public files |
| --- | --- | --- | --- | --- |
| Candidate | `134cc52f70aae431de2f5c530617ca829a8bdfb2` | `ee7c45f996805dec0b7db26418e30ef9421025bd26ee980ef371f49ddc4cfa9b` | 155 | 153 |
| Verified E1 predecessor | `b4c838d7a96967bf6ac90d6e531b1cbb45ac9061` | `9c04ec457e95785eef28870cff246ca09661fdb8b16c96e74d190b59665e79af` | 155 | 153 |
| Guarded E1 recovery matched to candidate | `b4c838d7a96967bf6ac90d6e531b1cbb45ac9061` | `5626c3d8f454534fb4c713bdf3ccf6c1859e1f4639e73306157c5a1f29f130c6` | 156 | 154 |

`scripts/serve-family-security-test.ts` validates pinned inventories and uses three local-only Wrangler 4.147.0 asset servers, all with release compatibility date `2026-10-04`. A loopback proxy selects predecessor, candidate or recovery while preserving provider-applied headers and one browser origin. It does not parse/recreate `_headers`, add permissive browser headers, rebuild packages from dirty source, upload anything or add an endpoint to the released app. Fixtures intercept external browser requests and use synthetic accounts/documents only. The final startup checks verify each served manifest, every public file hash and each package's own security headers before browser acceptance; candidate cache directives are also checked per file.

The retained predecessor/recovery keep their existing headers, including the old asset-cache overlap; this rehearsal does not silently rewrite the recovery engine or claim it has the candidate's new policy. The stricter script/resource policy remains report-only in the candidate. Physical audio/microphone/touch and real attestation are not established by these local synthetic checks.

The new matrix and its test-driver changes remain local and uncommitted. Local exact-package compatibility passes as recorded below; App Check and production header/resource transition approval remain separate gates. Pinned Wrangler sends raw `_headers` as `assets.config._headers`. The later authenticated readback below resolves the initial uncertainty about the returned representation: `script_runtime.assets` contains both `raw_headers` and parsed `headers`. The adapter retains both within `script_runtime`, so the unchanged equality guard already covers them and refuses this candidate's intentional policy change.

### Matrix scope and test repairs

`npm run test:security-packages` now defaults to 98 cases across seven files, using desktop Chromium and a Chromium tablet-touch simulation. It covers the two new provider-header/grade-transition suites and existing activity continuity, recording interruption, offline startup, offline transition and A2 regression suites. The independent reviewer caught an initial overbroad test selector that also included legacy synthetic `/alias/` routes; narrowing the default scope fixes the command without adding fake routes to the actual provider server or excluding any of the intended 98 cases.

The first broad run passed 85 of 86 cases. One desktop Grade 2 transition stalled while evaluating a retired service worker. Bounding each probe to 250 ms allows polling to inspect the replacement; the overall deadline and exact-build/record-preservation assertions remain unchanged. The repair follows the bounded probe already used by the later recovery helper. No application, service-worker or recovery code changed.

Two new-fixture setup mistakes were also corrected: Kindergarten uses “Writing characters,” not “Learn to Write,” and sign-in returns to Parent controls until the test selects Activities. The first draft run was interrupted before a case passed. The second passed three transitions, failed two sign-in/media cases on the hidden activity frame and was interrupted during the third. These are retained failures, not counted as successful checks. The corrected focused run passed **20/20** desktop/tablet cases without skips or retries, including all-grade predecessor → candidate → guarded recovery → candidate transitions, synthetic sign-in/token renewal, temporary blob playback and existing Grade 2/game-only recovery cases.

Retained local logs under `family-beta-artifacts/e2-retention-preview/` are `e2-security-provider-matrix.log`, `e2-security-final-targeted.log`, `e2-security-final-targeted-v2.log` and `e2-security-final-targeted-v3.log`. Initial failure traces remain in `initial-transition-failure/` and `initial-header-fixture-failure/`. The complete default run is recorded separately as `e2-security-final-matrix.log`.

### Final local compatibility result

The final default run passed **98/98 cases in 7.1 minutes**, with no skips or retries. Its startup receipts verify the exact three served manifests, all **153 candidate, 153 predecessor and 154 recovery public files**, each package's own security headers and candidate cache directives. The matrix covers all-grade saved reading/writing reopening, reviewed writing record preservation through four release states, reporting/timers/navigation, synthetic sign-in/renewal, blob decode/playback and interrupted recording. These are Chromium desktop/tablet simulations, not physical iPad Safari or microphone/speaker acceptance, and do not prove every historical activity shape.

Fresh implementation gates pass **1,024/1,024 unit tests**, typecheck, lint, format, release/retention/security tool checks, unchanged build/performance budgets and dependency audits. Production vulnerabilities remain zero; the existing Firebase tooling exception has 11 findings and expires November 4, 2026. The candidate, predecessor and recovery inventories remain unchanged after testing. Local test servers are stopped; no hosted accounts, family records or security settings were accessed or changed by this matrix.

Exact receipts under `family-beta-artifacts/e2-retention-preview/`:

```text
4cfa67d43634bf583c163849467ab28944c0b5527aae8f241b3c7dde88a89828  e2-security-final-matrix.log
fe1d0ba66f65a72e3bceb1dc7756ca8011079b8f4bdc664fd838740e58600071  e2-security-final-targeted-v3.log
69e68e11ad809c17e1790ec1f03be36d613ee9fea2b20abc330790d6bd032868  e2-package-inventories-final.log
87dc4370d6bf47c04675da800c91fc9a1fc8534b75167573049f3969619bf9bf  e2-package-quality-complete.log
```

The unit, build/performance and dependency logs are `e2-package-units.log`, `e2-package-build.log` and `e2-package-audit.log`. This result closes local compatibility testing for candidate `134cc52`; it is not publication approval or completion of all E2 retention/security work. The subsequent hosting readback and release procedure are recorded below. No owner smoke test is appropriate for these unpublished changes.

### Independent compatibility review

The authorized **GPT-6 Astra · Extra High** reviewer `/root/e2_security_independent_review` passed this local compatibility stage with no remaining actionable introduced defect after the default test-selection repair. It independently verified all three package inventories, candidate header generation, recovery bindings, tool/type checks, default 98-case discovery, final run receipt and original stalled-worker trace. It inspected the root's 98/98 and 20/20 browser results; it did not launch a second browser/server, rerun all 1,024 units or make live-service calls.

The review closes the earlier concern that ordinary test-server passes omitted `_headers`. It does not approve publication, prove physical Safari/audio behavior or establish every historical record type. Exact uploaded/served candidate header identity, security/publication authority, production verification, final release review and unresolved App Check acceptance remain separate requirements. The fresh hosting readback below supersedes the earlier inference that projecting bindings/runtime necessarily excludes header metadata.

Reviewed compatibility implementation hashes:

```text
18929fb3a5b20b7407fc8a98fea286150df54decb9ae0769fe89d9972372ec72  scripts/serve-family-security-test.ts
780da7c63f587162188fd443c8abf575f21f1a0ef14378a3c51ad559c95c37d8  playwright.family-security.config.ts
43b72bdec9767fb631eb0e948e75c310d08e0a19f71cc8a2ac5c5aadcb432f4f  tests/family-security/gradeTransitions.spec.ts
abc8758a00c6878dc65b4aa2e2b709c306022e42d0a380fcec714eaf81af3d04  tests/family-security/headerCompatibility.spec.ts
5f3f0e47a65c8f543740f56f6c4da64293f952311938043c17f5f7f636ba64a4  tests/family-sync/offlineTransition.spec.ts
```

## Verified hosting policy and release procedure

### Read only hosting baseline

At **23:24 UTC on October 13**, pinned Wrangler 4.147.0 read the canonical worker's deployment and the two previously recorded versions using supported authentication. The active deployment was read before and after inspection and remained `d92835c9-bbab-4115-8d24-7c0ffe60830b` at 100%. Its raw headers exactly match the retained E1 package. The older guarded D2 version `a7e55e94-71f0-4dd7-a157-dc10193d3fe0` has the same policy; it is not the new guarded E1 recovery prepared for E2.

Both responses have zero bindings and place the policy at `resources.script_runtime.assets.raw_headers` and `resources.script_runtime.assets.headers`. Parsed headers use version 2, with `rules`, lowercase `set` names and `unset` arrays. The remaining observed runtime fields include the compatibility date, usage model, asset base path and direct-serving/worker-first settings. The sanitized receipt retains these static settings, not account credentials or family data.

| Policy | Exact SHA-256 |
| --- | --- |
| Current E1 raw headers and prepared E1 recovery raw headers | `25f839f2748aa2af6808b482b2f43e9b8dd09c8add1aaaaa468884d95ce971e1` |
| Prepared E2 candidate raw headers | `fb177399eb556e8e0cf94c045d69dcc91eaebb6bbb54aa1ed95802efb1bf4b15` |
| Read-only receipt `family-beta-artifacts/e2-retention-preview/e2-hosting-policy-baseline.json` | `4a90910df26d1d477c5dd609e808980fb3e08e7fe9b09a556b5f9f65f8fac7b8` |

The controller's existing full equality comparison of projected resources **does include both header representations**. Its protection is unchanged. Four new synthetic regressions use the observed nested shape: raw-only, parsed-only and combined header changes stop before activation, and a parsed-policy change after upload is rechecked before activation. The first three retain the failed `uploading-candidate` journal with both inactive version IDs and refuse replay. The existing success test now also uses the nested header shape. All **43 release-tool cases pass**. No E2 provider upload was attempted; the failed-upload outcome is a local simulation, not a hosted incident.

Fresh root checks pass **1,028/1,028 units**, typecheck, lint, format and release/security/retention-tool checks. The build remains within **546,027/550,000 JavaScript bytes** and **42,745/60,000 CSS bytes**. Production audit reports zero vulnerabilities; the 11-finding Firebase tooling exception is unchanged. A separate read-only canonical verification matches the E1 manifest and all **153 public file hashes**. Logs are `e2-header-guard-regressions.log`, `e2-header-guard-units.log`, `e2-header-guard-build.log` and `e2-header-baseline-public-files.log` under the E2 evidence directory. Only tests and documentation changed in this slice; the existing release controller, app, packager and retained packages are unchanged. The initial test-format check required a mechanical formatting correction; the subsequent quality checks pass.

With the unchanged controller, the recovery upload would pass the equality check, but the candidate upload would be followed by a deliberate refusal. Do not invoke that known failing workflow merely to obtain inactive metadata. A generic `--ignore-headers`, filtering out all asset settings, changing the predecessor reference or editing the journal would defeat the release safeguards.

### Exact policy transition contract

**Reviewed design contract — GPT-6 Astra · Extra High, already confirmed for E2.** Ordinary releases stay on the existing equality path. The local implementation below adds a fail-closed transition only for the exact approved before/after policy, together with live header verification. Neither this design nor its implementation grants permission to change production.

1. Bind the transition to the canonical worker/account, predecessor version and full baseline resources, candidate/recovery source and package-tree identities, raw policy hashes, expected parsed policies and hash-bound review/owner security-approval receipts. Include that binding in the immutable release-record fingerprint. Verify package inventories, `_headers` bytes and the baseline before any upload. Missing, changed or mismatched evidence must stop without a provider write.
2. Require exact raw bytes and deep equality of the expected parsed policy for each uploaded version. Validate expected parsed semantics against the pinned provider parser in isolated tests, not by trusting candidate readback to define its own expected value. Refuse malformed, missing or unsupported policy metadata. Only `assets.raw_headers` and `assets.headers` may differ between the approved predecessor and candidate. All bindings and every other runtime/asset field, including unknown extra fields, must still compare equal. The guarded recovery must retain the exact E1 policy and all other settings.
3. Recheck identity, policy and unaffected settings during activation, verification, reconciliation and recovery. Keep exclusive journals, exact active-version checks and the existing no-replay behavior. A metadata mismatch must never become an automatic retry, promotion, policy downgrade or success receipt. Test approved transitions, unapproved raw/parsed changes, wrong source/tree/version, altered evidence, unrelated runtime changes, active-version races and interrupted-operation recovery.
4. Verify actual public responses in addition to provider metadata and file hashes. Cover final clean and `.html` grade routes, root/internal frames, manifest, curriculum metadata, update/recovery scripts, every immutable JavaScript/CSS path and a missing asset. Check redirect origin/query preservation, final header values and absence of contradictory cache directives. Candidate and recovery must use their respective exact policies; recovery intentionally restores the earlier cache overlap and lacks the new protections. Header failure must prevent marking activation or reconciliation verified and remain eligible for specifically approved guarded recovery.

The documented Cloudflare behavior is consistent with this distinction: `_headers` is parsed configuration, not a public asset; matching rules accumulate unless a header is removed, and Worker-generated responses do not automatically inherit the asset policy. Metadata alone therefore cannot prove final HTTP behavior. [Cloudflare asset-header documentation](https://developers.cloudflare.com/workers/static-assets/headers/).

### Publication sequence after local review

The existing **98/98 default and 20/20 focused** provider-applied browser passes remain evidence for exact application package `134cc52`. Release-tool tests do not replace them. After the controller extension passes independent **GPT-6 Astra · Extra High** review, complete authorized commit/PR checks and merged-source preparation. Rebind evidence and repeat affected exact-package gates if source, generated headers, assets or package identities change; do not relabel the current package as a later commit.

Before hosted writes, present the exact candidate, policy transition and scoped procedure for separate Kindergarten, Grade 2 and Grade 5 approval. Include any disposable test-family creation/cleanup, both inactive uploads, activation, live verification and conditional guarded recovery. Old E1 publication approvals and synthetic fixtures do not grant this E2 authority. App Check enforcement, database rules, real-family changes, retention deletion and hosting retirement remain excluded.

After those approvals, the bounded execution order is:

1. Refresh read-only active-version, policy, predecessor file and database-policy checks. Stop on drift. Run the approved exact-package backend acceptance with disposable accounts only, preserving the reviewed header behavior; clean up only their enumerated test records. Bind the successful receipt before freezing the release record and starting its journal.
2. Upload the matched guarded E1 recovery and E2 candidate as inactive versions. Read back their exact annotated identities, raw/parsed policies and unchanged settings. Confirm the predecessor still has all traffic. Stop on any uncertain outcome; inspect rather than replay.
3. Activate the exact candidate once. Confirm 100% active-version identity, manifest and all public bytes, actual headers, grade entry/report behavior and approved live backend continuity. A failed or uncertain verification is not a completed release. Use the approved guarded E1 version only if its conditions are met; independently verify its bytes, old policy and record continuity. Do not deliberately switch production traffic merely to rehearse recovery.
4. Obtain the final actual-execution review. Only then hand off the exact verified canonical grade links for a short iMac/iPad continuity check covering internal navigation, sound/recording, handwriting, report pause and save/reload. State the served build and known unfinished features; do not request a broad bug audit.

No hosted version, authentication setting, database policy, App Check setting or family record changed during this verification. E2 remains unpublished, with script/resource CSP still proposed as report-only and App Check acceptance unresolved. The local implementation and acceptance evidence follow below; publication and owner smoke testing remain separate.

### Independent baseline and procedure review

The authorized **GPT-6 Astra · Extra High** reviewer `/root/e2_security_independent_review` passes this verification/proposal slice with no actionable issue in its new regressions or release procedure. It independently verified the sanitized receipt hash, exact predecessor/recovery/candidate policy hashes, both observed runtime objects and unchanged controller/adapter hashes. Its own focused run passes **43/43 cases**. It made no edits or live-service calls and did not duplicate the root's broader unit/build checks.

The review explicitly corrects the earlier inference about omitted headers: the existing adapter retains both observed policy representations. The proposed transition preserves all other settings and requires exact policy, approval, journal and public-response checks. Its implementation and final release still require separate review; no publication authority follows from this proposal pass. The review's stale-handoff observation was corrected in both worktrees' STATUS/ROADMAP handoffs and E2 rows.

Reviewed test SHA-256: `a5745d8883caf0798f810f65e24cd450e9e4a4c2272c99d22c091f1cba87bfff`. Controller and adapter remain `3a9112a4fa983a0c0b8ad41381173cd59fd73f44a61b37459fddd4ccc4f733d5` and `3d8cd164ddc4790a1a472aefde6d5832c4585f37540127ef972316b56c9af222`, respectively. The receipt hash is recorded above; adding this review outcome changes documentation only.

## Local exact policy release safeguard

The optional `headerTransition` in the existing release record binds the canonical destination, predecessor version and complete projected runtime/bindings, candidate and recovery source/tree identities, exact raw policies, SHA-256 digests, expected parsed policies and separate security-approval/review receipts. It is included in the release-record fingerprint. Ordinary records without this field retain the original full-resource equality check; there is no ignore-headers flag.

`scripts/canonicalFamilyHeaders.ts` accepts only the exact legacy header text or the current reviewed `familySecurityHeaders()` output for the manifest's assets. It computes expected parsed rules from those restricted generators before querying provider metadata. Parsed readback normalization permits only header-name casing and omitted empty `set`/`unset` values; explicit nulls, duplicate names, unknown fields or versions, altered policy values and unrelated runtime changes fail closed. The baseline readback must exactly match the recorded resources. Candidate readback permits the two header fields to change to their expected policies; recovery retains the exact predecessor policy. Other fields, including unknown runtime/asset fields, are never filtered out.

Each transition receipt is referenced as a path plus `#sha256=` digest. Its JSON must contain `schema: 1`, the matching `kind` (`independentReview` or `securityApproval`), `scope: "canonical-header-transition"`, the exact `transitionSha256`, affirmative `approved` and a nonempty human decision reference. The security receipt additionally names all three grades. `transitionScopeHash()` hashes the transition object excluding its receipt references, avoiding circular receipt hashes while binding both policies, packages and baseline. The outer release fingerprint includes the references too. Tests use explicitly synthetic receipts; no production approval or executable release record was created.

The release adapter passes the corresponding policy to the live verifier during predecessor preflight, activation, reconciliation and recovery. Public verification follows redirects manually, rejects foreign destinations or changed entry/grade queries before contacting them, and omits credentials. It checks the manifest, every public file, all three grades' clean/HTML frame and entry routes, root and an absent asset against exact content and header expectations. Recovery is checked against its own old policy, including the known cache overlap. Active traffic is rechecked after HTTP verification before a journal is marked successful. The read-only `release:family verify` now checks active provider identity, ownership annotation, runtime/policy and HTTP behavior; it does not write or reconcile a journal.

The local provider harness additionally exercises this production verifier through a loopback-only request adapter. It preserves actual provider statuses, body bytes and headers, rebasing only the test provider's own origin/redirects. Pinned Wrangler 4.147.0 startup checks passed **180 candidate, 180 predecessor and 181 recovery final header responses** across the retained exact packages. That verifies effective parsed-policy semantics for every candidate immutable asset path as well as entry, metadata, missing-asset and recovery behavior. It does not substitute for inactive uploaded-version metadata checks later.

Final local checks pass **75/75 release cases**, **78/78 combined release/header cases** and **1,063/1,063 root units**, alongside typecheck, lint, formatting, release/retention/security tooling checks, the **546,027/550,000 JavaScript** and **42,745/60,000 CSS** build budgets, zero production vulnerabilities and the documented 11-finding Firebase-tooling exception through November 4, 2026. The provider-applied rerun passes **98/98 desktop/tablet cases in 7.5 minutes** with no retries or skips; startup independently verified the exact **153 candidate, 153 predecessor and 154 recovery public files** and **180/180/181 final header responses**.

The owner-authorized independent **GPT-6 Astra · Extra High** reviewer `/root/e2_final_independent_review` found no actionable defect. It separately passed the 78 combined release/header cases, tool/type checks, all three package inventories, baseline receipt and raw/parsed policy identities, plus six normalization/unknown-field probes. It made no edits and did not start a provider/browser server or access live services or family records. Reviewed core SHA-256 values are `fa4b863579fd05959910308dfa5b5dd4ae0c301837b9fa461501ef5453d0a0bf` (`canonicalFamilyHeaders.ts`), `908490a51dc8b23e6bcdb4fee65e4f1010c62a3ed6e39582ee4a1674897d6b10` (`canonicalFamilyRelease.ts`), `5d427a37298acd8f21fa9dd4845a9f53a81202053e9de478d36b2a22e53e7e28` (`release-family.ts`) and `6731db908f45bb8c6c771a282b370be039292052b3486516f4b57f5b034fd746` (`serve-family-security-test.ts`).

Application code, generated policy source and retained packages remain unchanged; this slice changes local release/test tooling only. No hosted write, family access, security approval, push, merge or publication occurred. App Check remains unresolved, and this review does not authorize publication. The next gate is an owner-authorized reviewable commit/PR and final-head verification, followed by merged-source release-record preparation and separate security/per-grade publication approvals. Owner smoke testing remains premature.
