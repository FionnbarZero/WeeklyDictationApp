# Whispering Scrolls acquisition

D1 adds a separately saved Tier 2 reading choice inside the Dojo for all three grades. Its controller uses the existing acquisition engine and each grade's reading strategy. Ordinary reading remains independently selectable. This work is local and unpublished.

## Teaching contract

[ADR 0008](decisions/0008-family-beta-product-and-release-policy.md) requires separate progress, a checkpoint after each completed trial, and record → child playback → correct model → self-assessment. [ADR 0009](decisions/0009-activity-reliability-and-staged-delivery.md) requires grade-owned timers, expanded trials, correction, earned DT, curriculum pinning, and temporary-only response material. The [reading boundary](tier2-reading-boundary.md) specifies visible reading targets and the Kindergarten correction exception.

In the table, F means familiar DT, T means the current target, M means teaching/model presentation, and D means the engine-selected familiar or earned DT. A teaching presentation plays “Read and record” followed by word → available approved context → word → word. Independent trials show the characters without first playing the model. Every response is compared before self-assessment; there is no automatic pronunciation grading.

| Rule | Kindergarten reading | Grade 2 reading | Grade 5 reading |
| --- | --- | --- | --- |
| Introduction | F F M T | F F M T | F F M T |
| Expanded trials | T D T D D T D D D T D D D T | T T D T D D T D D D T | T T D T D D T D D D T |
| Expanded target seconds | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 |
| Familiar and earned DT seconds | 5 | 5 | 5 |
| Introduction and correction target/model seconds | 10 | 10 | 10 |
| Correction | M M M T F T; feedback only | M M M T F T; existing engine scoring | M M M T F T; existing engine scoring |
| Incorrect final expanded target | Correction then retry the same six-second scored target; earn only after a correct scored target | Existing grade engine transition | Existing grade engine transition |
| Earned DT | Existing demotion, correction, reacquisition and return position | Same grade-owned engine contract | Same grade-owned engine contract |

Strategy sources: [Kindergarten reading](../src/tier2/profiles/kindergarten.ts), [Grade 2 reading](../src/tier2/profiles/grade2.ts), [Grade 5 reading](../src/tier2/profiles/grade5.ts), and their [grade-owned acquisition strategies](../src/acquisition/strategies). The [engine](../src/acquisition/engine.ts) and [transition boundary](../src/acquisition/transition.ts) remain authoritative for assessment facts and phase changes. D1 does not copy or reinterpret these transitions.

## Readiness and implementation boundary

The shared family learning hub already resolves current acquisition cohorts. The reading engine, pinned acquisition store, immutable score ledger, and family practice synchronization are reusable. Missing pieces are a distinct Whispering Scrolls entry and identity, a recognizable scroll presentation, enforced response timing, reliable failed-save retry, and saved-lesson routing back to this activity.

The response interval starts after microphone permission and recording start, excluding teaching playback and report/navigation pauses. It ends recording at the grade's configured duration; the child may stop once finished. Permission failure offers the existing say-aloud fallback and model comparison. An unfinished response is repeated after reload; no recording, blob URL, or provisional response enters durable storage. Supported native recorder pause/resume preserves an in-session recording while disabling microphone tracks during reporting; unsupported pause is disclosed and repeats only that unfinished response.

The new activity uses `whispering-scrolls` as its acquisition module identity and a distinct completed-score label. Per-target reviewed facts remain in its acquisition checkpoint. Saved routes distinguish it from ordinary reading. No data migration, production security change, or new storage collection is required. Recovery must use the existing guarded predecessor package so an older interface cannot reinterpret the new route.

## Acceptance

Verify all three grade sequences, timers and correction/earned-DT behavior against the existing engine; separate ordinary-reading state; frozen curriculum on resume; failed-save retry; completed score idempotence; fresh-browser practice synchronization; pause/resume and microphone cleanup; and absence of recording material in storage. Browser checks cover desktop and touch layouts. Physical microphone, sound and iPad behavior remain owner acceptance after reviewed publication.
