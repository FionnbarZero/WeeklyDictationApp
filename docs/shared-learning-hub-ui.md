# Shared Learning Hub UI boundary

The Learning Hub is a presentation boundary, not a curriculum or practice engine. It gives grade labs one child-facing visual system while keeping each grade's instructional rules explicit.

## Responsibilities

`src/learningHub/contracts.ts` defines the grade-neutral view model: headings, visual themes, cohort word groups, activity cards, links, disabled explanations, and opaque launch payloads.

`src/learningHub/LearningHub.tsx` renders that model and returns launch payloads through a callback. It may manage temporary navigation between the hub home and a section detail, but it does not decide which cohort belongs in a lifecycle stage or whether an activity is ready.

Each grade owns an adapter from its validated grade model into this view model. The Grade 5 adapter is `src/grade5Lab/learningHubView.ts`. It preserves the Grade 5 labels, four activity areas, Tier 1/Tier 2 separation, book resources, availability explanations, and launch requests while using the Kindergarten-inspired visual language.

## Dependency rules

The shared Learning Hub must not import:

- grade-specific source or lifecycle code;
- Acquisition, Test Review, Warmup, or unit-review engines;
- application domain or persistence state;
- Firebase, Firestore, or local storage; or
- a grade's production or development harness.

Grade adapters may translate an already-resolved grade model into display content and opaque launch actions. They must not parse teacher sources, calculate lifecycle positions, invent datasets, or write child state.

## Kindergarten status

The Kindergarten lab remains the visual reference, but its lifecycle is deliberately not being generalized yet. Its weekly learning, no-Friday-test behavior, cumulative end-of-unit review, and future rewards are separate product rules. Moving Kindergarten onto the shared visual component later must preserve those rules in a Kindergarten-owned model and adapter; it must not force Kindergarten into the Grade 2 or Grade 5 lifecycle.

## Safety checks

Architecture tests inventory the shared TypeScript files and reject grade, lifecycle, practice-engine, domain, or persistence dependencies. Grade 5 tests verify that the adapter preserves its four sections and returns the original Tier 1 writing launch request. The public Grade 5 page loads a reviewed, checksummed curriculum snapshot and continues using the shared `PracticeView` for connected writing activities.
