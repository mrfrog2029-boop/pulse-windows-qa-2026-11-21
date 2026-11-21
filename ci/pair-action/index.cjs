const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync } = require("node:fs");
const { lstat, mkdir, mkdtemp, readFile, realpath, rename, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { DefaultArtifactClient } = require("@actions/artifact");

const env = process.env;

class ActionError extends Error {}

function check(value, message) {
  if (!value) throw new ActionError(message);
  return value;
}

async function fingerprintFile(file, runId, role) {
  check((await lstat(file)).size <= 1024, "The identity artifact was unexpectedly large.");
  const value = JSON.parse(await readFile(file, "utf8"));
  check(Object.keys(value).sort().join(",") === "identityFingerprint,role,runId,schema" && value.schema === 1 &&
    value.role === role && value.runId === runId && /^[a-f0-9]{64}$/.test(value.identityFingerprint),
    "The identity artifact did not belong to the expected role in this workflow run.");
  return value;
}

async function main() {
  const role = env.PULSE_PAIR_ROLE;
  check(process.platform === "win32" && process.arch === "x64" && env.RUNNER_ARCH === "X64" &&
    env.GITHUB_ACTIONS === "true" && env.RUNNER_ENVIRONMENT === "github-hosted" && ["A", "B"].includes(role),
    "The role requires a disposable x64 GitHub-hosted Windows runner.");
  check(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") &&
    /^\d+$/.test(env.GITHUB_RUN_ID ?? "") && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "") &&
    /^[a-fA-F0-9]{64}$/.test(env.PULSE_QA_SHA ?? "") && /^[a-f0-9]{16}$/.test(env.PULSE_QA_BUILD ?? "") &&
    env.GITHUB_TOKEN && env.GITHUB_WORKSPACE && env.RUNNER_TEMP && env.PULSE_QA_DEPS,
    "The verified release and current workflow identity are required.");
  const other = role === "A" ? "B" : "A";
  const runId = createHash("sha256").update([
    "pulse-remote-pair", env.GITHUB_REPOSITORY, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT,
  ].join(":")).digest("hex").slice(0, 18);
  const project = await realpath(env.GITHUB_WORKSPACE);
  const temp = await realpath(env.RUNNER_TEMP);
  const exchange = await mkdtemp(join(temp, "pulse-remote-pair-" + role + "-"));
  const reports = join(project, "test-runs");
  await mkdir(reports, { recursive: true });
  const reportPath = join(reports, "remote-" + role + ".json");
  const identityPath = join(exchange, "self.json");

  const child = spawn(process.execPath, [
    join(project, "tests", "exe-remote-pair.mjs"),
    "--role", role, "--run-id", runId, "--exe", join(project, "release", "Pulse.exe"),
    "--sha256", env.PULSE_QA_SHA, "--build-id", env.PULSE_QA_BUILD, "--deps", env.PULSE_QA_DEPS,
    "--exchange-dir", exchange, "--report", reportPath, "--timeout", "90", "--exchange-timeout", "265", "--live",
  ], {
    cwd: project, windowsHide: true, stdio: "ignore",
    env: Object.fromEntries(Object.entries(env).filter(([key]) => !/TOKEN|^DEBUG$|^PWDEBUG$/i.test(key))),
  });
  let childDone = false;
  let exitCode;
  child.once("error", () => { childDone = true; });
  child.once("exit", code => { childDone = true; exitCode = code; });

  const artifactName = currentRole => "pulse-pair-identity-" + env.GITHUB_RUN_ATTEMPT + "-" + currentRole;
  let rendezvousIssue;
  try {
    const readyDeadline = Date.now() + 230_000;
    while (!existsSync(identityPath) && !childDone && Date.now() < readyDeadline) await sleep(500);
    check(existsSync(identityPath), "The native role did not publish its fingerprint.");
    const local = await fingerprintFile(identityPath, runId, role);
    const artifact = new DefaultArtifactClient();
    await artifact.uploadArtifact(artifactName(role), [identityPath], exchange, { retentionDays: 1 });
    console.log("The native role published its public fingerprint.");

    const endpoint = new URL("https://api.github.com/repos/" + env.GITHUB_REPOSITORY +
      "/actions/runs/" + env.GITHUB_RUN_ID + "/artifacts");
    endpoint.searchParams.set("name", artifactName(other));
    const deadline = Date.now() + 195_000;
    let peerId;
    if (childDone) throw new ActionError("The native role exited before its peer rendezvous.");
    while (!peerId && !childDone && Date.now() < deadline) {
      try {
        const response = await fetch(endpoint, {
          headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          const matching = (await response.json()).artifacts.filter(row => row.name === artifactName(other) &&
            !row.expired && row.size_in_bytes < 8192 && Number.isSafeInteger(row.id));
          if (matching.length === 1) peerId = matching[0].id;
        }
      } catch {}
      if (!peerId) await sleep(3500);
    }
    check(peerId, "The opposite job did not publish a public fingerprint into this workflow run.");
    const peerPath = join(exchange, "peer-artifact");
    const [repositoryOwner, repositoryName] = env.GITHUB_REPOSITORY.split("/");
    await artifact.downloadArtifact(peerId, { path: peerPath, findBy: {
      repositoryOwner, repositoryName, workflowRunId: Number(env.GITHUB_RUN_ID), token: env.GITHUB_TOKEN,
    } });
    const peer = await fingerprintFile(join(peerPath, "self.json"), runId, other);
    check(peer.identityFingerprint !== local.identityFingerprint, "The two jobs reported the same public identity.");
    const staged = join(exchange, "peer.tmp");
    await writeFile(staged, JSON.stringify(peer) + "\n", { flag: "wx" });
    await rename(staged, join(exchange, "peer.json"));
    console.log("The opposite job's public fingerprint has been handed to the running client.");
  } catch (error) {
    rendezvousIssue = error instanceof ActionError ? error.message : "The fingerprint exchange could not finish.";
    if (!childDone) await writeFile(join(exchange, "peer-unavailable"), "");
    console.error(rendezvousIssue);
  }

  const finishDeadline = Date.now() + 14 * 60_000;
  while (!childDone && Date.now() < finishDeadline) await sleep(1000);
  if (!childDone) child.kill();
  if (!existsSync(reportPath)) await writeFile(reportPath, JSON.stringify({
    schema: 1, role, runId, status: "BLOCKED",
    details: rendezvousIssue ?? "The native role did not write a completed report.",
  }) + "\n");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  check(report.role === role && report.runId === runId && /^(?:PASS|FAIL|BLOCKED)$/.test(report.status),
    "The test did not write the expected role report.");
  if (env.GITHUB_STEP_SUMMARY) await writeFile(env.GITHUB_STEP_SUMMARY,
    "## Pulse two-machine role " + role + "\n\n- Result " + report.status + "\n", { flag: "a" });
  console.log("Role " + role + " ended with " + report.status + ".");
  if (exitCode !== 0 || report.status !== "PASS") process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof ActionError ? error.message : "The remote pairing action could not finish.");
  process.exitCode = 1;
});
