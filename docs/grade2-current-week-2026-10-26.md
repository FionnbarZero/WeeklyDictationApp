# Grade 2 missing week — October 26, 2026

The current teacher deck was read through the Drive connector, including the native text runs of all nine slides. The public curriculum endpoint was also fetched. Its timestamp was fresh, so this is not evidence of a browser-cache or scheduling failure.

The [October 26–30 slide](https://docs.google.com/presentation/d/10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4/edit#slide=id.h6bc9bc7bede960f3_0_0) says “Testing week” and “Review of T1” without an explicit vocabulary list. No October 26 target cohort has been invented. The owner has been asked whether to use the October 19 Wetland words, all Term 1 words, or another supplied list. That answer is pending.

The [October 19–23 slide](https://docs.google.com/presentation/d/10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4/edit#slide=id.h1ff8b9c421a2a037_0_0) does contain words. Three concrete importer defects concealed or misread them:

- Native element order starts with Math before Mandarin. The old projection cut off everything at Math and published only the week heading.
- The teacher's standalone Tier 1/2/3 headings have no colons. The existing parser requires colons.
- The existing flattened text reader inserts a newline between formatting runs, splitting 湿地 into two targets even though there is no teacher-authored newline there.

The local repair locates the explicit Mandarin section independently of subject order, joins native text runs within their original text container, and normalizes only standalone tier headings. It excludes unrelated subject content and does not treat review prose as vocabulary. The recovered writing set is **湿地、食物、还有、动物、蛋**. Tier 2 is **栖息地、昆虫、金蛙、蛇、鳄鱼、湿地**; Tier 3 is **陆地、白鹭、灌木、海藻、芦苇、生态环境、健康**. All seven previously valid datasets, including identities and fingerprints, compare exactly to the fresh service response. Eight explicit vocabulary weeks are recoverable in total.

## Verification and publication boundary

**Local only; not deployed.** All **1,291 units**, type checking, scoped formatting/lint and the production size gate pass (549,959 initial JS bytes; 46,342 CSS bytes). The five added tests use native teacher text runs, test all six subject orders, assert exact word/tier boundaries, preserve prior datasets and exclude the unspecified review week. The fixture replaces unrelated ELA/Math material with synthetic exclusion probes. No physical/browser acceptance or new-word audio/guide/game readiness is claimed.

The deployed curriculum service is shared with canonical family clients. It has not been changed as an incidental preview repair. Current hosted Combined Dojo remains **b36f736 / Device repairs 1**. The frozen standalone Grade 5, canonical app, teacher documents, browser progress and family records remain untouched. No new preview, email or smoke-test handoff occurred. Next: resolve the review-word scope, prepare the isolated working curriculum repair and new-target resources, then verify the served interaction before handoff under the existing release boundaries.

Evidence is retained in `family-beta-artifacts/grade2-current-week-2026-10-26/`: original service response, full teacher source, repaired snapshot, unit/type/build logs. Initial two import-order formatting findings were corrected; the final scoped check passes. Source date read from Drive: October 23, 2026 at 21:47:22 UTC. The service payload before repair had hash `df14fe766f1fc9320e916ed76cd488dd4c0fcadbde8d2825668ae43a7fb1d9c2`.
