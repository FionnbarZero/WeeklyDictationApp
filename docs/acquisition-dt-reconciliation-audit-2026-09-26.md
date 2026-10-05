# Acquisition and Distractor Target reconciliation audit

Date: 2026-09-26

## Outcome

The project plan and Grade 2 implementation now use Distractor Target terminology and the approved Acquisition strategy v2. The old feature branch was used as behavioral evidence only; it was not cherry-picked wholesale, and its bundled runtime vocabulary was not restored. Canonical importer-derived weekly datasets remain the only weekly vocabulary source.

Implemented and reviewed:

- Familiar DT placeholder pool: `一、二、三、四、五、六、七、八、九、十、大、小、上、下、人、水`.
- Independent Familiar and Earned DT shuffle bags with repeat avoidance.
- Introduction: two different Familiar DTs, one 10-second copy, one 10-second hidden weekly target.
- Expanded Trials: `target, target, DT, target, DT, DT, target, DT, DT, DT, target` with target timers `10, 9, 8, 7, 6`.
- Correction: three 10-second show-and-copy presentations, one 10-second hidden target, one new 5-second Familiar DT, and one final 10-second hidden target.
- Three consecutive scored errors restart the affected weekly target or Earned DT at Introduction.
- Successful Correction resumes the next unfinished teaching-sequence position.
- Weekly targets become Earned DTs only after completing the teaching sequence.
- Ongoing 50/50 Established/Earned DT practice after the weekly teaching progression is complete.
- Separate per-child, per-target DT observation history; DT and copy responses are excluded from the weekly score.
- **Done for today** produces one Acquisition visit score from only that visit's hidden weekly-target responses.
- Exact local and cloud Acquisition checkpoints, including routine position, timer progression, bags, Earned DT pool, error counts, and the next prompt.
- Skippable Warmup, whole Test Review skip, individual Skip Timer, and a prior-week **Learn date-range words** entry.
- Test Review skip preserves completed Warmup work and removes provisional cloud Test Review attempts.
- Dashboard copy now asks the child to choose an activity rather than a lifecycle.

## Interpretation decisions used in the implementation

The supplied rules left a few transition details implicit. The implementation uses these explicit interpretations:

1. “After three errors” means three consecutive assessed errors for the affected weekly target or Earned DT; a correct assessed response resets that word's count.
2. Successful Correction resumes the next unfinished position. A failed Expanded target therefore does not repeat already completed Expanded positions.
3. An Introduction error resumes at the first Expanded target after successful Correction.
4. The DT inside Correction is a new Familiar DT. This avoids recursively interrupting one Correction with another Earned DT Correction.
5. **Done for today** scores only responses completed in that visit. It does not recompute one cumulative score from earlier visits.
6. Once teaching is complete, the same Acquisition entry becomes open-ended DT practice and ends through **Done for today**.

These interpretations are recorded in `PROJECT_PLAN.md` so code and documentation now share one contract.

## Verification completed

- TypeScript production build: passed.
- Vite production bundle: passed.
- Automated tests: 138 passed, 0 failed.
- Whitespace/error check: `git diff --check` passed.
- Repository terminology scan: no legacy DT terminology remains in tracked source or documentation outside generated build output.
- Focused tests cover the 11-position sequence, all five target timers, both DT pools, shuffle-bag exhaustion, Correction, three-error restart, exact-position reload, idempotent DT observations, DT-only practice, per-visit scoring, whole Test Review skip, UI controls, and cloud hydration.

## Remaining risks and revision recommendations

### Priority 1 — before deploying these cloud changes

1. Add Firebase Emulator Suite tests for the new session statuses, temporary-attempt deletion, Acquisition progression documents, DT observations, cross-family denial, and duplicate-ID behavior. The rule changes are statically reviewed but have not been executed against an emulator in this workspace.
2. Make “save assessed trial/DT observation/next Acquisition position” one Firestore transaction or trusted batched server operation. The IDs are idempotent, but the browser currently issues related writes in parallel; a partial network failure can temporarily save one side without the other.
3. Validate Familiar DT identity against a server-managed, versioned DT profile. Current rules validate family ownership and the canonical Acquisition dataset, but cannot prove that a submitted Familiar DT ID/text belongs to the approved profile because that profile is not yet stored as shared server data.

### Priority 2 — preserve the adaptive Warmup feature fully

4. Finish durable partial-Warmup resumption. Existing code still discards incomplete local Warmup records during hydration, and cloud attempts are promoted only when the Warmup or containing activity reaches a save boundary. This predates the Acquisition reconciliation but conflicts with the project plan's durable partial-Warmup contract.
5. Render the planned Warmup visit graph and show partial/completed status, attempted versus target counts, and source buckets. Monthly Random Rotation totals exist, but the full child-facing graph does not.
6. Add a real standalone Warmup start control to the normal activity dashboard. Standalone Warmup currently appears mainly as the no-active-dataset fallback.

### Priority 3 — hardening and clarity

7. Add browser-level interaction tests. Current UI tests inspect source and domain tests exercise the state machine, but no test clicks through Warmup skip, timer skip, Correction, **Done for today**, reload, and prior-week resume in a rendered browser.
8. Strengthen deserialization validation for `AcquisitionFlow`. Local and cloud hydration currently verify the outer record more strongly than every nested routine, bag, prompt, and resume-position field.
9. Split visit completion from teaching completion in reporting and naming. The state machine now preserves `teachingComplete`, but older `CompletedSession.complete` naming can still imply that the complete weekly teaching progression finished when it only means the child completed today's visit.
10. Show the prior-week learning action conditionally or change its completed-state label. It is intentionally always available during Test Review so completed sets can enter DT-only practice, but **Practice date-range words** would be clearer than **Learn date-range words** after teaching is complete.
11. Keep browser-created percentages labeled as client-trusted until scoring and progression validation move behind a trusted server boundary.
12. Complete the broader terminology cleanup discussed in blueprint work: reserve lifecycle for the dataset's time-based stage, activity for the dashboard entry, and routine for Introduction/Expanded Trials/Correction. The child-facing dashboard is corrected, but some internal legacy type names still combine Warmup with lifecycle phases.

## Branch preservation

All pre-existing branches remain untouched. This reconciliation is isolated on `feature/acquisition-dt-reconciliation`; no branch was deleted and no remote was changed.
