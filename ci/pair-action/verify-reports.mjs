import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { vmEvidence } from "../../tests/exe-remote-pair.mjs";

const root = process.argv[2] ?? "pair-evidence";
const attempt = process.env.GITHUB_RUN_ATTEMPT;

async function readRole(role) {
  try {
    const path = join(root, "pulse-pair-result-" + attempt + "-" + role, "remote-" + role + ".json");
    const result = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
    if (result.role === role && ["PASS", "FAIL", "BLOCKED"].includes(result.status)) return result;
  } catch {}
  return { status: "BLOCKED" };
}

const [a, b] = await Promise.all(["A", "B"].map(readRole));
const sameBuildAndPeer = Boolean(a.runId && a.runId === b.runId && a.hosted && b.hosted &&
  a.architecture === "x64" && b.architecture === "x64" && a.executableSha256 && a.executableSha256 === b.executableSha256 &&
  a.webView?.buildId && a.webView.buildId === b.webView?.buildId && a.identityFingerprint && b.identityFingerprint &&
  a.identityFingerprint !== b.identityFingerprint && a.identityFingerprint === b.peerIdentityFingerprint &&
  b.identityFingerprint === a.peerIdentityFingerprint);
const machines = vmEvidence(a.machineIdentities, b.machineIdentities);
const hostStatus = machines ? (machines.distinct ? "PASS" : "FAIL") : "BLOCKED";
const roleStatuses = [a.status, b.status];
const rolesPassed = roleStatuses.every(status => status === "PASS");
const status = rolesPassed ? (sameBuildAndPeer ? hostStatus : "FAIL") :
  (roleStatuses.includes("FAIL") ? "FAIL" : "BLOCKED");
const evidence = [
  "## Pulse across distinct Windows VMs", "",
  "- Overall " + status, "- Role A " + a.status, "- Role B " + b.status,
  "- Exact build and reciprocal synthetic identities " + (sameBuildAndPeer ? "PASS" : "BLOCKED"),
  "- Distinct VM identities " + hostStatus + (machines ? " (" + machines.source + ")" : ""), "",
];
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, evidence.join("\n"));
console.log(evidence.join("\n"));
if (status !== "PASS") process.exitCode = 1;
