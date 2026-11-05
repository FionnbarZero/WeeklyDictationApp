# Development tooling security

Status, November 5, 2026: production and development dependencies have zero known audit findings after narrowly scoped Firebase CLI dependency patches. The expired exception has been removed; the tooling audit now requires a complete, successful audit with zero findings.

October 6 reconciliation: pin the existing transitive `source-map-js` build dependency to patched version `1.2.2` in the lockfile for [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). This removes the new source-map finding without expanding the Firebase tooling exception or changing application behavior.

## Current disposition

- `firebase-tools` remains pinned to `15.32.1`. The newer `15.35.0` release was checked on November 5; it still selects the affected dependency ranges, so an unrelated CLI upgrade would not remove the findings.
- `npm run audit:production` fails CI for high-severity production findings and currently reports zero.
- `npm run audit:tooling` rejects any finding, incomplete or malformed reports, and failed audit commands. There is no expiry extension, advisory allowlist or count exception.
- The affected FTP, proxy/PAC, file-watcher, telemetry-baggage, and UUID paths are not imported by the browser or Cloud Run runtime. The CLI is used only by trusted maintainers for Firebase deploy and local Emulator operations.

The old exception expired on November 4 and correctly failed locally and in PR 77 CI. The November 5 audit reported nine findings arising from three underlying advisories. Scoped overrides under `firebase-tools` use the minimum patched CommonJS-compatible versions:

- Pub/Sub's `@opentelemetry/core`: `2.8.0`, for [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf).
- `get-uri@6.0.5`'s `basic-ftp`: `6.2.1`, for [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r).
- `gaxios@6.7.1`'s `uuid`: `11.1.1`, for [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

Production package versions are unchanged. The separate `uuid@14.0.2` used by analytics is unchanged. The prior scoped `glob@14.0.2` and `re2js@2.8.7` patches remain. Independent Node 24 compatibility probes passed 11 checks covering the actual Pub/Sub trace propagation, gaxios multipart/UUID calls, get-uri FTP paths against a loopback fixture, and Firebase CLI command loading. All 95 production lock entries are unchanged. Release checks must still pass before publication; a zero audit alone does not establish runtime compatibility. `npm audit fix --force` proposes an unrelated major CLI downgrade and remains unsuitable as an automated fix.
