const STATE_LABELS = [
  "agent:ready",
  "agent:in-progress",
  "agent:needs-input",
  "agent:blocked",
];
const LANE_LABELS = ["agent:lane-a", "agent:lane-b"];
const WRITE_PERMISSIONS = new Set(["admin", "maintain", "write"]);

function parseCommand(body) {
  const firstLine = body.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  const parts = firstLine.split(/\s+/);
  if (parts[0]?.toLowerCase() !== "/agent" || parts.length < 2) return null;

  const operation = parts[1].toLowerCase();
  if (!["claim", "release", "ready", "needs-input", "block"].includes(operation)) {
    return null;
  }

  return { operation, args: parts.slice(2) };
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "") || "work";
}

function labelNames(issue) {
  return new Set(issue.labels.map((label) => typeof label === "string" ? label : label.name));
}

async function run({ github, context, core }) {
  const command = parseCommand(context.payload.comment.body);
  if (!command) return;

  const { owner, repo } = context.repo;
  const issueNumber = context.payload.issue.number;
  const actor = context.actor;

  const comment = async (body) => github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });

  const fail = async (message) => {
    await comment(`Queue command rejected: ${message}`);
    core.setFailed(message);
  };

  let permission = "none";
  try {
    const response = await github.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username: actor,
    });
    permission = response.data.permission;
  } catch (error) {
    core.info(`Could not resolve permission for ${actor}: ${error.message}`);
  }

  if (!WRITE_PERMISSIONS.has(permission)) {
    await fail(`@${actor} needs write access to manage the agent queue.`);
    return;
  }

  const issueResponse = await github.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  const issue = issueResponse.data;
  const labels = labelNames(issue);

  const removeLabels = async (names) => {
    for (const name of names) {
      if (!labels.has(name)) continue;
      await github.rest.issues.removeLabel({ owner, repo, issue_number: issueNumber, name });
      labels.delete(name);
    }
  };

  const addLabels = async (names) => {
    const missing = names.filter((name) => !labels.has(name));
    if (!missing.length) return;
    await github.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: missing });
    missing.forEach((name) => labels.add(name));
  };

  if (issue.state !== "open") {
    await fail("the issue must be open.");
    return;
  }

  if (command.operation === "claim") {
    if (!labels.has("agent:ready")) {
      await fail("the issue does not have `agent:ready`.");
      return;
    }
    const blocker = ["question", "agent:needs-input", "agent:blocked"].find((label) => labels.has(label));
    if (blocker) {
      await fail(`remove the blocking \`${blocker}\` label before claiming.`);
      return;
    }

    const openPulls = await github.paginate(github.rest.pulls.list, {
      owner,
      repo,
      state: "open",
      per_page: 100,
    });
    const automatedPulls = openPulls.filter((pull) =>
      pull.labels.some((label) => label.name === "agent:automated-pr"),
    );
    if (automatedPulls.length >= 2) {
      await fail("two automation-created pull requests are already awaiting review.");
      return;
    }

    const requestedLane = command.args[0]?.toLowerCase();
    if (requestedLane && !LANE_LABELS.includes(`agent:${requestedLane}`)) {
      await fail("the optional lane must be `lane-a` or `lane-b`.");
      return;
    }

    const occupiedLanes = new Set();
    for (const lane of LANE_LABELS) {
      const activeIssues = await github.paginate(github.rest.issues.listForRepo, {
        owner,
        repo,
        state: "open",
        labels: `agent:in-progress,${lane}`,
        per_page: 100,
      });
      if (activeIssues.some((activeIssue) => !activeIssue.pull_request && activeIssue.number !== issueNumber)) {
        occupiedLanes.add(lane);
      }
    }

    const lane = requestedLane ? `agent:${requestedLane}` : LANE_LABELS.find((candidate) => !occupiedLanes.has(candidate));
    if (!lane || occupiedLanes.has(lane)) {
      await fail("both agent lanes are occupied; finish or release an issue first.");
      return;
    }

    await removeLabels([...STATE_LABELS, ...LANE_LABELS]);
    await addLabels(["agent:in-progress", lane]);
    const branch = `codex/issue-${issueNumber}-${slugify(issue.title)}`;
    await comment([
      `Claimed by @${actor} in \`${lane.replace("agent:", "")}\`.`,
      "",
      `Intended branch: \`${branch}\``,
      "",
      "Create an isolated worktree from the latest `origin/main`. Open a draft PR and leave merge and deployment to a human reviewer.",
    ].join("\n"));
    return;
  }

  if (command.operation === "release") {
    if (labels.has("question") || labels.has("agent:needs-input") || labels.has("agent:blocked")) {
      await fail("blocked or question issues cannot return to ready until the blocker is resolved.");
      return;
    }
    await removeLabels([...STATE_LABELS, ...LANE_LABELS]);
    await addLabels(["agent:ready"]);
    await comment(`Released by @${actor}; this issue is back in the ready queue.`);
    return;
  }

  if (command.operation === "ready") {
    if (labels.has("question")) {
      await fail("resolve the question and remove the `question` label before marking it ready.");
      return;
    }
    await removeLabels([...STATE_LABELS, ...LANE_LABELS]);
    await addLabels(["agent:ready"]);
    await comment(`Marked ready by @${actor}. An agent may now claim this issue.`);
    return;
  }

  const reason = command.args.join(" ").trim();
  if (!reason) {
    await fail(`\`/agent ${command.operation}\` requires a short reason on the same line.`);
    return;
  }

  const nextLabel = command.operation === "needs-input" ? "agent:needs-input" : "agent:blocked";
  await removeLabels([...STATE_LABELS, ...LANE_LABELS]);
  await addLabels([nextLabel]);
  await comment(`Paused by @${actor}: ${reason}`);
}

module.exports = Object.assign(run, { parseCommand, slugify });
