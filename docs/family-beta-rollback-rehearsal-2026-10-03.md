# Family beta rollback rehearsal — 2026-10-03

Status: offline artifact extraction and browser launch passed; no live destination changed.

This rehearsal is intentionally limited to immutable GitHub Pages artifacts. It proves that the observed live artifact and its immediate predecessor can be recovered and launched away from the child-facing URLs. It does not approve either artifact's activity behavior and does not provide grade-specific rollback.

## Frozen artifacts

| Role | Deployment commit | Tree | Result |
| --- | --- | --- | --- |
| Observed live baseline | `8fffebee35a91fc31ba37a8d4dd1141517aaf023` | `717b009368df68043be1f98536cb754cc2f598c4` | Archive extracted; all three routes launched with HTTP 200 and no browser console, page, or failed-request errors |
| Immediate predecessor | `a4dc97f4ba5b09b4a7d23847740014f3a9d90956` | `05365a177199655698437d4a549661931296c046` | Archive extracted; all three routes launched with HTTP 200 and no browser console, page, or failed-request errors |

The predecessor is the live artifact's direct parent. The only changed route is Grade 5: its JavaScript asset and HTML reference changed. Grade 2 and Kindergarten entry HTML are byte-identical between the two artifacts.

## Entry-file SHA-256

| Entry | Live baseline | Immediate predecessor |
| --- | --- | --- |
| `index.html` | `a183fb1339140248ea11ad01ae1b26ee7e8955c21415be9e5d4aae81612daa15` | `a183fb1339140248ea11ad01ae1b26ee7e8955c21415be9e5d4aae81612daa15` |
| `kindergarten-learning-lab.html` | `eae49bed5ffcd14370ec5d8816b8c606c5044de53eac7686ffef59fc3837c3e2` | `eae49bed5ffcd14370ec5d8816b8c606c5044de53eac7686ffef59fc3837c3e2` |
| `grade5-learning-hub.html` | `39ad3f0c0ec61e3e87173df1bde93dd7dcc46aeffb50e5362ca8cde3fb86b991` | `b53ca94ebcbb43ee0f9fbcc376e8fda56aff47b858c79e9f612b6dced7b175b3` |

Every local asset referenced by the three entry files existed in each extracted artifact.

## Rehearsal boundary

- The `gh-pages` branch and public URLs were not moved.
- The predecessor is technically recoverable but is not yet adult-approved as known-good behavior.
- A rollback today would still replace all three grades together.
- Grade 2 browser data would stay on the same origin, but any persistence-affecting rollback still requires a verified private backup and compatibility review.
- Promotion, live rollback, independent-grade routing, adult activity acceptance, and lossless Grade 2 restore remain open C0 gates.
