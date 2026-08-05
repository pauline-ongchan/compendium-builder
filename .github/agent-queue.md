# Agent issue queue

The queue uses issue labels for state and issue comments for serialized commands. GitHub processes one queue command at a time, so two agents cannot successfully take the same lane or issue concurrently.

## Prepare a ticket

1. Create a bug or enhancement with clear acceptance criteria.
2. Resolve any product questions first.
3. A repository collaborator comments `/agent ready` when the ticket is safe to implement.

Adding `agent:ready` manually is also supported, but the command leaves an audit comment.

## Agent commands

Commands must be the first line of a new issue comment and require repository write access.

| Command | Result |
| --- | --- |
| `/agent claim` | Claims the issue in the first free lane. |
| `/agent claim lane-a` | Claims a specific free lane (`lane-a` or `lane-b`). |
| `/agent release` | Releases the issue back to the ready queue. |
| `/agent needs-input <reason>` | Pauses work until a human answers a question. |
| `/agent block <reason>` | Marks an external or technical blocker. |
| `/agent ready` | Returns a resolved, non-question ticket to the ready queue. |

Claims are rejected when the issue is not ready, a requested lane is occupied, or two automation-created pull requests are already open for review.

## Work and review

After a successful claim, the bot records the required branch name. The agent then:

1. Fetches the latest `origin/main`.
2. Creates that branch in an isolated worktree.
3. Implements and verifies only the claimed ticket.
4. Opens a draft PR with `Closes #<number>` and `agent:automated-pr`.
5. Stops for human review; the agent never merges or deploys.

The linked issue stays in progress until its PR is merged. GitHub closes it automatically through the `Closes` reference.
