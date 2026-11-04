# Automatic lesson continuation — November 4, 2026

## Requested scope

The owner identified `ninjadojo.meghangames.com` and requested removal of the extra Activities / Ninja Skills / Progress bar and separate Saved lessons option. Ordinary writing and reading entries now select the child's unfinished lesson automatically, preserving the original targets and saved position after curriculum changes. Main challenges, parent settings and saved scores remain accessible. The owner confirmed Astra · Extra High for continuation after confirming Sol · Medium for the initial interface stage. Existing authorized independent Astra · Extra High review is used; no model switch is claimed.

The November 2 curriculum discrepancies are explicitly deferred by the owner. No source lists, account security, cloud schemas, child records, recordings policy, frozen Grade 5 copies or homepage are changed. Ordinary games retain their existing session-only contract; unfinished ink and recordings remain temporary.

## Implementation

Only the integrated canonical/device build changes. Automatic selection validates account, child, channel, source and checkpoint identity, ignores finished or unrelated routes, and preserves malformed eligible work with an error. It uses the latest practiced unfinished route and respects an explicit parent week selection. Grade 2 writing shares its existing unfinished-visit rule. Source changes open a dedicated original-source frame; unchanged sources use existing native restoration. Entry waits for the active, unpaused frame. Switching child, account, screen or report state invalidates a pending entry. Continuing earlier writing remains possible when the newest Grade 5 week has no writing targets.

No checkpoint conversion or save-format change is required. The former recovery chooser remains available only in unaffected legacy builds. The connected app hides it and the outer three-tab bar, uses Academy branding, and retains parent return paths.

## Review and local verification

Independent review found two P2 defects in the initial implementation: unrelated/finished source warnings blocked ordinary entry, and overly broad frame reuse could return an idle old menu or an unrelated activity. Both were repaired. Focused units pass 35/35. The final full unit run passes **1,316/1,316**, with passing typecheck, lint and repository format checks.

The latest continuation matrix passes **18/18**: writing and reading in Kindergarten, Grade 2 and Grade 5 across source change/reload; child isolation; older writing without reload; parent settings/scores without the extra navigation. Both desktop Chromium and WebKit iPad run the nine cases. Tests use intercepted `ninja-device-continuation@example.invalid` fixtures, not real families. The matrix is added to the existing Academy CI gate.

Retained earlier failures: initial desktop run 1/4 exposed premature automatic entry (repaired) plus a stale test-driver menu assumption; repaired run 4/4. Expanded matrix 16/22 included six WebKit sign-in failures caused by advancing eleven days beyond the synthetic token's one-hour expiry. First renewal attempt produced 14/18 with four fixture-null failures: WebKit cleared the expired token before renewal. Renewing the synthetic token before moving the test clock resolves that race. No application authentication code changed. Original traces/logs remain under `family-beta-artifacts/automatic-continuation-2026-11-04/`.

Release audit discovered patched advisories in re2js and Firebase tooling's glob dependency. Minimum scoped overrides use re2js 2.8.7 and firebase-tools glob 14.0.2 (nested minimatch 11.0.4); legacy minimatch consumers are unchanged. Independent disposable compatibility checks pass 26/26, including identical Firebase listings for all local package files and archive/CLI checks. Production audit is zero; the unchanged tooling exception passes with nine existing findings and its existing November 4 expiry. No exception was expanded or extended.

## Publication status

Implementation is local and not yet published. Exact-package provider/recovery checks, protected CI/source integration and final release review remain required. The canonical app still serves **185605b**. Do not describe that live build as containing these changes or ask the owner to smoke-test unpublished work. Physical iPad/iMac audio, touch and continuation observation will be requested after a verified release.
