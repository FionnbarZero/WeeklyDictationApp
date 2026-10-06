# ADR 0009 Activity reliability and staged delivery

Status: Accepted — October 6, 2026. Product decisions are approved; implementation remains pending unless supported by evidence in [STATUS.md](../../STATUS.md).

## Context and authority

The architecture audit found inconsistent boundaries between the family wrapper, grade activities, persistence, curriculum refresh, and release tooling. The owner approved the audit as the repair baseline, answered its product questions, and approved a revised implementation specification. Reproduce findings against the current revision before changing code; an audit is not proof that a defect remains present forever.

This record supersedes conflicting execution order, interruption, conflict, coverage, retention, and obsolete-hosting instructions in ADR 0008 and older plans. ADR 0008's teaching rules, generated-content authorization, and standing release approval otherwise remain applicable. Use the [roadmap execution queue](../../ROADMAP.md#immediate-execution-order) for order, not the historical project plan.

## Decisions

### One activity contract

Define attempt identity, child/grade/activity scope, curriculum and strategy versions, selected targets, provisional versus reviewed responses, checkpoint contents, phase/prompt/remaining timer, completion/discard, and score/graph/mastery contributions. Saving, syncing, navigation, reporting, and tests must use this same contract. Reuse approved grade engines; consolidate integration incrementally.

### Curriculum and offline continuity

- Pin an unfinished attempt to its validated curriculum and teaching-strategy versions until completion or explicit discard, including across visits. New attempts use the latest validated version. Provide a transition for existing saved records; preserve result provenance.
- After account and lessons load successfully, continue locally through network or sync failures and automatically queue reviewed progress. A sync failure must not remove or restart the activity.
- Resolve competing unfinished work at the whole activity-checkpoint level using the most recent reviewed answer. Define deterministic clock-skew handling and tie-breaking; do not mix fields from competing copies or ask a parent to choose.
- Preserve every distinct completed attempt from either device. Deduplicate retries by stable attempt identity. Selecting an unfinished winner never discards a completed result.
- Separate accumulated history from current checkpoints, bound growth, paginate history, and avoid repeated full-history syncing.
- Serve retained validated curriculum promptly; refresh independently and expose freshness and failures.

### Pause, navigation, and reporting

- In-app navigation pauses and preserves unfinished activity state and temporary response material where possible. Explicit discard requires confirmation.
- Reload, browser closure, or another device restores reviewed progress and repeats a provisional prompt whose temporary material is unavailable. Do not persist or upload recordings or handwriting images.
- Reporting is available on every screen and modal. Opening it pauses movement, timers, playback, and progression; closing it restores the teaching state.
- If reporting interrupts recording, discard that provisional clip and repeat its recording prompt on return. Reporting time must not enter the clip.
- Reports remain local and are batched for user-initiated end-of-session email/share/export. Include diagnostic context without credentials or recordings. Opening a draft or share sheet is not proof of sending.

### Results and retention

- Retain reviewed per-target correctness with attempt, activity, tier, target, curriculum, and teaching-phase provenance. Keep game practice, acquisition, Boss, and mastery reporting distinguishable.
- Each distinct completed attempt produces its own point in its appropriate line graph, ordered by completion time, including multiple attempts on one day. Daily summaries may be an additional view.
- Daily boundaries use America/Los_Angeles, including daylight-saving changes.
- Retain current and previous school years in detail and older summary totals. Implement metadata and a cleanup preview first; destructive historical production cleanup requires separate authorization.

### EduGames

The existing [game policy table](../../ROADMAP.md#edugames-rules-within-ninja-dojo) remains authoritative for tier and interaction assignments. Implement one policy definition consumed by content preparation, selection, launch validation, scoring, and tests.

Stroke Order Slay and Whispering Scrolls are complete acquisition activities: grade-owned teaching phases, timers, expanded trials, correction, earned DT, and completion rules apply. Maintain progress separate from ordinary writing and reading. Derive and cite a grade-specific phase/timer table from approved decisions, reconcile it with engines, and test both games against it. Do not assume existing code proves intended behavior; escalate only consequential contradictions or missing rules.

Validated subsets may launch. Show coverage honestly, rotate eligible targets across attempts in accordance with teaching rules, and never imply a subset completes the whole curriculum requirement. Show “Coming soon” when no usable validated subset exists. Generated meanings, sentences, and Pinyin remain authorized under ADR 0008; validate/version them and distinguish them from teacher-authored content. Never substitute unrelated vocabulary or silently change tiers.

Preserve earlier-week selection as the most recent earlier week with relevant targets; whole-set Reenter the Dojo with completed scores preserved; Spirit Realm's complete warmup/mastery rules; Kindergarten Unit 1's applicable cumulative Boss targets excluding the current acquisition week; free activity choice and Done for today.

### Delivery, hosting, and authorization

- Deliver small, coherent, independently tested changes. Repair shared reliability first, then Grade 5-specific behavior, Kindergarten, and Grade 2. UI redesign follows reliable behavior.
- Make ninjadojo.meghangames.com the canonical app. Inventory obsolete copies and dependencies; the owner prefers retirement, not maintaining separate app copies. Retire only confirmed obsolete targets. Escalate shared dependencies or irreversible data consequences beyond authorization; never delete active shared infrastructure.
- Archive obsolete deployment scripts, remove active command references, and guard against accidental execution. Preserve Git history and establish one reproducible release path with artifact identity and rollback.
- Standing approval covers tested application fixes on affected permanent grades; routine deployment approval is not required. Additional production authentication/database-security changes, resets, destructive migrations, and historical retention cleanup require separate authorization after preparing a concrete tested proposal.
- Use synthetic test data, exact release artifacts, canonical routing, and the production-intended rules. Record physical-device limitations. Keep source integration and publication status separate; follow repository protections.

## Consequences

Failing closed must preserve data without leaving children permanently blocked by recoverable changes. Completed attempts remain immutable while unfinished checkpoints can resolve automatically. In-session pause and durable resume have different guarantees because recordings remain temporary. Partial game coverage permits earlier student access but requires honest coverage tracking.

Documentation approval does not implement these behaviors. Release acceptance and progress live in the roadmap and status documents; destructive cleanup and hosting retirement are separate from urgent learning repairs.
