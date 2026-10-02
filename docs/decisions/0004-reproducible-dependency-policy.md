# ADR 0004: Reproducible dependency policy

Status: Accepted — 2026-10-01

## Context

Floating `latest` declarations and version ranges obscure which toolchain the repository intends to support even when a lockfile preserves one installation.

## Decision

Direct runtime and build/test dependencies use exact manifest versions. Firebase's browser SDK is a runtime dependency; build tools, types, test frameworks, Emulator tooling, and Biome are development dependencies. The supported environment is Node 24 and npm 11. CI installs with `npm ci`.

Dependency upgrades occur in separate PRs on a regular maintenance cadence and run typecheck, lint, formatting, unit, production/reference builds, browser, and Emulator verification.

## Consequences

Fresh installations and CI communicate the same intended versions. Security findings are reviewed explicitly; forced major-version audit rewrites are not mixed into architectural refactors.
