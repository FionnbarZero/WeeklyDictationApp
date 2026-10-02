# ADR 0001: Separate delivery programs

Status: Accepted — 2026-10-01

## Context

The earlier roadmap combined application-shell cleanup, deployment readiness, and new Kindergarten/Tier 2/Grade 5 product policy. Unresolved product choices therefore prevented cleanup from having a stable finish line.

## Decision

Maintain three programs with independent gates: Program A for codebase cleanup, Program B for production/deployment readiness, and Program C for product expansion. Program A preserves current schemas, policy, persistence semantics, and approved behavior. Product activation is never an incidental refactor result.

## Consequences

Program A can close before Kindergarten or Grade 5 launches. Production exercises can proceed for Grade 2 without pretending another grade is ready. Product lanes express their real dependencies rather than one artificial sequence.
