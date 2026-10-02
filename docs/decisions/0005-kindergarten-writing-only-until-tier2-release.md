# ADR 0005: Kindergarten is writing-only until Tier 2 receives a separate release decision

- Status: Accepted
- Date: 2026-10-01

## Context

The Kindergarten prototype contains a substantial Tier 2 reading experience, but its recording is prompt-local and its results are session-only. Activating the Kindergarten curriculum source must not accidentally present that prototype as durable production progress.

## Decision

The integrated application treats a Tier 2 profile as launchable only when its constrained `availability` is `main-app`. Kindergarten Tier 2 remains `development`, with `session-only` results, `prompt-local` recording, and blocked production eligibility.

Therefore, the default Kindergarten production lane is writing-only. Source activation by itself cannot expose Tier 2. A separate reviewed change must choose and implement either an explicitly session-only release or durable Tier 2 metadata before changing the profile to `main-app`.

## Consequences

- Kindergarten source activation and Tier 2 activation are independent gates.
- The fail-closed default cannot be bypassed by merely enabling a curriculum source.
- The frozen Kindergarten lab remains available as the behavioral reference.
