# Meghan Games homepage

This is the static source for the existing `meghangames-home` Cloudflare Worker at https://meghangames.com/. It is not the EduGames Worker or one of the grade applications.

The seven public homepage assets were recovered from the live site on October 5, 2026 because no homepage source checkout was present in the inspected project directories. Existing design, art, EduGames link, and Stroke-order link are preserved. The Ninja Dojo card now links directly to the three permanent grade apps, preserving their origins and saved browser data.

Previous live Worker version retained for rollback: `5d1f2f52-b5c2-46e5-a33c-132bfffbf83c`, deployment `ed4a6859-5e75-4bf1-b8e8-16372390f69d`. The original version is static-assets-only with no bindings, compatibility date `2026-10-04`, and existing custom domain `meghangames.com`. Do not redeploy the separate `meghangames-ninjadojo` copy or change DNS as part of a homepage link update.

Validate all local asset references and direct grade URLs. Check desktop and iPad-sized layouts, keyboard access, 48-pixel link targets, and image loading. Deploy with the existing authorized Wrangler connection using this directory's explicit config; retain domain settings and variables. Verify the public homepage and each destination after publication. Record the new version in the release record.
