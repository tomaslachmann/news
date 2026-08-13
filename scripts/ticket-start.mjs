#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ISSUES_DIR = path.resolve(import.meta.dirname, '../.scratch/news-triangulator/issues')

function readTicket(paddedNumber) {
  const files = readdirSync(ISSUES_DIR)
  const file = files.find((f) => f.startsWith(`${paddedNumber}-`))
  if (!file) {
    console.error(`No ticket file found for ticket ${paddedNumber} in ${ISSUES_DIR}`)
    process.exit(1)
  }

  const content = readFileSync(path.join(ISSUES_DIR, file), 'utf8')
  const slug = file.replace(/^\d+-/, '').replace(/\.md$/, '')
  const status = content.match(/\*\*Status:\*\*\s*(\S+)/)?.[1] ?? 'unknown'
  const blockedByLine = content.match(/\*\*Blocked by:\*\*\s*(.+)/)?.[1] ?? ''
  const blockedBy = [...blockedByLine.matchAll(/\b(\d{2,})\b/g)].map((m) => m[1])

  return { file, slug, status, blockedBy }
}

function main() {
  const raw = process.argv[2]
  if (!raw) {
    console.error('Usage: mise run ticket-start <NN>')
    process.exit(1)
  }
  const padded = raw.padStart(2, '0')

  const ticket = readTicket(padded)

  for (const blockerNumber of ticket.blockedBy) {
    const blockerPadded = blockerNumber.padStart(2, '0')
    const blocker = readTicket(blockerPadded)
    if (blocker.status !== 'done') {
      console.error(
        `Ticket ${padded} is blocked by ticket ${blockerPadded} (${blocker.slug}), which is not ` +
          `done yet (status: ${blocker.status}).`
      )
      process.exit(1)
    }
  }

  console.log('Checking out main and pulling latest...')
  execSync('git checkout main', { stdio: 'inherit' })
  execSync('git pull origin main', { stdio: 'inherit' })

  const status = execSync('git status --porcelain').toString().trim()
  if (status) {
    console.error('Working tree is not clean. Commit or stash changes before starting a new ticket.')
    process.exit(1)
  }

  const branchName = `ticket/${padded}-${ticket.slug}`
  console.log(`Creating branch ${branchName}...`)
  execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' })

  console.log(`\nReady to work on ticket ${padded} — ${ticket.slug}`)
}

main()
