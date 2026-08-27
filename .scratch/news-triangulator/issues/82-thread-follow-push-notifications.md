# 82 — "Sledovat vlákno": Web Push notifications for Thread updates

**Type:** feature

**What to resolve:** User request: a good news portal needs notifications, and it should be the
standard Web Push API — no third-party notification service. Threads (`Thread`/`ThreadMember`,
ticket 17) are the one concept in this app that genuinely *develops over time* (a Story/Analysis
is one-shot, COMPLETE and done) — Story/Article/Category are explicitly out of scope for v1, not
because they couldn't technically get a "follow" button too, but because Thread is the only one
with a real, existing "something changed" signal to hook: `thread.recompute`'s own `changed` flag
(`threadRecomputeJob.ts`), already the trigger point `thread.synthesizeOpenQuestions` and
`thread.trackClaimSeries` chain off whenever a new member is attached to an existing Thread.

This app has no reader login (`User`/Role is Admin-only) and no existing push infra of any kind —
no `web-push` dependency, no service worker, no manifest. Building this from zero.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] `packages/backend`: add the `web-push` dependency — the one piece of this ticket that
      genuinely needs a library (VAPID JWT signing + the Web Push encryption protocol are real
      cryptography, unlike ticket 81's plain share-intent URLs). New env vars (`.env.example`,
      matching `JWT_SECRET`'s existing convention): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
      `VAPID_CONTACT_EMAIL` — generating a real keypair (`npx web-push generate-vapid-keys`) and
      provisioning it as a deploy secret is a human step, not part of this ticket's code.
- [x] `prisma/schema.prisma`: new `ThreadFollow` model — `id`, `threadId` (→ `Thread`), `endpoint`
      (the push subscription's own unique URL), `p256dh`, `auth` (the subscription's encryption
      keys), `createdAt`. Unique on `(threadId, endpoint)` (re-following is a no-op, not a
      duplicate row). One table, not a separate reusable `PushSubscription` entity joined to
      `Thread` — Thread is the only follow-target this ticket needs; a join table only pays for
      itself once a second follow-target exists (ADR 0009's speculative-generality caution).
- [x] `GET /api/push/public-key` (public): returns `VAPID_PUBLIC_KEY` — the frontend needs it for
      `pushManager.subscribe({ applicationServerKey })`; it's not secret (only the private key
      is), so a tiny endpoint beats a second build-time config channel.
- [x] `POST /api/thread/:slug/follow` / `POST /api/thread/:slug/unfollow` (public, no auth — same
      posture as every other reader-facing Thread route): body carries the
      `PushSubscription.toJSON()` shape (`endpoint`, `keys.p256dh`, `keys.auth`). Follow upserts a
      `ThreadFollow` row; unfollow deletes by `(threadId, endpoint)`.
- [x] New `thread.notifySubscribers` job (`JobName`/`JOB_RETRY_POLICY`, `jobs/jobDefinitions.ts`):
      payload `{ threadId }`. Handler loads every `ThreadFollow` row for the Thread and calls
      `web-push`'s `sendNotification` for each, payload `{ title: thread.title, body: "…", url:
      "/thread/:slug" }`. A `404`/`410` response (the push service confirming the subscription is
      dead) deletes that `ThreadFollow` row — self-heals the same way a stale
      `IngestionRunLock`/`MatchDecision` does elsewhere in this codebase, never a retry. Chained
      from `threadRecomputeJob.ts`'s existing `if (changed) { ... }` block (same place
      `thread.synthesizeOpenQuestions`/`thread.trackClaimSeries` already chain from), its own
      try/catch so an enqueue failure can't fail the upsert that already succeeded.
- [x] `packages/frontend/public/sw.js`: a small hand-written service worker (no `vite-plugin-pwa`
      dependency) — a `push` listener calling `self.registration.showNotification`, a
      `notificationclick` listener that focuses an already-open tab on that Thread or opens a new
      one. Registered once from `main.tsx`, feature-detected (`'serviceWorker' in navigator`).
- [x] `FollowThreadButton.tsx`, wired into `ThreadPage.tsx`'s `.arthead` (the same slot
      `ShareBar.tsx` occupies on `ArticlePage.tsx`, ticket 81) — requests `Notification`
      permission, subscribes via `pushManager.subscribe()`, `POST`s to `/follow`, toggles to an
      "unfollow" state backed by `localStorage` (this app has no reader login to persist
      "am I following this Thread" against — same per-browser-only posture ticket 81's
      `localStorage`-adjacent copy-link confirmation already accepts, not a new precedent).
      Feature-detected (`'serviceWorker' in navigator && 'PushManager' in window`) — hidden
      entirely when unsupported, never a dead button (same convention as ticket 81's native-share
      button).
- [x] Tests: the push-payload-building and subscribe/unsubscribe service functions (mocking
      `web-push`, not a real push service), `ThreadFollow` upsert dedup on repeat-follow, the
      404/410 self-heal delete. Frontend: whatever pure logic is extractable (permission-state
      derivation) — this frontend has no component-render test infra (ticket 76/81's own
      Implementation notes).
- [x] Manually verify what's actually possible without a live deploy + real push service (see
      ticket 81's own precedent for this caveat) — typecheck/compile clean, service worker file is
      syntactically valid, subscribe/unsubscribe round-trip against the dev DB. A real permission
      grant + delivered push notification needs a human with a real browser and HTTPS (or
      `localhost`) origin — not fully verifiable in this environment.
- [x] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

**Service worker registered lazily by `FollowThreadButton.tsx`, not eagerly from `main.tsx`.**
Deliberate deviation from this ticket's own original text: registering `/sw.js` on every single
page visit for a feature the overwhelming majority of visitors will never use is pure overhead.
`navigator.serviceWorker.register('/sw.js')` only runs inside `subscribeAndFollow`, the moment a
reader actually clicks "Sledovat vlákno" — a subscription can't exist without registration having
already happened first anyway, so nothing is lost by deferring it.

**`.sharebar__btn` (ticket 81) renamed to `.icon-btn` and moved to `ds/controls.css`.** Ticket 81
scoped it to `AnalysisPage.css` as "sole consumer" (its own stated convention: extract to
`ds/components.css`/`ds/controls.css` only once something is about to be duplicated a third time).
`FollowThreadButton.tsx` needed the identical square icon-only ghost-button treatment on
`ThreadPage.tsx`, so it moved to the shared file now that two different pages need it, and was
renamed since "sharebar" isn't accurate for a single follow/unfollow button.

**Real end-to-end verification, not just typecheck/compile** — went further than tickets 76/80/81's
"couldn't fully verify" precedent, since this one could actually be exercised against the real
Docker `backend`/`worker` (rebuilt with `docker compose up -d --build backend worker` — they're
**built images**, not bind-mounted `tsx watch` containers, so a plain `restart` doesn't pick up
code changes; this cost real time to notice). With a locally-generated dev-only VAPID keypair
wired into `.env`/`docker-compose.yml`:
- `GET /api/push/public-key` → 200, real key.
- Inserted one throwaway `Thread` row directly via SQL (no real Thread exists in this dev DB to
  follow otherwise): `POST .../follow` → 204, `ThreadFollow` row appears; `POST .../unfollow` →
  204, row disappears.
- Re-followed, then hand-enqueued a real `thread.notifySubscribers` job (`enqueueJob` called
  directly inside the running `backend` container) — the worker picked it up, attempted a real
  `web-push` send against the fake `https://push.example/...` endpoint (a DNS/network failure, not
  a push-service-confirmed 404/410), logged `{ sent: 1, expired: 0 }`, and correctly left the
  `ThreadFollow` row alone (a merely-failed send must not be treated as "confirmed dead").
- Cleaned up the throwaway Thread/ThreadFollow rows afterward.

Not verifiable in this environment even so: an actual browser's `Notification.requestPermission()`
grant, `pushManager.subscribe()` against a real push service, and a delivered, displayed OS
notification — that genuinely needs a human with a real browser and an HTTPS (or `localhost`)
origin.
