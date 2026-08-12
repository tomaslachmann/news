# 04 — Review Step & Content Extraction

**What to build:** The `/review` page shows the candidate Coverage list. The user can deselect articles that cover a different story, paste additional article URLs, and provide manual text for paywalled sources. When the user confirms the selection, the backend fetches and Readability-parses each confirmed Coverage URL, stores the extracted text (or sets `extraction-failed`), and signals readiness for analysis. The frontend advances to the `/analysis/:id` loading state.

**Blocked by:** 03 — Discovery: GDELT + RSS. (Auth guard inherited via chain to 10.)

**Status:** ready-for-agent

- [ ] Each candidate on `/review` has a checkbox; unchecking it excludes that Coverage from analysis
- [ ] A text field allows the user to paste one or more additional article URLs; each is added to the candidate list with a checkbox pre-checked
- [ ] Confirming with fewer than 5 Coverages checked shows a non-blocking warning banner ("triangulation may be limited with fewer than 5 sources") but does not prevent proceeding
- [ ] `PATCH /api/analyses/:id/coverages` is guarded by the `requireAdmin` middleware
- [ ] Confirming the selection calls `PATCH /api/analyses/:id/coverages` with the list of confirmed Coverage IDs and any custom URLs
- [ ] The backend fetches each confirmed Coverage URL via plain HTTP fetch and runs Mozilla Readability to extract the article body
- [ ] Successfully extracted text is stored in `Coverage.extractedText`; `Coverage.status` is set to `"ok"`
- [ ] Coverages that return empty body, a login wall, or a non-200 response have `Coverage.status` set to `"extraction-failed"`
- [ ] After confirmation, the `/review` page re-renders to show the extraction status of each Coverage: `"ok"` sources show a success badge; `"extraction-failed"` sources show a "could not extract" badge with a text area for manual paste
- [ ] Pasting text into the manual text area and re-confirming stores the pasted text in `Coverage.extractedText` and sets `status: "ok"`
- [ ] After all extractions are settled, the frontend navigates to `/analysis/:id`
- [ ] `PATCH /api/analyses/:id/coverages` request and response shapes match the types in `packages/shared`
