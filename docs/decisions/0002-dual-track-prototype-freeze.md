# ADR 0002: Dual-track prototype freeze

Status: Accepted — 2026-10-01

## Context

The existing prototypes encode approved child interactions while production orchestration is refactored. Keeping only live routes allows later shared-module changes to alter the reference; keeping only an old build cannot detect regressions in current code.

## Decision

Use two protections. The annotated tag `prototype-baseline-2026-10` and its checksum-verified static archive are immutable evidence. The same routes, fixtures, smoke tests, exit tests, and selected visual references remain in the repository as living parity checks.

## Consequences

Archived artifacts are never rebuilt from a newer commit. Later intentional behavior changes require explicit review and a new baseline identity. Integrated capabilities are implemented through contracts/adapters, and no working prototype is retired until parity is established.
