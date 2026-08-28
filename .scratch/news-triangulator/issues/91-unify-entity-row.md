# 91 — Unify the entity-row treatment across Home / Article / Thread (and make the dot round)

**Type:** chore / bug

**What to resolve:** User observation (verbatim): "proc nepouzivame stejne komponenty na home page
a article detail? priklad - entity v article detail nejsou kulate". The `.erow` entity-row visual
language is copy-pasted into two page CSS files and has drifted; the entity "dot" on the Article and
Thread pages renders as a squashed ellipse instead of a circle.

**Research done before filing** (2026-08-28, confirmed against the code):

- `.ents` / `.erow` / `.erow__c` / `.erow__dot` / `.erow__n` / `.erow__k` / `.erow__t` are declared
  **twice** — once in `HomePage.css`, once in `AnalysisPage.css` — nearly identically. The
  `AnalysisPage.css` block's own comment says it's "reusing Home's `.ents`/`.erow` visual language",
  but by re-declaring, not sharing. `ThreadPage` imports both files and relies on the cascade.
- `.erow__dot` has `border-radius: 50%` in both copies but **no default width/height**. HomePage's
  `EntsPanel` supplies an explicit square size inline (`style={{ inlineSize, blockSize }}`, 26–50px
  proportional to a 24h mention count — it's a data-viz bubble showing a number). The Article
  (`EntityMentionsSection`) and Thread entity rows render a single type-initial letter with **no
  size**, so the box is content-sized (~8×14px) and `border-radius: 50%` produces a vertical
  ellipse, not a circle. HomePage also has a dot-fill-on-hover rule the others lack.
- Three separate React components render essentially the same `.erow` markup: `EntsPanel`
  (HomePage, bubble + number + trend), `EntityMentionsSection` (ArticlePage, letter badge + type +
  source count), and the equivalent block in `ThreadPage`.
- `ds/components.css`'s own header states the convention: keep classes page-scoped, extract to the
  shared file "once a class was about to be duplicated a third time". `.erow` is used by three pages
  and was never actually promoted — this is exactly the drift that rule exists to prevent.
- Separately, `/search` (`.evrow`) and the entity wiki's "Často spolu s" (`.ewco__l`) are yet more
  entity-list treatments — out of scope here (different enough: `.evrow` is also the mentioning-
  *events* row shape), but noted so a future pass knows they exist.

**Blocked by:** none.

**Status:** done

- [x] Promote `.ents` / `.erow` / `.erow__c` / `.erow__dot` / `.erow__n` / `.erow__k` / `.erow__t`
      to `ds/components.css` as one canonical definition. Remove the duplicated blocks from
      `HomePage.css` and `AnalysisPage.css` (keep page-only bits like HomePage's `.ents__note`).
- [x] `.erow__dot` gets a fixed default square size in the shared rule so it is a circle
      everywhere; HomePage's proportional bubble keeps overriding size inline (inline style wins).
      The hover-fill rule moves to the shared def too.
- [x] New shared `<EntityRow>` component (`components/EntityRow.tsx`): `to`, `badge` (a number or a
      type-initial), optional `badgeSize` (px, HomePage's bubble only), `name`, `meta` (the
      "Osoba · N zdrojů" line), optional `trailing` (HomePage's trend %). `EntsPanel`,
      `EntityMentionsSection`, and `ThreadPage`'s entity block all render through it.
- [x] `ThreadPage` keeps its `AnalysisPage.css` / `HomePage.css` imports (still needed for
      `.crumbs`/`.arthead`/`.daystats`/`.box`/… ) — only the `.erow`/`.ents` blocks move out from
      under them.
- [x] Visual check: the entity dot is a circle on Home, Article, and Thread; HomePage's
      proportional bubbles still scale.
- [x] Tests: no new component-test infra (none exists) — cover any extracted pure helper; existing
      view-model tests still pass. Typecheck + full suites. `/code-review` clean.
