# Git Workflow for Implementing Agents

Every ticket is implemented on its own branch. Follow these steps exactly.

## Before you start

Confirm you are on `main` and it is clean:

```
git checkout main
git pull origin main
git status   # must be clean
```

## Starting a ticket

Create and switch to the ticket branch:

```
git checkout -b ticket/NN-slug
```

Where `NN` is the zero-padded ticket number and `slug` is a short kebab-case description matching the ticket title. Examples:
- `ticket/10-authentication-authorization`
- `ticket/05-prompt-engineering`

## During implementation

Commit early and often. Each commit should be atomic and have a descriptive message. There is no strict format requirement, but the message should explain *what* changed and *why* if non-obvious.

Check off each acceptance criterion in the ticket file (`.scratch/news-triangulator/issues/NN-slug.md`) as you complete it — change `- [ ]` to `- [x]`.

## Finishing a ticket

1. Ensure all acceptance criteria are checked off.
2. Change `**Status:** ready-for-agent` to `**Status:** done` in the ticket file.
3. Commit the ticket file update:
   ```
   git add .scratch/news-triangulator/issues/NN-slug.md
   git commit -m "chore: mark ticket NN done"
   ```
4. Push the branch:
   ```
   git push -u origin ticket/NN-slug
   ```
5. Output the PR compare URL for the developer to open:
   ```
   https://github.com/OWNER/REPO/compare/ticket/NN-slug?expand=1
   ```
   Replace `OWNER/REPO` by reading the remote: `git remote get-url origin`.

## What NOT to do

- Do not merge into `main` yourself.
- Do not push directly to `main`.
- Do not delete the branch — leave it for the developer to merge via the PR.
- Do not open a new ticket branch without first confirming its blockers are all `done`.
