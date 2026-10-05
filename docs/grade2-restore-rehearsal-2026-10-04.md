# Grade 2 real-export restore rehearsal — 2026-10-04

Status: passed with the production restore code against the private family export. The source file remained in family-controlled Downloads storage and was not copied into the repository.

## Input identity

| Field | Verified value |
| --- | --- |
| File | `weekly-dictation-grade2-verified-backup-merged-9242d43.json` |
| Envelope | `weekly-dictation-verified-backup-v1` |
| SHA-256 | `40bb29c3bc97ef7a047c73de2dfdbbabadddaa5e13ebebaa700405e4bbdbec17` |
| Created | `2026-10-04T03:53:44.996Z` |
| Application | `0.2.0-stage2`; state version 2 |
| Safe aggregate | 4 datasets; 3 selected-child practice records; 1 Acquisition record; no pending recovery entry |

No child identifier, browser origin, word content, answer, or score value was printed or copied.

## Result

The first deep rehearsal exposed a real validator defect: a valid generated Familiar-DT observation is intentionally outside the weekly dataset word list. The restore validator now checks that such observations match the registered Grade 2 Familiar-DT pool while continuing to require canonical dataset-word references for earned targets. A regression test covers both the valid and altered-target cases.

After that fix, `npm run rehearse:restore -- --backup <private-file>` passed all gates:

- checksum, envelope, timestamp, application state, recovery journals, selected profile, and origin scope validated;
- selected-child merge and all deep referential checks completed with zero preview writes;
- an injected mid-transaction storage failure restored every prior key and removed the journal;
- the first complete three-key transaction applied and exactly matched the planned state;
- the second identical transaction returned `idempotent`; and
- no restore journal remained.

This is an offline production-code rehearsal, not permission to overwrite an active family browser. A future destructive browser apply must still begin with a newly downloaded pre-restore backup and the adult confirmation in the UI.
