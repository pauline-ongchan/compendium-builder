# Repository workflow

These instructions apply to the entire repository.

## Issue queue

- Implement an issue only when it has the `agent:ready` label.
- Claim work before editing by commenting `/agent claim` on the issue. The queue workflow atomically replaces `agent:ready` with `agent:in-progress`, assigns `agent:lane-a` or `agent:lane-b`, and records the intended branch.
- Do not edit until the queue workflow confirms the claim. Never apply queue labels directly when claiming or releasing work.
- Do not implement issues labeled `question`, `agent:needs-input`, or `agent:blocked`.
- If requirements or acceptance criteria are ambiguous, comment `/agent needs-input <reason>` and stop.
- If an external or technical blocker prevents progress, comment `/agent block <reason>` and stop.
- Use `/agent release` only when abandoning otherwise ready work; do not release blocked work back into the queue.
- Prefer one issue per branch and pull request. Group issues only when they share one root cause and cannot be reviewed or reverted cleanly on their own.
- Keep no more than two automation-created pull requests open for human review at once.
- See `.github/agent-queue.md` for the reviewer and agent command reference.

## Branch and worktree safety

- Start from the latest `origin/main` in an isolated Git worktree.
- Use branches named `codex/issue-<number>-<short-description>` or `codex/issues-<numbers>-<short-description>`.
- Never place automated issue work in a checkout containing unrelated or unfinished changes.
- Never push directly to `main`, force-push shared branches, merge a pull request, or deploy to production.

## Implementation

- Make the smallest complete change that satisfies the issue acceptance criteria.
- Preserve existing behavior outside the issue scope.
- Add or update regression tests for behavior changes.
- Keep schema and migration changes isolated from unrelated tickets.
- Do not expose credentials, tokens, private data, or environment values in source, logs, commits, or pull requests.

## Verification

- Run `npm run lint`.
- Run `npm test`, which includes the production build.
- Browser-test user-facing changes and exercise the affected workflow, including relevant error and empty states.
- If a required check cannot run, document the exact reason and do not claim it passed.

## Pull requests

- Commit only files that belong to the claimed issue.
- Open a draft pull request and add the `agent:automated-pr` label.
- Link every included issue with `Closes #<number>`.
- Include a plain-language summary, validation evidence, manual review steps, screenshots for visible UI changes, known risks, and rollback instructions.
- Address actionable review feedback on an existing automation-created pull request before claiming another issue.
- Leave final approval, merge, deployment, and production verification to the human reviewer.
