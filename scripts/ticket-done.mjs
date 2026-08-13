#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ISSUES_DIR = path.resolve(import.meta.dirname, '../.scratch/news-triangulator/issues')

function main() {
  const raw = process.argv[2]
  if (!raw) {
    console.error('Usage: mise run ticket-done <NN>')
    process.exit(1)
  }
  const padded = raw.padStart(2, '0')

  const files = readdirSync(ISSUES_DIR)
  const file = files.find((f) => f.startsWith(`${padded}-`))
  if (!file) {
    console.error(`No ticket file found for ticket ${padded} in ${ISSUES_DIR}`)
    process.exit(1)
  }
  const filePath = path.join(ISSUES_DIR, file)
  const slug = file.replace(/^\d+-/, '').replace(/\.md$/, '')

  const currentBranch = execSync('git branch --show-current').toString().trim()
  const expectedBranch = `ticket/${padded}-${slug}`
  if (currentBranch !== expectedBranch) {
    console.error(
      `Current branch is "${currentBranch}", expected "${expectedBranch}". ` +
        `Check out the ticket's branch before finishing it.`
    )
    process.exit(1)
  }

  const content = readFileSync(filePath, 'utf8')
  const remaining = (content.match(/^- \[ \]/gm) ?? []).length
  if (remaining > 0) {
    console.error(
      `Ticket ${padded} still has ${remaining} unchecked acceptance criteri${remaining === 1 ? 'on' : 'a'}. ` +
        `Check them off before finishing.`
    )
    process.exit(1)
  }

  if (!/\*\*Status:\*\*\s*done/.test(content)) {
    writeFileSync(filePath, content.replace(/\*\*Status:\*\*\s*\S+/, '**Status:** done'))
    console.log(`Marked ticket ${padded} as done.`)
  }

  const relPath = path.relative(process.cwd(), filePath)
  const pending = execSync(`git status --porcelain -- ${relPath}`).toString().trim()
  if (pending) {
    execSync(`git add ${relPath}`, { stdio: 'inherit' })
    execSync(`git commit -m "chore: mark ticket ${padded} done"`, { stdio: 'inherit' })
  }

  execSync(`git push -u origin ${currentBranch}`, { stdio: 'inherit' })

  const remoteUrl = execSync('git remote get-url origin').toString().trim()
  const ownerRepo = remoteUrl.match(/github\.com[:/](.+?)(\.git)?$/)?.[1]

  if (ownerRepo) {
    console.log(`\nOpen a PR: https://github.com/${ownerRepo}/compare/${currentBranch}?expand=1\n`)
  } else {
    console.log('\nPush completed; could not determine the GitHub owner/repo from the remote URL.')
  }
}

main()
