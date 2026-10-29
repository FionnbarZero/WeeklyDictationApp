# 5th grade Dojo — standalone edition

Published October 21, 2026: **https://5thgradedojo.meghangames.com/**, Standalone 1 / `1a9db3e`, no scheduled preview expiry. App Worker version `acbf25e2-2cd5-40ac-9034-5c535a52a38f`; homepage version `4b68566c-f571-4c7f-8a93-f1673b34346f`. See [the verified publication record](../../docs/grade5-integrated-presentation-preview.md) for test counts, exact package, the local stale-DNS caveat, email confirmation and device limits.

Owner-authorized October 21, 2026: publish the particular audited Grade 5 app separately on MeghanGames under this name. This does not replace the authenticated three-grade Ninja Dojo.

- Repository: FionnbarZero/WeeklyDictationApp.
- Intended Worker: `meghangames-5thgradedojo`; intended custom domain: `5thgradedojo.meghangames.com`.
- Same Cloudflare account as the existing homepage; no database bindings, paid-service setup or family-account changes.
- Reference interaction: frozen Integrated Preview 3, application `97c559d74db813ef839a0a3c793838c2c33a4f38`.
- Build with Node 24: `node --experimental-strip-types scripts/build-dojo-launch-preview.ts --grade5-standalone`.
- This flag changes only naming and output/hosting packaging. Teaching, games, source vocabulary and browser-local saving retain the approved Grade 5 presentation flags.
- The title and parent controls say **5th grade Dojo / Standalone 1**. The public manifest retains source identity and the approved reference revision.
- The root and legacy assessment URL redirect to the one Grade 5 entry. Static assets preserve the preview's six response headers; HTML paths remain unchanged.
- Local-only synthetic learners; no account, cloud/cross-device synchronization or offline installation. The new origin starts separate browser storage; old preview records remain on their original site. Incomplete games/tests restart, and recordings/ink remain temporary.

The homepage update must start from the current published homepage, preserving every existing project and link. October 21's before-snapshot is the seven-card site at homepage Worker version `9bb835ab-c243-435a-8989-3dcfac46d725`, not the older three-card checkout. Only the new eighth card and the project count are intentional live-content changes; the reused dojo art, CSS, JavaScript and all other assets remain byte-identical to that live snapshot.

Do not publish until source/quality checks, local provider-policy/browser checks and exact packaging pass. Publish the individual app first, verify HTTPS and the interaction, then publish the additive homepage entry. Verify existing canonical and preview manifests are unchanged. Retain the preceding homepage version and before-snapshot. Email the exact verified standalone URL to the confirmed owner address and request a short physical-device check. See STATUS and the deployment record for actual publication status; this configuration alone does not establish a live deployment.
