# Acquisition transition boundary

This boundary centralizes how one reviewed Acquisition prompt becomes the exact next teaching flow and an optional, persistence-neutral assessment. It does not redesign persistence or change the Grade 2 child experience.

## Responsibilities

`src/acquisition/transition.ts` captures the revealed prompt before advancing the pure teaching engine. It returns:

- `nextFlow`, which is identical to the flow returned by the existing compatibility API; and
- `assessment`, when the reviewed prompt represents a recordable response.

The assessment retains the complete generic target object and the answered prompt's stable identity. This is necessary because Established DT targets are not members of the weekly dataset. Child, family, session, dataset-envelope, timestamp, cloud-path, and repository details remain outside the transition.

## Classification rules

- Show-copy advances the teaching flow without producing an assessment.
- A weekly hidden target produces a weekly-scored assessment.
- An Established DT produces an unscored Established-DT assessment.
- An Earned DT produces an unscored Earned-DT assessment.
- A target prompt inside Earned-DT Correction remains an unscored Earned-DT assessment.
- A target prompt inside weekly-target Correction remains weekly-scored.

Classification is copied from the answered prompt rather than inferred again from its prompt kind. This preserves the distinction between a weekly target and an Earned-DT Correction target even though both use `kind: 'target'`.

## Compatibility and application use

`src/domain.ts` retains `answerAcquisitionPrompt(...)` with its existing parameters, defaults, function arity, and flow-only return value. It also exposes `transitionAcquisitionPrompt(...)` for application orchestration.

`src/App.tsx` consumes the transition result to build the same `SessionAnswer`, local checkpoint, Acquisition progression, DT observation, and weekly attempt payloads that it created before this boundary. Show-copy still saves the next progression position but creates no response, DT observation, or weekly attempt.

## Deferred work

This branch does not change stored progress schemas, Firestore clients or rules, stable document identities, write ordering, atomicity, retries, migrations, validation, or concurrent-device behavior. Those concerns remain assigned to `feature/persistent-acquisition`.
