# Development tooling security

Status: production dependencies have zero known audit findings. The remaining npm findings are isolated to the locally executed `firebase-tools` development CLI.

## Current disposition

- `firebase-tools` is pinned to `15.32.1`, the current npm release checked on 2026-10-04.
- `npm run audit:production` fails CI for high-severity production findings and currently reports zero.
- `npm run audit:tooling` permits only the known `firebase-tools` dependency chain, rejects critical findings, rejects new advisory IDs or directly vulnerable tools, caps the accepted counts at four moderate and seven high, and expires on 2026-11-04.
- The affected FTP, proxy/PAC, file-watcher, telemetry-baggage, and UUID paths are not imported by the browser or Cloud Run runtime. The CLI is used only by trusted maintainers for Firebase deploy and local Emulator operations.

`npm audit fix --force` currently proposes `firebase-tools@14.23.0`. That is a major downgrade from the installed 15.x line and does not constitute a reviewed security update, so it is prohibited as an automated fix. Recheck the current CLI at or before the exception expiry; remove the exception as soon as a supported release updates the affected transitive dependencies.
