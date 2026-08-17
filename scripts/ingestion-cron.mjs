#!/usr/bin/env node
// Opt-in local Ingestion poller (ticket 28) — mirrors docker-compose.yml's `ingestion-cron`
// sidecar exactly (same endpoint, same header, same interval), but as its own script rather
// than part of `npm run dev`, since every poll can spend real OpenAI money (embedding calls
// per ADR 0018, plus whatever an admin approves downstream). Run it deliberately, in its own
// terminal, only when you actually want Ingestion running locally.

const DEFAULT_POLL_INTERVAL_MS = 20 * 60 * 1000

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const INGESTION_SECRET = process.env.INGESTION_SECRET

const rawInterval = process.env.INGESTION_POLL_INTERVAL_MS
const parsedInterval = rawInterval === undefined ? DEFAULT_POLL_INTERVAL_MS : Number(rawInterval)
if (!Number.isFinite(parsedInterval) || parsedInterval <= 0) {
  console.warn(
    `[ingestion-cron] INGESTION_POLL_INTERVAL_MS=${JSON.stringify(rawInterval)} is not a positive number — ` +
      `falling back to the default ${DEFAULT_POLL_INTERVAL_MS}ms rather than polling in a tight loop.`
  )
}
const POLL_INTERVAL_MS =
  Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : DEFAULT_POLL_INTERVAL_MS

if (!INGESTION_SECRET) {
  console.warn(
    'INGESTION_SECRET is not set — POST /api/ingestion/run always rejects without it. ' +
      'Set it in your .env (see .env.example) and re-run. Exiting without polling.'
  )
  process.exit(0)
}

async function pollOnce() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/ingestion/run`, {
      method: 'POST',
      headers: { 'x-ingestion-secret': INGESTION_SECRET },
    })
    const body = await response.text()
    if (!response.ok) {
      console.warn(`[ingestion-cron] ${response.status} ${response.statusText}: ${body}`)
      return
    }
    console.log(`[ingestion-cron] ${new Date().toISOString()} ${body}`)
  } catch (err) {
    console.warn(`[ingestion-cron] request failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

console.log(
  `[ingestion-cron] polling ${BACKEND_URL}/api/ingestion/run every ${Math.round(POLL_INTERVAL_MS / 1000)}s — Ctrl+C to stop`
)

while (true) {
  await pollOnce()
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
}
