# Compact Shuriken and Dictation layouts — October 25, 2026

## Verified delivery

**Prototype 6 — compact games / application `89bc62cc262cc28dc2e914c4d02775b7f9e96292`** is published on the existing isolated combined test website. [Kindergarten](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=kindergarten) · [Grade 2](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade2) · [Grade 5 — regular curriculum](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade5). These are synthetic, browser-only previews, not the canonical app or the frozen Grade 5 presentation. The unchanged URL still contains `v1`; reopen it to load Prototype 6 without clearing browser data.

Hosting version `eca35a83b4a7af77`; public file tree `31e1633e8290d811ba8ca14174ccf73369a5ca0a4911fd865440ebaf346d977d`. Expires **November 1, 2026 at 5:20 AM Pacific**. All **192 public files / 1,152 headers** exactly match the retained package. Email sending is verified SENT, message `1a1733b16644abe1`.

## Repair and boundaries

- Shuriken Match has a compact title row and scene ribbon, reducing decorative space while retaining large Chinese/English cards, timer, progress, streak and feedback. All cards, including complete 16-card boards, fit the tested laptop and tablet views, including saved/resumed sessions and mastered-word guided correction. The ribbon tightens further on short, wide screens.
- Dictation Streak places replay beside the instruction, removes the tall decorative transmission display and keeps input, Pinyin candidates and submit together. The wrong-character correction card remains fully visible.
- Exit and other controls retain useful touch targets. Narrow/reduced-height screens scroll naturally, with no horizontal page overflow in the tests; there is no fixed-height document clipping. Browser-saving status remains available in compact form, without the duplicate technical paragraph.
- Every new layout selector requires `data-w-roadmap-preview="true"` and one of the two game classes. No teaching, scoring, timing, speech, recording, checkpoint, curriculum or data-schema logic changed. Other source changes are the Prototype 6 label and regression tests. Source review found no broader application behavior changes.

## Regression evidence

| Check | Result and scope |
| --- | --- |
| Final local layout matrix, application `89bc62c` | **26/26 passed**: all three grades, Chromium 983×638, WebKit 1024×665 and 768×1024; saved-match resume; mastered guided correction; wrong answer/retry, Report/return, completion/reopening; two Grade 5 small-screen cases at 390×844 and 844×390. |
| Same final hosted layout matrix | **26/26 passed** against the verified published package. |
| Hosted Kindergarten audio | **12/12 passed** in Chromium/WebKit, including native original media, retry, Report and Exit cancellation. Actual physical speakers were not observed. |
| Focused recovery/completion/audio matrix | **26/26 passed** at the initial complete layout candidate `32e0746`; the later source change only tightens guided-message/ribbon CSS. Final hosted layout cases cover that refinement and saved resume. |
| Units | **1,261/1,261 passed** at `32e0746`; no functional code changed afterward. |
| Final build/type/lint/format | Passed. Initial production bundle remains **549,980/550,000 JavaScript bytes** and **46,342/60,000 CSS bytes**; budgets were not relaxed. |
| Predecessor negative controls | Both targeted laptop checks fail on published Prototype 5 for the intended below-fold cards/Pinyin choices. |

Layout tests control speech/media timing for reproducibility. The separate hosted audio suite exercises the original native recordings. The final application was also inspected visually in portrait, landscape and short laptop screenshots, including long Chinese labels, Pinyin choices and guided correction. This is source/automated review, not a separate-agent audit or a claim that all bugs are absent.

### Development failures were addressed

The first six laptop cases were **one pass / five failures**: the duplicate header row still consumed too much height and the smaller Dictation form clipped its correction card. Both were fixed; the ordinary 18-case matrix then passed. An expanded development run was **20/23**: saved-game notices consumed additional height, and one portrait test clicked the wrong resume label. The compact notices and test driver were corrected; candidate `32e0746` passed all 23 cases.

Adding guided mastered-word correction exposed a laptop overflow: **2/3 passed** before refinement, and **2/3** after a margin-only change. Tightening the short-screen scene ribbon as well fixed the remaining overflow; **3/3** then passed, followed by the final **26/26** local and hosted matrices. The failures and predecessor controls are retained where available. The earlier 20/23 run's output directory/log name was reused by the final matrix; its aggregate is accounted from the session, not claimed as a retained full trace.

## Protection, rollback and remaining acceptance

Frozen standalone Grade 5 stays at `1a9db3e34860fa886afa337ad42028d9bfb69014`, verified across **183 files / 1,098 headers**. Canonical `9d06a02` and all **18 other hosting releases/expiries** remain unchanged. No teacher documents, child records, authentication, DNS, canonical deployment or security headers were changed. No merge/push occurred.

Retained final package and evidence: `/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/family-beta-artifacts/prototypes/w-combined-89bc62c`. The preceding package remains at `family-beta-artifacts/prototypes/w-combined-389d2f3/package` for rollback. Later documentation commits do not change this published application identity.

Ready for **one 3–5 minute physical-iPad check**: open the same grade link, compare portrait/landscape, match a wrong pair then retry, type Pinyin and choose a character with the native keyboard, use Hear/replay, and Report/return. Use the existing report button for feedback. Native keyboard positioning, physical speaker/Pencil behavior and authenticated/offline/cross-device acceptance cannot be established by these automated checks. Working-prototype approval and existing compatibility/release gates still precede canonical integration. Future imported language content, parent editing, source refresh and broader policy/voice roadmap work remain open.
