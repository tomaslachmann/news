# 14 — Blocked-Content Detection

**What to build:** Replace the length-only paywall heuristic with a blocked-content phrase check, so consent walls, ad-block nags, and bot-blocks are correctly flagged as extraction failures instead of silently stored as if they were the real article. iDnes's cookie-consent redirect is the concrete case: `MIN_TEXT_LENGTH` (150 chars) doesn't catch it, because the consent page's boilerplate text is ~5,700 characters — comfortably over the threshold, so a block page passes as if it were a long real article.

**Blocked by:** 04 — Review Step & Content Extraction.

**Status:** done

- [x] A config list of known blocked-content phrases exists (Czech consent/ad-block/paywall nag text), seeded with the iDnes consent-page phrases confirmed live (e.g. "Neblokujete reklamy", "Chci čtení bez reklam")
- [x] After scraping, extracted text is checked against the phrase list in addition to the existing length check; a match sets `Coverage.status` to `extraction-failed` regardless of length
- [x] The phrase check runs for every outlet, not just iDnes — it's a generic mechanism, not an outlet-specific special case
- [x] Scraping a real iDnes article URL through the existing pipeline is correctly flagged `extraction-failed` and surfaces the manual-paste field in the Review Step, rather than silently storing the consent page as the article text
- [x] `CONTEXT.md`'s "Paywall" language is broadened to "Blocked Coverage" (already reflected in the glossary as of this ticket's design session — verify it's still accurate once implemented)
