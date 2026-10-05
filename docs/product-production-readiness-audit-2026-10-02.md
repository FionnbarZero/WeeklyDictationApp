# Weekly Dictation product and production readiness audit

Status: planning overview recorded on 2026-10-02. `STATUS.md` remains the authority for verified capabilities and gates, and `ROADMAP.md` remains the execution authority.

Remediation update — 2026-10-04: the implementation pass completed the browser-local journaled restore with a separately downloaded safety backup; explicit save-failure UI; Firestore null codecs, read budgets, request timeouts, stricter write rules, and adversarial Emulator coverage; resumable importer run ledgers; account-signup gating; security headers; timer and progress accessibility; and compiled-artifact public-preview testing. The private real-family export then passed checksum, scope, referential-integrity, interruption-rollback, exact-apply, and idempotent-replay rehearsal; that run exposed and fixed a Familiar-DT restore-validator defect. Kindergarten and Grade 5 now have verified independent stable sites and non-expiring grade-specific rollback sites. Initial JavaScript is 525,533 of 551,000 bytes after lazy home/profile splitting and isolated Stroke Order loading. A scoped `@grpc/grpc-js` 1.13.6 override passes the CI-enforced production audit with zero findings. The 11 `firebase-tools`-only development findings are bounded by an expiring CI exception against the current 15.32.1 release rather than npm's unsafe downgrade proposal. Cloud Run IAM/managed-secret/Scheduler automation is implemented and tested but live deployment still requires the Google Cloud CLI, an approved region and billing state, and three administrator OAuth secret versions. App Check enforcement, telemetry, adult acceptance, and broader device/browser verification remain operational release gates.

This audit gives the whole-product view across integration, child experience, persistence, backend services, security, testing, deployment, and operations. The main conclusion is that the repository is not one uniformly mature application: Grade 2 browser-local writing is a controlled-beta candidate, Grade 2 cloud behavior is staging-quality, Kindergarten and Grade 5 are polished session-only prototypes, and the trusted importer is not yet production-safe.

## Repository snapshot

- The current branch is effectively two commits ahead and one commit behind the GitHub `main` inspected during this audit, rather than nine commits ahead. Refresh remote references and reconcile the branch before opening the next pull request.
- The working tree was clean when the audit began.
- Local verification passed 513 unit tests, 40 Playwright tests, the TypeScript production build, lint, formatting, and the existing performance budget.
- Initial Grade 2 JavaScript was 548,742 of 550,000 bytes, leaving 1,258 bytes of budget headroom.
- `npm audit --omit=dev` reported four high package entries stemming from Firebase resolving `@grpc/grpc-js` 1.9.16. Runtime reachability and a safe package-resolution change still need verification; npm's suggested Firebase downgrade should not be applied without analysis.

## Product maturity by surface

| Surface | Current maturity | Main gap |
| --- | --- | --- |
| Grade 2 browser-local mode | Controlled-beta candidate | Truthful backup scope, restore, interruption safety, and release controls |
| Grade 2 cloud mode | Staging-quality | Atomic completion, stricter rules, recovery, and scale controls |
| Kindergarten | Polished prototype | Trusted source activation, authenticated family integration, and approved persistence policy |
| Grade 5 | Polished prototype | Trusted source activation, lifecycle integration, and approved persistence policy |
| Trusted importer | Development and staging | Partial-write recovery, concurrency control, deployment, and monitoring |

## Readiness work by area

| Area | Assessment | Required work | Release gate |
| --- | --- | --- | --- |
| Cloud completion | Concrete data-integrity defect | Make session completion and adaptive-state persistence atomic or idempotently reconcilable. Test split success, exact retry, and immutable-score conflicts. | Before cloud beta |
| Activity interruption | Concrete session-loss defect | Prevent child switching and sign-out from bypassing the normal leave, journal, and reconciliation flow. | Before any family beta |
| Grade promotion | High-risk interaction | Add adult confirmation, impact preview, supported-source validation, failure handling, and a recovery path. | Before production |
| Backup and restore | Export foundation only | Correct the whole-state versus child-scoped wording, compare preview scope with the active origin and child, deepen validation, and implement journaled idempotent restore with a pre-restore backup and before-and-after report. | Export truth before beta; restore before origin or data migration |
| Import writes | Not production-safe | Replace untracked 450-write chunking with a run ledger, completeness marker, staging or finalization protocol, repair or resume behavior, concurrency lock, and rollback. | Before scheduled imports |
| Import service | Development-grade | Replace the static bearer workflow with Cloud Run IAM and Scheduler identity, managed secrets, bounded retries and timeouts, request correlation, structured results, and alerts. | Before scheduled imports |
| Firestore rules | Strong versioned contracts with permissive compatibility paths | Enforce immutable session identity and transitions, computed score consistency, allowed field sets, and retirement dates for legacy mutable writes. Expand adversarial Emulator tests. | Before broad cloud release |
| Data loading | Suitable only for beta scale | Page or summarize historical collections, separate continuation-critical records from history, archive old records, and test read cost and large-family performance. | Before scale-up |
| Grade integration | Fragmented application surfaces | Bring Kindergarten and Grade 5 into the authenticated family shell, profile model, lifecycle resolver, trusted source registry, persistence ports, history, release identity, and observability. | Before multi-grade production claims |
| Product contracts | Incomplete | Approve each grade and activity contract, including Kindergarten writing-only policy, Grade 5 Warmup and two Test Review cycles, Grade 2 Tier 2 durability, and game-scoring behavior. | Before durable feature work |
| UI truthfulness | Inconsistent | Use one shared child-friendly maturity and persistence indicator. Remove oversized technical warnings, make session-only status prominent, and avoid durable-sounding progress language in visit-only experiences. | Before public previews |
| Error experience | Misleading recovery promise | Make fatal-error and save-error language match the active persistence capability instead of always asserting that saved practice is safe. | Before beta |
| Accessibility | Good foundation with incomplete proof | Add semantic progress values, focus management, accessible disabled explanations, reduced-motion and timer accommodations, 200 percent zoom testing, and broader screen-reader verification. | Before production |
| Speech and recording | Browser-dependent | Define supported devices and voices, pronunciation acceptance, fallbacks, microphone-denial behavior, interruption behavior, and whether approved recordings are required. | Before production |
| Authentication | Pilot-grade | Add invite or allowlist enrollment, verified-parent policy, token-revocation handling, abuse controls, and an XSS threat model for locally stored authentication tokens. | Before externally discoverable beta |
| Privacy | Missing operational layer | Add parent-facing privacy and microphone notices, backup-file handling guidance, retention periods, account export and deletion, support redaction, and verification that fixtures contain no identifying data. | Before production |
| Browser security | Partial | Add and verify Content Security Policy, frame protection, and appropriate cross-origin controls while preserving microphone and Firebase behavior. | Before production |
| Dependencies | Requires security triage | Resolve the vulnerable nested `@grpc/grpc-js`, verify whether it reaches a deployed runtime, and add a repeatable dependency-audit gate and exception process. | Before release |
| Grade delivery | Major structural gap | Give each grade an independent stable destination, preview channel, immutable manifest, exact-artifact promotion, and retained rollback release. Preserve the Grade 2 origin until restore is proven. | Before multi-grade beta |
| Repository controls | Insufficient | Protect `main` and the deployment branch, require reviewed pull requests and CI, restrict workflow permissions, and use controlled deployment environments. | Before routine releases |
| Environment separation | Staging only | Create explicit beta and production projects and fail-closed configuration guards. Treat a public GitHub Pages URL as public, not as access-controlled closed beta. | Before external beta |
| Observability | Staging foundation only | Add release-tagged errors, persistence-failure counters, importer run state, hydration latency and cost signals, actionable alerts, and a privacy-safe support summary. | Before cloud beta |
| Performance | At the current threshold | Create budgets for every public entry, reduce Grade 2 initial JavaScript headroom pressure, and measure runtime, memory, and hydration performance rather than bundle size alone. | Begin now |
| Testing | Strong characterization with important gaps | Add partial-commit, retry, importer failure, concurrent-tab, offline, token-expiry, quota, malicious-rule, restore, large-history, Firefox, WebKit, mobile, and real-device audio tests. | Progressive release gate |
| Operations and support | Incomplete | Assign release and rollback ownership, define a canary and observation window, establish incident and data-repair procedures, and retain an approval record for every promotion. | Before family beta |

## Highest-priority defects

1. Cloud completion starts separate session and adaptive-state commits. If one succeeds and the other fails, retry can conflict with already-created immutable scores.
2. Child switching and sign-out remain available during an activity and can clear the in-memory session without running normal leave and recovery behavior.
3. Import batches can partially commit across multiple Firestore requests without an authoritative run status or repair protocol.
4. The Grade 2 backup labels a selected child but currently exports the full application state, and preview does not compare the recorded scope with the active browser scope.
5. The fatal error boundary promises that saved practice is safe even when the active experience is session-only or persistence itself failed.

## Recommended execution order

1. **Repair integrity defects.** Fix cloud completion retry, activity interruption, error truthfulness, and their regression tests.
2. **Close the C0 release foundation.** Reconcile the branch, add release identity, freeze and verify rollback artifacts, correct backup scope, and rehearse the release manifest.
3. **Protect Grade 2 beta data.** Complete preview scope checks, restore and rollback, privacy controls, and the family acceptance matrix.
4. **Productionize cloud services.** Repair importer atomicity, deploy with IAM, tighten Firestore rules, enforce App Check after monitoring, and add operational telemetry.
5. **Integrate grades independently.** Move Kindergarten and Grade 5 from fixtures into the real family and source architecture only after their product contracts are approved.
6. **Complete production hardening.** Finish accessibility, browser and device coverage, data retention and deletion, scale controls, security headers, and support operations.

## First implementation decision

If the next release remains strictly browser-local Grade 2, the shared release-identity component and build metadata contract can be the first implementation pull request, immediately followed by the integrity fixes. If cloud persistence will be enabled, the cloud completion atomicity and retry defect takes priority over release identity.

Until C0 closes, use temporary previews for product and UI corrections and do not update the shared child-facing `gh-pages` artifact.
