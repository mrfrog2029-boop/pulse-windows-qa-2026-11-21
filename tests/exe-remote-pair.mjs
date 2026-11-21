import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { release, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const origin = "https://app.pulse.invalid";
const hex = /^[a-f0-9]{64}$/;
const friendCode = /^id-[1-9A-HJ-NP-Za-km-z]{16,24}$/;
const roomCode = /^pulse-[1-9A-HJ-NP-Za-km-z]{16,40}$/;
const identityFields = ["npub", "pub", "dhPub", "code", "nick", "name"];
const stageNames = ["Exact native executable", "Disposable signup and relay receipt", "Peer identity from the other job",
  "Exact nickname discovery", "Accepted friendship and online presence", "A hosts and B joins",
  "B hosts and A joins", "Targeted traffic"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const execute = promisify(execFile);
const opposite = role => role === "A" ? "B" : "A";
const alias = (role, runId) => ({ name: "Pulse QA " + role + " " + runId, nick: "qa_" + role.toLowerCase() + "_" + runId });

class CheckError extends Error {
  constructor(message, status = "FAIL") {
    super(message);
    this.status = status;
  }
}

function check(value, message, status) {
  if (!value) throw new CheckError(message, status);
  return value;
}

export function identityFingerprint(profile) {
  const publicIdentity = identityFields.map(field => profile?.[field]);
  check(publicIdentity.every(value => typeof value === "string" && value.length > 0),
    "The directory profile is missing public identity fields.");
  return sha(JSON.stringify(["pulse-remote-public-identity-v1", ...publicIdentity]));
}

export function peerRecord(value, runId, role, ownFingerprint) {
  const keys = value && typeof value === "object" ? Object.keys(value).sort().join(",") : "";
  check(keys === "identityFingerprint,role,runId,schema" && value.schema === 1 && value.runId === runId &&
    value.role === opposite(role) && typeof value.identityFingerprint === "string" &&
    hex.test(value.identityFingerprint) && value.identityFingerprint !== ownFingerprint,
    "Peer fingerprint does not identify the opposite role in this run.");
  return value.identityFingerprint;
}

export function machineFingerprint(runId, source, identifier) {
  const uuid = typeof identifier === "string" ? identifier.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(uuid) ||
      /^([a-f0-9])\1{31}$/.test(uuid.replaceAll("-", ""))) return null;
  return sha(JSON.stringify(["pulse-remote-vm-v2", runId, source, uuid]));
}

export function vmEvidence(a, b) {
  for (const source of ["azureVmId", "smbiosUuid"]) {
    if (hex.test(a?.[source] ?? "") && hex.test(b?.[source] ?? "")) {
      return { source, distinct: a[source] !== b[source] };
    }
  }
  return null;
}

async function inspectHostedVm(runId) {
  const data = {
    azureVmId: ["curl.exe", ["--noproxy", "*", "--max-time", "4", "--fail", "--silent", "-H", "Metadata:true",
      "http://169.254.169.254/metadata/instance/compute/vmId?api-version=2025-04-07&format=text"]],
    smbiosUuid: ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "(Get-CimInstance -ClassName Win32_ComputerSystemProduct -Property UUID -ErrorAction Stop).UUID"]],
  };
  return Object.fromEntries(await Promise.all(Object.entries(data).map(async ([source, [command, args]]) => {
    try {
      const { stdout } = await execute(command, args, { windowsHide: true, timeout: 6000, maxBuffer: 4096 });
      return [source, machineFingerprint(runId, source, stdout)];
    } catch { return [source, null]; }
  })));
}

async function waitFor(work, milliseconds, message, status = "FAIL") {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const result = await work();
    if (result) return result;
    await sleep(200);
  }
  throw new CheckError(message, status);
}

async function availablePort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}

async function writeJson(path, value) {
  const staged = path + ".tmp";
  await writeFile(staged, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  await rename(staged, path);
}

// Targeted mail can reach the authenticated counterpart or the sender's encrypted outbox.
function installGuard({ fixtureUrl }) {
  const nativeSend = WebSocket.prototype.send;
  let peer = null;
  let self = null;
  const counts = { allowed: 0, mirroredToSelf: 0, blocked: 0 };
  window.pulseRemotePairGuard = {
    pin: ({ recipient, sender }) => {
      if (peer === null) {
        peer = recipient;
        self = sender;
      }
    },
    counts: () => ({ ...counts }),
  };
  if (fixtureUrl) {
    localStorage.setItem("pulse:networkRelays", JSON.stringify([fixtureUrl]));
    const PeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends PeerConnection {
      constructor(settings) { super({ ...settings, iceServers: [], iceTransportPolicy: "relay" }); }
      setConfiguration(settings) { super.setConfiguration({ ...settings, iceServers: [], iceTransportPolicy: "relay" }); }
    };
  }
  WebSocket.prototype.send = function (payload) {
    let packet;
    if (typeof payload === "string") {
      try { packet = JSON.parse(payload); } catch {}
    }
    if (packet?.[0] === "EVENT" && packet[1]?.kind === 4454) {
      const recipients = packet[1].tags?.filter(tag => tag[0] === "p") ?? [];
      const target = recipients[0]?.[1];
      if (peer === null || packet[1].pubkey !== self || recipients.length !== 1 || (target !== peer && target !== self)) {
        counts.blocked++;
        return;
      }
      if (target === peer) counts.allowed++;
      else counts.mirroredToSelf++;
    }
    return nativeSend.call(this, payload);
  };
}

function monitorRelay(page, owner) {
  const observation = { profile: null, profileReceipts: 0, acceptedKinds: { mail: 0, room: 0 },
    relayResponses: 0, socketErrors: 0, incomingAuthors: new Set() };
  const seen = new Set();
  page.on("websocket", socket => {
    const pending = new Map();
    socket.on("socketerror", () => { observation.socketErrors++; });
    socket.on("framesent", ({ payload }) => {
      try {
        const [action, event] = JSON.parse(String(payload));
        if (action !== "EVENT" || !event?.id) return;
        if (event.kind === 30078 && event.tags?.some(tag => tag[0] === "d" && tag[1] === "pulse-profile")) {
          const profile = { ...JSON.parse(event.content), npub: event.pubkey };
          if (profile.nick === owner.nick && profile.name === owner.name && hex.test(profile.npub) && friendCode.test(profile.code)) {
            observation.profile ??= profile;
            pending.set(event.id, "profile");
          }
        } else if (event.kind === 4454 || event.kind === 29943) {
          pending.set(event.id, event.kind === 4454 ? "mail" : "room");
        }
      } catch {}
    });
    socket.on("framereceived", ({ payload }) => {
      try {
        const [action, id, accepted, reason] = JSON.parse(String(payload));
        if (action === "EOSE") observation.relayResponses++;
        if (action === "EVENT" && accepted?.kind === 4454 && observation.profile &&
            accepted.tags?.some(tag => tag[0] === "p" && tag[1] === observation.profile.npub) && !seen.has(accepted.id)) {
          seen.add(accepted.id);
          observation.incomingAuthors.add(accepted.pubkey);
        }
        if (action !== "OK" || !pending.has(id)) return;
        const category = pending.get(id);
        pending.delete(id);
        if (accepted !== true && !/^duplicate(?::|$)/i.test(reason ?? "")) return;
        if (category === "profile") observation.profileReceipts++;
        else observation.acceptedKinds[category]++;
      } catch {}
    });
  });
  return observation;
}

async function stopNative(child) {
  if (!child) return;
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin.end("stop\n");
    try {
      await waitFor(() => child.exitCode !== null || child.signalCode !== null, 10_000, "The test desktop did not stop.");
    } catch {
      child.kill();
      await waitFor(() => child.exitCode !== null || child.signalCode !== null, 5_000, "The test desktop did not stop.");
    }
  }
}

async function launch(options, scratch, report, fixture, session) {
  const source = resolve(options.exe);
  check(basename(source).toLowerCase() === "pulse.exe" && sha(await readFile(source)) === options.sha256,
    "The supplied Pulse.exe did not match the pinned SHA-256.");
  const image = join(scratch, "Pulse.exe");
  await copyFile(source, image);
  check(sha(await readFile(image)) === options.sha256, "The execution copy did not match the pinned SHA-256.");
  const data = join(scratch, "Data");
  await writeFile(join(scratch, "Pulse.ini"), "portable=1\ndata=" + data + "\ntray=0\nautostart=0\n");
  const launcher = join(scratch, "PulseDesktop.exe");
  const csc = join(process.env.WINDIR ?? "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
  execFileSync(csc, ["/nologo", "/optimize+", "/platform:x64", "/out:" + launcher, join(here, "exe-desktop.cs")],
    { windowsHide: true, stdio: "ignore", timeout: 20_000 });

  const port = await availablePort();
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:WEBVIEW2_|DEBUG$|PWDEBUG$|GH_TOKEN$|GITHUB_TOKEN$)/i.test(key)));
  const argumentsForWebView = ["--remote-debugging-port=" + port, "--remote-debugging-address=127.0.0.1",
    "--enable-automation", "--disable-background-networking", "--disable-quic", "--mute-audio",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
  if (fixture) argumentsForWebView.push("--proxy-server=" + fixture.proxy,
    "--ignore-certificate-errors-spki-list=" + fixture.pin, "--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
  environment.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = argumentsForWebView.join(" ");
  const hostedDesktop = process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_ENVIRONMENT === "github-hosted";
  const startup = report.nativeStartup = { inheritedDesktop: hostedDesktop, childStarted: false,
    webViewDataCreated: false, cdpAnswered: false, applicationPageSeen: false };
  const launchArguments = hostedDesktop ? [image, "--inherit-desktop"] : [image];
  const child = spawn(launcher, launchArguments, { cwd: scratch, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  session.child = child;
  let processStarted = false;
  let launcherFailed = false;
  child.stdout.on("data", chunk => {
    processStarted ||= /PULSE_PID=[1-9][0-9]*/.test(String(chunk));
    startup.childStarted = processStarted;
  });
  child.on("error", () => { launcherFailed = true; });
  child.stdin.on("error", () => {});

  const endpoint = "http://127.0.0.1:" + port;
  await waitFor(async () => {
    check(!launcherFailed && child.exitCode === null, "The isolated Windows desktop launcher exited.");
    startup.webViewDataCreated ||= existsSync(join(data, "WebView", "EBWebView"));
    try {
      const result = await fetch(endpoint + "/json/list", { signal: AbortSignal.timeout(750) });
      startup.cdpAnswered ||= result.ok;
      startup.applicationPageSeen ||= (await result.json()).some(target => target.type === "page" && target.url.startsWith(origin + "/"));
      return processStarted && startup.applicationPageSeen;
    } catch { return false; }
  }, hostedDesktop ? 70_000 : 25_000, "The launched native WebView2 did not expose its local target.");
  const { chromium } = createRequire(join(options.deps, "package.json"))("playwright-core");
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
  const page = await waitFor(() => browser.contexts().flatMap(context => context.pages())
    .find(candidate => candidate.url().startsWith(origin + "/")), 10_000, "The native page could not be attached.");
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1400, height: 880 });
  const cdp = await browser.newBrowserCDPSession();
  const version = await cdp.send("Browser.getVersion");
  const command = await cdp.send("Browser.getBrowserCommandLine");
  const argument = command.arguments.find(value => value.startsWith("--user-data-dir="));
  const expected = resolve(data, "WebView").toLowerCase();
  const actual = argument ? resolve(argument.slice(16)).toLowerCase() : "";
  check((actual === expected || actual.startsWith(expected + sep)) && (await lstat(join(data, "WebView"))).isDirectory(),
    "The active WebView2 did not use the disposable data directory.");
  const native = await page.evaluate(() => ({
    build: document.querySelector('meta[name="pulse-build-id"]')?.content,
    native: document.documentElement.classList.contains("native-frame") && typeof window.pulse?.info === "function",
    origin: location.origin,
  }));
  check(native.native && native.origin === origin && native.build === options["build-id"],
    "The native bridge or expected embedded build marker was unavailable.");
  report.webView = { runtime: version.product, disposableProfile: true,
    desktop: hostedDesktop ? "inherited disposable VM desktop" : "private desktop", buildId: native.build };
  session.observation = monitorRelay(page, alias(options.role, options["run-id"]));
  await page.context().addInitScript(installGuard, { fixtureUrl: fixture?.url });
  await page.reload({ waitUntil: "domcontentloaded" });
  return page;
}

const visible = (page, selector) => page.locator(selector).isVisible();
const show = (page, selector) => page.locator(selector).waitFor({ state: "visible" });
const hidden = (page, selector) => page.locator(selector).waitFor({ state: "hidden" });
const text = async (page, selector) => (await page.locator(selector).textContent())?.trim() ?? "";
const exact = (page, selector, value) => page.locator(selector).getByText(value, { exact: true });

async function click(item) {
  await item.waitFor({ state: "visible" });
  await waitFor(() => item.isEnabled(), 10_000, "The intended UI action stayed disabled.");
  await item.evaluate(button => button.click());
}

const clickIn = (page, selector) => click(page.locator(selector));

async function input(page, selector, value) {
  const field = page.locator(selector);
  await field.waitFor({ state: "visible" });
  check(await field.evaluate((element, newValue) => {
    element.value = newValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return element.value === newValue;
  }, value), "The intended UI field did not retain its test input.");
}

async function onboard(page, owner) {
  await show(page, "#ob-step1");
  check(await page.evaluate(() => !localStorage.getItem("pulse:accounts") && !localStorage.getItem("pulse:lastAccount")),
    "The disposable profile already contained accounts.");
  const password = "Pulse-QA!" + randomBytes(18).toString("hex");
  for (const [selector, value] of [["#ob-name", owner.name], ["#ob-nick", owner.nick],
    ["#ob-pw", password], ["#ob-pw2", password]]) await input(page, selector, value);
  await clickIn(page, "#ob-terms-open");
  await clickIn(page, "#terms-yes");
  await clickIn(page, "#ob-create");
  await waitFor(() => visible(page, "#ob-go"), 35_000, "The new signup UI did not reach its success step.");
  await clickIn(page, "#ob-go");
  await waitFor(async () => await text(page, "#w-name") === owner.name, 10_000,
    "The application did not open as the disposable account.");
  await hidden(page, "#onboarding");
}

async function confirmDirectory(page, peer, fingerprint, timeout) {
  return waitFor(async () => {
    const profile = await page.evaluate(async ({ nickname, fields }) => {
      const { Pool, lookupNick } = await import("/js/net.js");
      const pool = new Pool().start();
      try {
        const match = await lookupNick(pool, nickname, { requireComplete: true });
        return match && Object.fromEntries(fields.map(field => [field, match[field]]));
      }
      catch { return null; }
      finally { pool.stop(); }
    }, { nickname: peer.nick, fields: identityFields });
    if (!profile) return false;
    check(hex.test(profile.npub) && friendCode.test(profile.code) && profile.name === peer.name &&
      profile.nick === peer.nick && identityFingerprint(profile) === fingerprint,
      "The signed directory identity did not match the other job's fingerprint.");
    return profile;
  }, timeout, "The public relay did not return the opposite job's signed profile.", "BLOCKED");
}

const friendRow = (page, peer) => page.locator("#friend-list .f-item")
  .filter({ has: page.getByText(peer.name, { exact: true }) });

async function exactSearch(page, peer, timeout) {
  const row = page.locator("#search-results .sr-item").filter({ has: page.getByText(peer.name, { exact: true }) });
  const nickname = row.getByText("@" + peer.nick, { exact: true });
  await waitFor(async () => {
    await input(page, "#friend-search", "");
    await input(page, "#friend-search", "@" + peer.nick.toUpperCase());
    try {
      await nickname.waitFor({ state: "visible", timeout: 8500 });
      return true;
    } catch { return false; }
  }, timeout, "The exact nickname UI did not show the verified peer.");
  await input(page, "#friend-search", "");
}

async function makeFriends(page, role, peer, observation, timeout) {
  await page.evaluate(addresses => window.pulseRemotePairGuard.pin(addresses), {
    recipient: peer.npub, sender: observation.profile.npub,
  });
  if (role === "B") {
    const row = page.locator("#req-box .req").filter({ has: page.getByText(peer.name, { exact: true }) });
    await waitFor(async () => observation.incomingAuthors.has(peer.npub) && await row.count() === 1 && await row.isVisible(),
      timeout, "The signed peer's friend request did not arrive.");
  }
  // On the receiving side Pulse accepts the pending request for this exact verified ID.
  await clickIn(page, "#pf-add");
  await input(page, "#af-code", peer.code);
  await clickIn(page, "#af-btn");
  await waitFor(() => friendRow(page, peer).locator(".status-dot.on").isVisible(), timeout,
    "The accepted synthetic account did not show the other role as online.");
}

async function openDm(page, peer) {
  if (await visible(page, "#view-room")) await clickIn(page, "#rail-home");
  await click(friendRow(page, peer));
  await show(page, "#view-dm");
  await exact(page, "#dm-who", peer.name).waitFor({ state: "visible" });
}

async function openCurrentRoom(page) {
  if (!await visible(page, "#view-room")) await clickIn(page, "#cb-open");
  await show(page, "#view-room");
}

async function leaveRoom(page) {
  await openCurrentRoom(page);
  await clickIn(page, "#btn-leave");
  await hidden(page, "#view-room");
}

const chatText = (page, selector) => page.locator(selector).evaluateAll(bubbles => bubbles.map(bubble => {
  const message = bubble.cloneNode(true);
  message.querySelector(".meta")?.remove();
  return message.textContent.trim();
}));

const hasMessage = async (page, selector, value) => (await chatText(page, selector)).includes(value);

async function sendText(page, type, value) {
  const dm = type === "dm";
  await input(page, dm ? "#dm-input" : "#msg-input", value);
  await clickIn(page, dm ? "#dm-send" : "#send");
  const selector = (dm ? "#dm-messages" : "#messages") + " .kind-text .bubble";
  await waitFor(() => hasMessage(page, selector, value), 10_000, "The sender's message did not appear in the native UI.");
}

async function enterRoomByCode(page, code, name) {
  await clickIn(page, "#rail-add");
  await clickIn(page, '#rm-tabs [data-v="join"]');
  await input(page, "#rm-code", "Залетай в Pulse — комната «" + name + "»\nКод: " + code);
  const button = page.locator("#rm-join-btn");
  for (let attempt = 1; attempt <= 2; attempt++) {
    await click(button);
    const outcome = await waitFor(async () => {
      if (await visible(page, "#view-room")) return "joined";
      return await button.isEnabled() && await visible(page, "#room-modal") && "verification-rejected";
    }, 30_000, "The native room verification did not finish.");
    if (outcome === "joined") return attempt;
    await sleep(750);
  }
  throw new CheckError("The native client rejected the verified host's room code in two attempts.");
}

async function roomRound(page, options, roomOwner, peer, timeout, roomCodes) {
  const host = options.role === roomOwner;
  const runId = options["run-id"];
  const channel = "pulse-qa:" + runId + ":" + roomOwner + ":";
  const name = "QA " + roomOwner + " " + runId.slice(0, 8);
  let issued = false;
  let joinAttempts = 0;
  if (host) {
    await clickIn(page, "#rail-add");
    await input(page, "#rm-name", name);
    check(!await page.locator("#rm-public").isChecked(), "The test room was unexpectedly public.");
    await clickIn(page, "#rm-create-btn");
    const code = await waitFor(async () => {
      const value = await text(page, "#waiting-code");
      return await text(page, "#room-name") === name && roomCode.test(value) && !roomCodes.has(value) &&
        await visible(page, "#waiting-code") && value;
    }, timeout, "The host did not show the actual room code.");
    roomCodes.add(code);
    issued = true;
    await openDm(page, peer);
    await sendText(page, "dm", channel + "invite:" + code);
    await openCurrentRoom(page);
  } else {
    await openDm(page, peer);
    const prefix = channel + "invite:";
    const code = await waitFor(async () => (await chatText(page, "#dm-messages .kind-text:not(.mine) .bubble"))
      .filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length)).find(value => roomCode.test(value)),
    timeout, "The authenticated host's room code did not arrive in Pulse DM.", "BLOCKED");
    check(!roomCodes.has(code), "The invitation repeated a previously joined room code.");
    roomCodes.add(code);
    joinAttempts = await enterRoomByCode(page, code, name);
  }
  let roster;
  try {
    await waitFor(async () => {
      roster = { expectedName: await text(page, "#room-name") === name,
        twoPeople: await text(page, "#people-count") === "2", peerVisible: await exact(page, "#people", peer.name).isVisible() };
      return roster.expectedName && roster.twoPeople && roster.peerVisible;
    }, timeout, "The room did not show both expected participants.");
  } catch (error) {
    if (!(error instanceof CheckError) || !roster) throw error;
    throw new CheckError(error.message + " Roster criteria: " + JSON.stringify(roster));
  }
  await sendText(page, "room", channel + "room-chat:" + options.role);
  await waitFor(() => hasMessage(page, "#messages .kind-text .bubble", channel + "room-chat:" + opposite(options.role)),
    timeout, "The other role's room message was not observed.");

  // Each role confirms that it saw the roster and room message before the other leaves.
  await openDm(page, peer);
  await sendText(page, "dm", channel + "verified:" + options.role);
  await waitFor(() => hasMessage(page, "#dm-messages .kind-text:not(.mine) .bubble",
    channel + "verified:" + opposite(options.role)), timeout, "The other role's room verification did not arrive.");
  await leaveRoom(page);
  return { codeIssued: issued, codeEnteredFromPeerDm: !issued, privateRoom: true,
    locallyObservedParticipants: 2, peerRoomMessage: true, reciprocalVerification: true, joinAttempts };
}

function validateFixture(value) {
  const url = new URL(value.url);
  const proxy = new URL(value.proxy);
  check(url.protocol === "wss:" && url.hostname === "127.0.0.1" && url.port && url.pathname === "/relay" &&
    proxy.protocol === "http:" && proxy.hostname === "127.0.0.1" && proxy.port &&
    /^[A-Za-z0-9+/]{43}=$/.test(value.pin), "The test fixture must use only the loopback relay and proxy.");
  return { url: url.href, proxy: proxy.origin, pin: value.pin };
}

async function main() {
  const { values: options } = parseArgs({ options: {
    role: { type: "string" }, "run-id": { type: "string" }, exe: { type: "string" },
    sha256: { type: "string" }, "build-id": { type: "string" }, "exchange-dir": { type: "string" },
    deps: { type: "string" }, "report": { type: "string" }, live: { type: "boolean" },
    "local-fixture": { type: "string" }, timeout: { type: "string", default: "90" },
    "exchange-timeout": { type: "string", default: "220" },
  } });
  check(process.platform === "win32" && ["A", "B"].includes(options.role) && /^[a-f0-9]{16,19}$/.test(options["run-id"] ?? "") &&
    /^[a-f0-9]{16}$/.test(options["build-id"] ?? "") && /^[a-fA-F0-9]{64}$/.test(options.sha256 ?? "") &&
    options.exe && options.deps && options["exchange-dir"] && options.report && Boolean(options.live) !== Boolean(options["local-fixture"]),
    "Specify role A or B, run ID, verified EXE, build ID, deps, exchange dir, report and one relay mode.");
  options.sha256 = options.sha256.toLowerCase();
  options.deps = resolve(options.deps);
  const timeout = Number(options.timeout) * 1000;
  const exchangeTimeout = Number(options["exchange-timeout"]) * 1000;
  check(Number.isFinite(timeout) && timeout >= 15_000 && timeout <= 120_000 &&
    Number.isFinite(exchangeTimeout) && exchangeTimeout >= 15_000 && exchangeTimeout <= 300_000,
    "The stage or exchange timeout is outside its bounds.");
  const fixture = options["local-fixture"] ? validateFixture(JSON.parse(await readFile(options["local-fixture"], "utf8"))) : null;
  const owner = alias(options.role, options["run-id"]);
  const other = alias(opposite(options.role), options["run-id"]);
  const exchange = resolve(options["exchange-dir"]);
  const hosted = process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_ENVIRONMENT === "github-hosted";
  const report = { schema: 1, startedAt: new Date().toISOString(), role: options.role, runId: options["run-id"],
    mode: fixture ? "local-loopback" : "public-default-relays", executableSha256: options.sha256,
    machineIdentities: hosted ? await inspectHostedVm(options["run-id"]) : null, hosted, windowsRelease: release(),
    architecture: process.arch, checks: {} };
  let activeStage = stageNames[0];
  let scratch;
  const session = {};
  const pass = (index, details) => {
    report.checks[stageNames[index]] = { status: "PASS", ...details };
    console.log("PASS", stageNames[index]);
    activeStage = stageNames[index + 1];
  };
  try {
    await mkdir(exchange, { recursive: true });
    check(!existsSync(join(exchange, "self.json")) && !existsSync(join(exchange, "peer.json")),
      "The exchange directory already contains a prior rendezvous.");
    const temp = await realpath(tmpdir());
    scratch = await mkdtemp(join(temp, "PulseRemoteQa-" + options.role + "-"));
    const page = await launch(options, scratch, report, fixture, session);
    pass(0, { exactSha256: true, expectedBuildMarker: true });
    await onboard(page, owner);
    const observation = session.observation;
    const profile = await waitFor(() => observation.profile && observation.profileReceipts > 0 && observation.profile,
      timeout, "No public relay acknowledged the disposable profile.", "BLOCKED");
    const own = identityFingerprint(profile);
    report.identityFingerprint = own;
    pass(1, { relayAcceptedOwnProfile: true });

    await writeJson(join(exchange, "self.json"), { schema: 1, role: options.role, runId: options["run-id"], identityFingerprint: own });
    const fromPeer = join(exchange, "peer.json");
    await waitFor(() => {
      check(!existsSync(join(exchange, "peer-unavailable")), "The opposite job's identity artifact did not arrive.", "BLOCKED");
      return existsSync(fromPeer);
    }, exchangeTimeout, "The opposite job's identity artifact did not arrive.", "BLOCKED");
    check((await lstat(fromPeer)).size <= 1024, "The peer fingerprint file was unexpectedly large.");
    const fingerprint = peerRecord(JSON.parse(await readFile(fromPeer, "utf8")), options["run-id"], options.role, own);
    const peer = await confirmDirectory(page, other, fingerprint, timeout);
    report.peerIdentityFingerprint = fingerprint;
    pass(2, { signedDirectoryIdentityMatched: true });

    await exactSearch(page, peer, timeout);
    pass(3, { exactNicknameShownByClient: true });
    await makeFriends(page, options.role, peer, observation, timeout);
    pass(4, { locallyObservedOnline: true });
    const roomCodes = new Set();
    pass(5, await roomRound(page, options, "A", peer, timeout, roomCodes));
    pass(6, await roomRound(page, options, "B", peer, timeout, roomCodes));
    const mail = await page.evaluate(() => window.pulseRemotePairGuard.counts());
    check(mail.blocked === 0 && mail.allowed > 0, "The test observed an unverified recipient or did not send encrypted relay mail.");
    pass(7, { targetedFramesToVerifiedPeer: mail.allowed, encryptedCopiesToOwnAccount: mail.mirroredToSelf,
      blockedRecipients: mail.blocked });
  } catch (error) {
    const status = error instanceof CheckError ? error.status : "FAIL";
    const details = error instanceof CheckError ? error.message : "The intended action did not finish through the native UI.";
    const scriptLine = Number(error.stack?.match(/exe-remote-pair\.mjs:(\d+):\d+/)?.[1]) || undefined;
    report.checks[activeStage ?? "Harness"] = { status, details, scriptLine };
    console.log(status, activeStage ?? "Harness", details);
  } finally {
    try {
      await stopNative(session.child);
      if (scratch) {
        const actual = await realpath(scratch);
        const temp = await realpath(tmpdir());
        check(dirname(actual).toLowerCase() === temp.toLowerCase() && basename(actual).startsWith("PulseRemoteQa-"),
          "The disposable test root moved.");
        await rm(actual, { recursive: true, force: true, maxRetries: 8, retryDelay: 140 });
      }
      report.disposableProfileRemoved = Boolean(scratch);
    } catch {
      report.disposableProfileRemoved = false;
      report.checks["Disposable profile removal"] = { status: "FAIL", details: "The isolated temporary profile could not be removed." };
    }
    for (const stage of stageNames) report.checks[stage] ??= { status: "BLOCKED", details: "A prerequisite stage did not complete." };
    const observation = session.observation;
    if (observation) report.relay = { ownProfileReceipts: observation.profileReceipts, eose: observation.relayResponses,
      socketErrors: observation.socketErrors, acceptedTargetedMail: observation.acceptedKinds.mail,
      acceptedRoomEvents: observation.acceptedKinds.room };
    report.finishedAt = new Date().toISOString();
    report.status = Object.values(report.checks).some(check => check.status === "FAIL") ? "FAIL" :
      Object.values(report.checks).some(check => check.status === "BLOCKED") ? "BLOCKED" : "PASS";
    await mkdir(dirname(resolve(options.report)), { recursive: true });
    await writeJson(resolve(options.report), report);
    if (report.status !== "PASS") process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof CheckError ? error.message : "The remote acceptance harness could not run.");
    process.exitCode = 1;
  });
}
