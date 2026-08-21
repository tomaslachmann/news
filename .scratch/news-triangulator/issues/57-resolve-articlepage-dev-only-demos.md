# 57 — Resolve ArticlePage DEV-only demo sections

**What to build:** `ArticlePage.tsx` still renders two ad hoc DEV-only sample sections from
`AnalysisPage.devDemos.tsx`: wording comparison and value variants. Unlike `/styleguide`, these are
page-level fake content, not the retained design-system reference. Resolve that debt explicitly:
either back them with real synthesis data or remove them.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] Decide whether each DEV-only section in `AnalysisPage.devDemos.tsx` has a real product future
      on `ArticlePage` or should be removed outright.
- [ ] If a section is kept, define the exact real data shape it needs from the current narrative /
      synthesis model and implement that path honestly rather than through hardcoded sample text.
- [ ] If a section cannot be backed by current real data without inventing a fake intermediary,
      remove it rather than leaving ad hoc demo content attached to `ArticlePage`.
- [ ] Keep `/styleguide` explicitly out of scope; this ticket is about ad hoc page demos, not the
      dev-only design-system reference route.

## Notes

Filed from ticket 54's grilling session on 2026-08-21. The user explicitly chose to keep
`/styleguide` but treat the two `ArticlePage` DEV demos as separate debt rather than letting them
linger by analogy with the styleguide. This ticket exists so that choice is captured as its own
follow-up rather than getting lost inside the homepage real-data work.
