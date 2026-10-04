# Activity typography inventory

This is the approved cross-grade typography contract. Browser root size is 16px.

| Activity or surface | UI/display font | Mandarin character font | Character size | Supporting text |
| --- | --- | --- | --- | --- |
| Main Practice hub and profile controls | DM Sans; Fraunces for display headings | Songti SC in vocabulary chips | 24px chips | 12px minimum; 14px normal copy |
| Tier 1 pre-activity Warmup | DM Sans | Songti SC | Writing lanes fill each character cell | 12px minimum |
| Tier 1 Acquisition teaching | DM Sans; Fraunces in headings | Songti SC | Writing lanes fill each character cell | 12px minimum |
| Tier 1 Test Review collection | DM Sans; Fraunces in headings | Songti SC | Writing lanes fill each character cell | 12px minimum |
| Tier 1 final comparison | DM Sans | Songti SC | Scales by word length: 60–352px depending on viewport and 1–3+ characters | 12px minimum |
| Chinese typing with a Pinyin keyboard | DM Sans | Songti SC for the selected Chinese-character response | Entry 36–80px; locked review 72–144px | 14px instructions and validation |
| Tier 2 Acquisition reading | DM Sans | Songti SC | 72–112px | 12px minimum; 14px normal copy |
| Tier 2 Test Review reading | DM Sans; Fraunces in headings | Songti SC | 72–112px | 12px minimum |
| Tier 2 Mastery reading | DM Sans | Songti SC | 72–112px | 12px minimum |
| Kindergarten reading and reveal cards | Inter/DM Sans; Georgia/Fraunces for display headings | Songti SC | 72–112px | 12px minimum |
| Kindergarten listening, memory, and choice games | Inter/DM Sans | Songti SC for the active prompt; activity-sized choice cards | Active prompt 72–112px; choices 19–54px | 12px minimum |
| Shared learning games | Inter/DM Sans; Georgia for display headings | Songti SC | 72–112px | 12px minimum |
| Grade 2 Learning Hub | DM Sans; Fraunces/Georgia for display headings | Songti SC in word chips | 24px chips | 12px minimum |
| Grade 5 Learning Hub | Inter/DM Sans; Georgia for display headings | Songti SC in word chips | 24px chips | 12px minimum |
| Progress and reading history | DM Sans; Fraunces in headings | Not applicable | Not applicable | 12px minimum |
| Developer source/debug panels | Monospace where raw JSON is shown | Source content keeps its own script font | Not a teaching prompt | 12px minimum |

## Explicit exceptions

- Sky Writing trace glyphs use a 760-unit SVG font size because the view box is 1000 units high; this is a drawing coordinate, not CSS pixels.
- Sky Writing final comparisons scale by character count so one-character and multi-character words occupy comparable writing space.
- Game choice tiles may be smaller than the active 72–112px teaching prompt so all choices remain visible; they are never smaller than 19px.
- Large decorative characters, seals, and background marks are ornamental and do not set teaching size.

The implementation tokens live in `src/accessibility/typography.css`: UI minimum `0.75rem` (12px), support copy `0.875rem` (14px), primary Mandarin prompt `clamp(4.5rem, 16vw, 7rem)` (72–112px), and Mandarin word chip `1.5rem` (24px).
