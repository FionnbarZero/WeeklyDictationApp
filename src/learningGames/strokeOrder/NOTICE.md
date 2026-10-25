# Stroke data notice

The reduced median data in `strokeAssets.ts` and `grade5StrokeAssets.ts` was extracted from
`hanzi-writer-data` for the supported curriculum targets.
The Grade 5 extension uses upstream revision `68d10a4b21150cae5e1ebbd223eed289cf32d90c`.
The D2 Grade 2 supplement in `grade2StrokeAssets.ts` uses that same revision,
extracting only validated stroke medians for 37 missing curriculum characters.
The October 16 current-week supplement in `octoberStrokeAssets.ts` uses the same
revision for 土、花、走、最、哪、家、住、里. Existing guide coordinates are unchanged.
The October 23 Grade 5 assessment prototype adds 沟、快、速、意、思 from the same pinned revision; existing guides are unchanged.
The October 19 supplement adds 虫 from the same revision, with six validated strokes.
The October 25 automatic-curriculum isolated prototype adds 马、名、字、穷、苦、庭、喜、伟 from that pinned revision. Existing guides remain unchanged; this supplement is enabled only in the automatic-update prototype.
The upstream data originated in Make Me A Hanzi and
Arphic Technology fonts.

Redistribution and modification are governed by the Arphic Public License in
`ARPHICPL.TXT`.
