# Grade 2 local restore rehearsal

Use this procedure before the first Grade 2 safety release is promoted. The current live Grade 2 artifact does not yet include **Protect progress**, so the first capture must use the temporary download-only bookmarklet below.

The capture and verified backup contain private family learning records. Keep both outside the repository in family-controlled storage. Do not attach them to an issue, pull request, release manifest, or chat.

## 1. Capture the live browser state

From a clean checkout of the candidate, print the bookmarklet:

```bash
npm run grade2:rehearsal:bookmarklet
```

Create a temporary browser bookmark and paste the complete printed `javascript:` value into its URL field. In the browser profile that holds the Grade 2 progress:

1. Open exactly `https://fionnbarzero.github.io/WeeklyDictationApp/`.
2. Confirm the intended Grade 2 profile is selected.
3. Run the bookmark.
4. Move the downloaded `weekly-dictation-grade2-private-capture-*.json` file into private family-controlled storage outside the repository.

The bookmarklet is origin- and path-bound. It reads the selected-profile identifier and the three Grade 2 restore keys, creates one local JSON download, and makes no network request. Delete the temporary bookmark after the capture.

## 2. Rehearse the committed candidate

Run only from the clean committed revision being considered for release. Use new output paths outside the repository:

```bash
npm run grade2:rehearse-restore -- \
  --capture /absolute/private/path/weekly-dictation-grade2-private-capture.json \
  --backup-output /absolute/private/path/weekly-dictation-grade2-verified-backup.json \
  --evidence-output /absolute/path/grade2-restore-rehearsal-evidence.json \
  --confirm-origin https://fionnbarzero.github.io \
  --confirm-disposable-copy
```

The tool builds the exact Git revision, serves it to an isolated Playwright context under the recorded Grade 2 origin, blocks all external network access, and never opens or changes the live family browser profile. It refuses an uncommitted worktree, an in-repository private input or backup, an unexpected origin, an existing output path, or malformed captured storage.

The rehearsal must pass all of these checks:

- verified whole-local-state export and checksum;
- zero-write preview and wrong-profile rejection;
- selected-profile merge with unrelated-profile preservation;
- automatic pre-restore backup matching the disposable pre-state;
- reload persistence and duplicate-restore idempotence;
- startup replay of an interrupted three-key write;
- rollback after an injected write failure; and
- fail-closed handling of unexpected newer storage.

## 3. Retain the right evidence

Retain the verified backup privately through the release rollback window. Record only its filename, creation time, SHA-256 checksum, candidate revision, application version, origin, and the completed boolean checks from the evidence JSON in the release manifest.

The evidence file is designed to exclude the selected-profile identifier, browser storage keys, and captured values. It is safe to review, but inspect it before sharing. Keep the original capture until the promoted release and rollback candidate have both been accepted; then delete it according to the family's retention decision.

A passing rehearsal proves the candidate's local backup and restore controls against a disposable copy of the captured state. It does not authorize deployment by itself and does not prove the activity behavior is product-correct.

## Recorded rehearsal

The real-family-state rehearsal passed against exact merged revision `8355522bdc82bb50e11855108ee8edd9d26e6c39` at `2026-10-04T01:53:12.341Z`. All required checks above passed, external page network access was blocked, and no live browser storage was written. The retained private backup SHA-256 is recorded in the [draft Grade 2 release manifest](./family-beta-release-grade2-2026-10-03.md); the backup itself remains outside the repository.

Because the delivery controls land after that revision, repeat the rehearsal against the exact final promotion revision before approving the release. Keep the stable Grade 2 origin unchanged: verified backups intentionally reject a different origin.
