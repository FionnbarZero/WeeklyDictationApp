# Shuriken cards and Ninja Skills menu cleanup

October 14, 2026. The owner requested easier fixes alongside the separate writing integration and confirmed GPT-6.1 Sol with High reasoning for this slice. These changes address reports `c6bf6a3e` (card presentation), `6f779ea7` and `e6f668cb` (standalone Sky Writing in Ninja Skills).

## Changes

Shuriken Match cards now devote their content area to larger Chinese words and English meanings. The repeated “word seal”/“shadow meaning” labels and speaker icons are removed. The existing tap-to-hear handler, accessible audio instructions, languages, matching, timer and saved-result behavior are retained.

The shared canonical Ninja Skills menu no longer adds standalone Sky Writing for Kindergarten, Grade 2 or Grade 5. Its writing input, acquisition use, retained results and development harnesses are preserved. This slice does not change teaching rules or the matching-game data policy.

The isolated branch starts from current main `d364c64146226a4268d3d18e5b2dd5b0e485c8b9`. It changes only the shared family hub, Shuriken component/styles and two assertions in the existing game-policy browser suite. The Grand Scroll checkout and its writing files are untouched; its later integration should include this compatible change from main.

## Verified local candidate

- Application/test commit: `6667b60145a31d118b9d90f5bec05b8fa6d19901`.
- Retained exact package tree: `7aaaedd1035fbdd143aee3048afded18922228c6f1a70588104101760688312e`, with 155 manifest files.
- All 1,079 unit tests, typecheck, lint, configured formatting, build/performance and dependency gates pass. Initial JavaScript remains 546,027/550,000 bytes and CSS 42,745/60,000 bytes. The existing time-bounded tooling audit exception is unchanged; the production audit reports zero vulnerabilities.
- All 12 exact-package desktop/tablet cases pass without retries or skips: six canonical menu cases and six complete reviewed Shuriken rounds across the three grades. Existing checks cover tier selection, report pause and completed results.
- Separate visual inspection verifies all 16 card labels fit at 1280, 1024 and 600 pixel viewport widths; minimum English sizes are 22.4, 20 and 16.8 pixels respectively. Card screenshots and generated logs remain in ignored `family-beta-artifacts/releases/w4a-game-polish/`.

## Next gate

Independent GPT-6 Astra with High reasoning review is required before release. Verify the final PR checks, integrate through protected main, prepare the exact candidate and guarded recovery, then publish and verify the canonical build under existing standing release authority. No production authentication/security or record reset is part of this slice.

This candidate is not published. The last verified live application remains `2f20c6d`; it must not be used to test these unpublished card/menu changes. After publication, request only a short Shuriken-card/tap-audio and Ninja Skills-menu check on iMac/iPad. Physical sound and touch acceptance remain separate from the automated checks. Layout/scrolling, Lanterns recovery, broader Spirit Realm and the ongoing writing work retain their own scopes.
