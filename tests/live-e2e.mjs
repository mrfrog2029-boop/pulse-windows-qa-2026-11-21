import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    live: { type: "boolean" },
    root: { type: "string" },
    deps: { type: "string" },
    browser: { type: "string" },
    add: { type: "string", default: "id" },
    sender: { type: "string", default: "alice" },
    join: { type: "string", default: "both" },
    seconds: { type: "string", default: "40" },
    "no-direct": { type: "boolean", default: false },
    "turn-only": { type: "boolean", default: false },
    "all-transports": { type: "boolean", default: false },
  },
});
assert(options.live, "Pass --live to create disposable test accounts on the configured public relays.");
assert(["id", "nick"].includes(options.add), "Use --add id or nick.");
assert(["alice", "bob"].includes(options.sender), "Use --sender alice or bob.");
assert(["code", "invite", "both"].includes(options.join), "Use --join code, invite, or both.");
assert(["no-direct", "turn-only", "all-transports"].filter((flag) => options[flag]).length <= 1,
  "Select one transport override.");
const timeout = Number(options.seconds) * 1000;
assert(Number.isFinite(timeout) && timeout >= 10000, "Use --seconds at least 10.");

const tests = dirname(fileURLToPath(import.meta.url));
const root = resolve(options.root ?? join(tests, "..", "web"));
const deps = resolve(options.deps ?? process.env.PULSE_E2E_DEPS ?? tests);
const { chromium } = createRequire(join(deps, "package.json"))("playwright-core");
const browserPath = options.browser ?? [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find(existsSync);
const idPattern = /id-[1-9A-HJ-NP-Za-km-z]{16,24}/;
const roomPattern = /^pulse-[1-9A-HJ-NP-Za-km-z]{16,40}$/;
const roomCodeInWire = /pulse-[1-9A-HJ-NP-Za-km-z]{16,40}/;
const startedAt = Date.now();
const runId = randomBytes(5).toString("hex");
const modes = options["all-transports"] ? ["standard", "no-direct", "turn-only"]
  : [options["no-direct"] ? "no-direct" : options["turn-only"] ? "turn-only" : "standard"];
const password = "Pulse-QA-" + randomBytes(16).toString("hex") + "!";
const accounts = [
  { name: "Pulse QA Alice " + runId, nick: "pulseqa_a_" + runId },
  { name: "Pulse QA Bob " + runId, nick: "pulseqa_b_" + runId },
];
const types = new Map(Object.entries({
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".woff2": "font/woff2",
}));

async function serveAssets() {
  await readFile(join(root, "index.html"));
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const file = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types.get(extname(file)) ?? "application/octet-stream",
        "Cache-Control": "no-store",
      }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  return server;
}

function count(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function eventTag(event, name) {
  return event.tags?.find((tag) => tag[0] === name)?.[1] ?? "";
}

function eventType(event) {
  if (event.kind === 30078) {
    const address = eventTag(event, "d");
    return address.startsWith("pulse-contact:") ? "pulse-contact" : address || eventTag(event, "t") || "app";
  }
  if (event.kind === 4454) return "encrypted-mail";
  if (event.kind >= 20000 && event.kind < 30000) return "ephemeral-signaling";
  return String(event.kind);
}

function filterType(filter) {
  if (filter.kinds?.includes(4454)) return "encrypted-mail";
  if (filter.kinds?.some((kind) => kind >= 20000 && kind < 30000)) return "ephemeral-signaling";
  if (filter["#n"]?.length) return (filter["#t"] ?? ["nickname"]).join("+") + " exact";
  if (filter["#i"]?.length) return "ID exact";
  if (filter["#d"]?.some((address) => address.startsWith("pulse-contact:"))) return "contact ID exact";
  return (filter["#t"] ?? filter["#d"] ?? filter.kinds ?? ["other"]).join("+");
}

const ownAuthors = new Set();
const ownNicks = new Set(accounts.map((account) => account.nick));
const peerMailTargets = new Set();
const privateWireExposures = new Set();
const roomMessage = (sender, method) => sender.name + " message by " + method;
const roomName = (method, mode) => "QA " + mode + " " + method + " " + runId;
const privateMessages = accounts.flatMap((sender) => ["invite", "code"].map((method) => roomMessage(sender, method)));
const privateLabels = modes.flatMap((mode) => ["invite", "code"].map((method) => roomName(method, mode)));

function traceAt(peer, endpoint) {
  if (!peer.relays.has(endpoint)) {
    peer.relays.set(endpoint, {
      connections: 0, closed: 0, sends: new Map(), receivedOwn: new Map(),
      queries: new Map(), ends: new Map(), ack: new Map(), reasons: new Map(), errors: new Map(),
      handshake: {}, firstSignaling: null,
    });
  }
  return peer.relays.get(endpoint);
}

function milestone(peer, type, endpoint, detail) {
  const key = JSON.stringify([type, endpoint, detail]);
  if (peer.milestones.has(key)) return;
  peer.milestones.set(key, { ms: Date.now() - startedAt, type, endpoint, detail });
}

async function watchHandshake(context, page, peer) {
  const cdp = await context.newCDPSession(page);
  const sockets = new Map();
  cdp.on("Network.webSocketCreated", ({ requestId, url }) => {
    sockets.set(requestId, { endpoint: new URL(url).hostname });
  });
  cdp.on("Network.webSocketWillSendHandshakeRequest", (message) => {
    const started = sockets.get(message.requestId);
    if (started) Object.assign(started, { wall: message.wallTime, monotonic: message.timestamp });
  });
  cdp.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response, timestamp }) => {
    const started = sockets.get(requestId);
    if (!started) return;
    const trace = traceAt(peer, started.endpoint);
    const date = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "date")?.[1];
    const server = Date.parse(date);
    const midpoint = started.wall * 1000 + (timestamp - started.monotonic) * 500;
    trace.handshake = {
      status: response.status,
      ...(Number.isFinite(server) && Number.isFinite(midpoint) && {
        serverDate: new Date(server).toISOString(), serverAheadMs: Math.round(server - midpoint),
      }),
    };
  });
  await cdp.send("Network.enable");
}

function watchRelays(page, peer) {
  page.on("websocket", (socket) => {
    const endpoint = new URL(socket.url()).hostname;
    const trace = traceAt(peer, endpoint);
    trace.connections++;
    const publications = new Map();
    const subscriptions = new Map();
    const unpack = (frame) => {
      try {
        const message = JSON.parse(String(frame.payload));
        return Array.isArray(message) ? message : [];
      } catch {
        return [];
      }
    };
    socket.on("framesent", (frame) => {
      const [method, first, ...filters] = unpack(frame);
      const serialized = String(frame.payload);
      if (roomCodeInWire.test(serialized)) privateWireExposures.add("room code at " + endpoint);
      if (privateMessages.some((message) => serialized.includes(message))) privateWireExposures.add("room chat at " + endpoint);
      if (privateLabels.some((label) => serialized.includes(label))) privateWireExposures.add("room name at " + endpoint);
      if (serialized.includes(password)) privateWireExposures.add("test password at " + endpoint);
      if (method === "EVENT" && first?.id) {
        const type = eventType(first);
        publications.set(first.id, type);
        count(trace.sends, type);
        if (type === "ephemeral-signaling" && !trace.firstSignaling) {
          trace.firstSignaling = {
            createdAt: new Date(first.created_at * 1000).toISOString(),
            localEventAgeMs: Date.now() - first.created_at * 1000,
          };
        }
        if (type === "pulse-profile" || type === "pulse-contact") {
          milestone(peer, type + " sent", endpoint, eventTag(first, "n"));
        }
        if (first.kind === 30078) ownAuthors.add(first.pubkey);
        if (first.kind === 4454) {
          const target = eventTag(first, "p");
          if (target) peerMailTargets.add(target);
        }
      } else if (method === "REQ") {
        const types = [...new Set(filters.map(filterType))];
        const exact = filters.flatMap((filter) => filter["#n"] ?? []).filter((nick) => ownNicks.has(nick));
        subscriptions.set(first, { types, exact });
        for (const nick of exact) {
          milestone(peer, "exact query sent", endpoint, { nick, types });
        }
        types.forEach((type) => count(trace.queries, type));
      } else if (method === "CLOSE") {
        subscriptions.delete(first);
      }
    });
    socket.on("framereceived", (frame) => {
      const [method, first, second, third] = unpack(frame);
      if (method === "OK" && publications.has(first)) {
        const type = publications.get(first);
        publications.delete(first);
        count(trace.ack, type + (second ? " accepted" : " rejected"));
        if (type === "pulse-profile" || type === "pulse-contact") {
          milestone(peer, type + " ACK", endpoint, { accepted: second, reason: String(third).slice(0, 180) });
        }
        if (!second) count(trace.reasons, type + " " + String(third).slice(0, 180));
      } else if (method === "EOSE") {
        const queried = subscriptions.get(first);
        queried?.types.forEach((type) => count(trace.ends, type));
        for (const nick of queried?.exact ?? []) {
          milestone(peer, "exact query EOSE", endpoint, { nick, types: queried.types });
        }
      } else if (method === "CLOSED") {
        const types = subscriptions.get(first)?.types ?? [];
        count(trace.reasons, types.join(",") + " CLOSED " + String(second).slice(0, 180));
      } else if (method === "NOTICE") {
        count(trace.reasons, "NOTICE " + String(first).slice(0, 180));
      } else if (method === "EVENT" && second?.id &&
          (ownAuthors.has(second.pubkey) || ownNicks.has(eventTag(second, "n")))) {
        count(trace.receivedOwn, eventType(second));
        if (eventType(second) === "pulse-profile") {
          milestone(peer, "pulse-profile read", endpoint, eventTag(second, "n"));
        }
      }
    });
    socket.on("socketerror", (error) => count(trace.errors, String(error).slice(0, 180)));
    socket.on("close", () => { trace.closed++; });
  });
}

async function openPeer(browser, account, origin) {
  const context = await browser.newContext({
    permissions: ["microphone"],
    viewport: { width: 1440, height: 900 },
  });
  const peer = { ...account, context, relays: new Map(), errors: new Map(), milestones: new Map() };
  await openPage(peer, origin, modes[0]);
  return peer;
}

async function openPage(peer, origin, mode) {
  const page = peer.page = await peer.context.newPage();
  page.setDefaultTimeout(timeout);
  watchRelays(page, peer);
  await watchHandshake(peer.context, page, peer);
  page.on("pageerror", (error) => count(peer.errors, error.message.slice(0, 240)));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) count(peer.errors, message.text().slice(0, 240));
  });
  await page.addInitScript((mode) => {
    const NativeConnection = window.RTCPeerConnection;
    window.pulseLiveConnections = [];
    window.pulseLiveConnected = false;
    window.RTCPeerConnection = class extends NativeConnection {
      constructor(...arguments_) {
        if (mode !== "standard") arguments_[0] = { ...arguments_[0], iceTransportPolicy: "relay" };
        if (mode === "no-direct") arguments_[0].iceServers = [];
        super(...arguments_);
        window.pulseLiveConnections.push(this);
        const observed = () => {
          if (this.connectionState === "connected" ||
              ["connected", "completed"].includes(this.iceConnectionState) || this.sctp?.state === "connected") {
            window.pulseLiveConnected = true;
          }
        };
        this.addEventListener("connectionstatechange", observed);
        this.addEventListener("iceconnectionstatechange", observed);
      }
    };
  }, mode);
  await page.goto(origin);
}

async function waitFor(description, check) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await new Promise((ok) => setTimeout(ok, 180));
  }
  throw new Error(description);
}

async function onboard({ page, name, nick }) {
  await page.locator("#ob-name").fill(name);
  await page.locator("#ob-nick").fill(nick);
  await page.locator("#ob-pw").fill(password);
  await page.locator("#ob-pw2").fill(password);
  await page.locator("#ob-terms-open").click();
  await page.locator("#terms-yes").click();
  await page.locator("#ob-create").click();
  await page.locator("#ob-go").waitFor();
  const onboarding = (await page.locator("#ob-gen-sub").textContent())?.trim();
  await page.locator("#ob-go").click();
  await page.locator("#w-id").waitFor();
  console.log("ONBOARD", name, JSON.stringify({
    elapsedMs: Date.now() - startedAt,
    visibleIdentity: (await page.locator("#w-id").textContent())?.trim(),
    onboarding,
  }));
}

async function readPublicId(peer) {
  await peer.page.locator("#ub-me").click();
  const displayed = (await peer.page.locator("#s-friendcode").textContent())?.trim();
  await peer.page.locator("#settings-modal [data-close]").click();
  const code = displayed?.match(idPattern)?.[0];
  assert(code, "Expected a visible public ID in " + peer.name + "'s account settings.");
  return code;
}

function friendResult(page, destination) {
  return page.locator("#friend-list .f-item")
    .filter({ has: page.getByText(destination.name, { exact: true }) });
}

async function searchFor(source, target, method) {
  const { page } = source;
  const input = page.locator("#friend-search");
  await input.clear();
  await waitFor("The preceding search results must clear", async () =>
    (await page.locator("#search-results").textContent())?.trim() === "",
  );
  await input.fill(method === "id" ? target.code : "@" + target.nick);
  milestone(source, "search entered", "UI", { method, target: target.nick });
  const terminal = await waitFor("The " + method + " search did not finish", () =>
    page.locator("#search-results").evaluate((results, wanted) => {
      const rows = [...results.querySelectorAll(".sr-item")];
      const matched = rows.some((row) => {
        const name = row.querySelector(".f-name")?.textContent.trim();
        const sub = row.querySelector(".f-sub")?.textContent.trim();
        return name === wanted.name &&
          (sub === "@" + wanted.nick || (wanted.method === "id" && sub === wanted.code));
      });
      if (matched) return { matched: true };
      const blank = results.querySelector(".sr-empty");
      if (blank) return { matched: false, text: blank.textContent.trim() };
      if (rows.length) return { matched: false, text: "Directory returned " + rows.length + " other results" };
      return null;
    }, { method, name: target.name, nick: target.nick, code: target.code }),
  );
  milestone(source, "search completed", "UI", { method, target: target.nick, matched: terminal.matched });
  assert(terminal.matched, terminal.text ?? "Expected the dedicated synthetic account");
}

async function sendAndAccept(source, target, method) {
  await source.page.locator("#pf-add").click();
  await source.page.locator("#af-code").fill(method === "id" ? target.code : "@" + target.nick);
  await source.page.locator("#af-btn").click();
  const pending = target.page.locator("#req-box .req").filter({
    has: target.page.getByText(source.name, { exact: true }),
  });
  await pending.getByTitle("Принять", { exact: true }).click();
  await Promise.all([
    friendResult(source.page, target).waitFor(),
    friendResult(target.page, source).waitFor(),
  ]);
}

async function leaveRoom(peer) {
  if (await peer.page.locator("#view-room").isVisible()) {
    await peer.page.locator("#btn-leave").click();
    await peer.page.locator("#view-room").waitFor({ state: "hidden" });
  }
}

async function roomJoin(host, guest, method, mode) {
  await Promise.all([leaveRoom(host), leaveRoom(guest)]);
  const label = roomName(method, mode);
  const shownCode = host.page.locator("#waiting-code");
  const previousCode = (await shownCode.textContent())?.trim();
  await host.page.locator("#rail-add").click();
  await host.page.locator("#rm-name").fill(label);
  assert.equal(await host.page.locator("#rm-public").isChecked(), false);
  await host.page.locator("#rm-create-btn").click();
  await waitFor("The host did not show the expected room title", async () =>
    (await host.page.locator("#room-name").textContent())?.trim() === label,
  );
  if (method === "invite") {
    await host.page.locator("#quick-invite").getByRole("button", { name: "Позвать " + guest.name }).click();
    await guest.page.getByRole("button", { name: "Зайти", exact: true }).click();
  } else {
    const code = await waitFor("The host did not show a fresh private room code", async () => {
      const value = (await shownCode.textContent())?.trim();
      return value !== previousCode && roomPattern.test(value) && await shownCode.isVisible() ? value : null;
    });
    await guest.page.locator("#rail-add").click();
    await guest.page.locator('#rm-tabs [data-v="join"]').click();
    await guest.page.locator("#rm-code").fill("Залетай в Pulse — комната «" + label + "» Код: " + code);
    await guest.page.locator("#rm-join-btn").click();
  }
  await Promise.all([
    host.page.locator("#people").getByText(guest.name, { exact: true }).waitFor(),
    guest.page.locator("#people").getByText(host.name, { exact: true }).waitFor(),
  ]);
  assert.equal((await host.page.locator("#people-count").textContent())?.trim(), "2");
  assert.equal((await guest.page.locator("#people-count").textContent())?.trim(), "2");
}

async function roomChat(a, b, method) {
  for (const [sender, recipient] of [[a, b], [b, a]]) {
    const message = roomMessage(sender, method);
    await sender.page.locator("#msg-input").fill(message);
    await sender.page.locator("#send").click();
    await recipient.page.locator("#messages .kind-text .bubble").filter({ hasText: message }).waitFor();
  }
}

async function snapshot(peer) {
  const state = await peer.page.evaluate(async () => {
    const text = (id) => document.getElementById(id)?.textContent?.trim()?.slice(0, 260);
    const connectionStats = async (connection) => {
      const local = new Set();
      const remote = new Set();
      let path;
      try {
        const stats = await connection.getStats();
        for (const item of stats.values()) {
          if (item.type === "local-candidate") local.add(item.candidateType);
          if (item.type === "remote-candidate") remote.add(item.candidateType);
          if (item.type === "transport" && item.selectedCandidatePairId) {
            const pair = stats.get(item.selectedCandidatePairId);
            const from = stats.get(pair?.localCandidateId);
            const to = stats.get(pair?.remoteCandidateId);
            path = [from?.candidateType, to?.candidateType, from?.protocol, pair?.state].join("/");
          }
        }
      } catch {}
      return [connection.connectionState, connection.iceConnectionState, connection.iceGatheringState,
        connection.signalingState, [...local].sort().join(","), [...remote].sort().join(","), path ?? ""].join("/");
    };
    const connections = {};
    for (const connection of window.pulseLiveConnections) {
      const state = await connectionStats(connection);
      connections[state] = (connections[state] ?? 0) + 1;
    }
    const room = window.__pulse?.getCall?.()?.room;
    return {
      title: text("w-id"), online: text("online-count"), room: text("room-name"),
      participants: text("people"), network: text("net-text"), toast: text("toasts"), connections,
      roomPeers: room ? await Promise.all(Object.values(room.getPeers()).map(connectionStats)) : [],
      directObserved: window.pulseLiveConnected,
    };
  }).catch((error) => ({ snapshot: error.message }));
  console.log("STATE", peer.name, JSON.stringify(state));
}

function printRelays(peer) {
  for (const [endpoint, rows] of peer.relays) {
    const formatted = Object.fromEntries(Object.entries(rows).map(([key, value]) =>
      [key, value instanceof Map ? Object.fromEntries(value) : value],
    ));
    console.log("RELAY", peer.name, endpoint, JSON.stringify(formatted));
  }
  if (peer.errors.size) console.log("BROWSER", peer.name, JSON.stringify(Object.fromEntries(peer.errors)));
}

function printMilestones(peer) {
  for (const entry of peer.milestones.values()) {
    console.log("TIMELINE", peer.name, JSON.stringify(entry));
  }
}

async function assertNoDirectPaths(peers) {
  for (const peer of peers) {
    const observed = await peer.page.evaluate(() => ({
      connected: window.pulseLiveConnected || window.pulseLiveConnections.some((connection) =>
        connection.connectionState === "connected" ||
        ["connected", "completed"].includes(connection.iceConnectionState) || connection.sctp?.state === "connected",
      ),
      policies: window.pulseLiveConnections.map((connection) => connection.getConfiguration().iceTransportPolicy),
      relayServers: window.pulseLiveConnections.flatMap((connection) => connection.getConfiguration().iceServers),
    }));
    assert.equal(observed.connected, false, peer.name + " established a native ICE path");
    assert(observed.policies.every((policy) => policy === "relay"), "Native ICE policy escaped relay-only");
    assert.equal(observed.relayServers.length, 0, "Native ICE unexpectedly has TURN/STUN servers");
  }
}

async function turnStats(viewer, expectedPublicKey, expectedName) {
  return viewer.page.evaluate(async ({ expectedPublicKey, expectedName }) => {
    const peers = window.__pulse?.getCall?.()?.peers;
    const peer = [...(peers?.values() ?? [])].find((record) =>
      record.pub === expectedPublicKey && record.name === expectedName && record.reserveVoice,
    );
    if (!peer?.voiceConnection) return null;
    const pc = peer.voiceConnection;
    const reports = await pc.getStats();
    let selected;
    let packets = 0;
    for (const row of reports.values()) {
      if (row.type === "transport" && row.selectedCandidatePairId) selected = reports.get(row.selectedCandidatePairId);
      if (row.type === "inbound-rtp" && (row.kind === "audio" || row.mediaType === "audio")) {
        packets += Number(row.packetsReceived) || 0;
      }
    }
    const local = reports.get(selected?.localCandidateId);
    const remote = reports.get(selected?.remoteCandidateId);
    const policy = pc.getConfiguration().iceTransportPolicy;
    return {
      state: selected?.state, nominated: selected?.nominated,
      local: local?.candidateType, remote: remote?.candidateType,
      protocol: local?.protocol, relayProtocol: local?.relayProtocol, packets, policy,
    };
  }, { expectedPublicKey, expectedName });
}

async function verifyTurnVoice(a, b) {
  const publicKeys = await Promise.all([a, b].map((peer) => peer.page.evaluate(async () =>
    (await import("/js/chunk-7GRP2DEX.js")).y().pub,
  )));
  const readers = [[a, b, publicKeys[1]], [b, a, publicKeys[0]]];
  await Promise.all(readers.map(([viewer, other]) =>
    viewer.page.locator("#people .person").filter({
      has: viewer.page.getByText(other.name, { exact: true }),
    }).getByText("Голос и чат", { exact: false }).waitFor(),
  ));
  const measure = () => Promise.all(readers.map(([viewer, other, key]) => turnStats(viewer, key, other.name)));
  const healthy = (report) => report?.state === "succeeded" && report.nominated === true &&
    report.local === "relay" && report.remote === "relay" && report.policy === "relay";
  const initial = await waitFor("Both authenticated voice peers need a nominated TURN candidate pair", async () => {
    const reports = await measure();
    return reports.every(healthy) ? reports : null;
  });
  const final = await waitFor("Both TURN links must receive additional microphone RTP", async () => {
    const reports = await measure();
    return reports.every((report, index) => healthy(report) && report.packets > initial[index].packets + 10)
      ? reports : null;
  });
  console.log("TURN EVIDENCE", JSON.stringify(final.map((report, index) => ({
    viewer: readers[index][0].name,
    authenticated: true,
    ...report,
    addedAudioPackets: report.packets - initial[index].packets,
  }))));
}

const failed = [];
const results = new Map();
async function stage(label, work) {
  const started = Date.now();
  try {
    await work();
    const result = { ok: true, ms: Date.now() - started };
    results.set(label, result);
    console.log("PASS", label, result.ms + "ms");
    return true;
  } catch (error) {
    const result = { ok: false, ms: Date.now() - started, error: error.message.slice(0, 1700) };
    results.set(label, result);
    failed.push(label);
    console.error("FAIL", label, JSON.stringify(result));
    return false;
  }
}

const server = await serveAssets();
let browser;
let peers = [];
try {
  browser = await chromium.launch({
    executablePath: browserPath,
    args: ["--use-fake-device-for-media-stream"],
  });
  console.log("LIVE Pulse assets", root, "synthetic run", runId);
  const origin = "http://127.0.0.1:" + server.address().port;
  peers = await Promise.all(accounts.map((account) => openPeer(browser, account, origin)));
  const [alice, bob] = peers;
  const onboards = await Promise.all(peers.map((peer) => stage("onboarding " + peer.nick, () => onboard(peer))));
  if (onboards.every(Boolean)) {
    console.log("ONBOARD RELAYS");
    peers.forEach(printRelays);
    const ids = await Promise.all(peers.map((peer) => stage("visible ID " + peer.nick, async () => {
      peer.code = await readPublicId(peer);
    })));
    for (const method of ["nick", "id"]) {
      if (method === "id" && !ids.every(Boolean)) continue;
      await Promise.all([[alice, bob], [bob, alice]].map(([source, target]) =>
        stage(method + " search " + source.nick + " -> " + target.nick, () => searchFor(source, target, method)),
      ));
    }
    await Promise.all(peers.map((peer) => peer.page.locator("#friend-search").clear()));
    const [source, target] = options.sender === "alice" ? [alice, bob] : [bob, alice];
    const added = (options.add !== "id" || target.code) &&
      await stage("friend request and acceptance by " + options.add, () => sendAndAccept(source, target, options.add));
    if (added) {
      await stage("mutual online indicators", async () => {
        await Promise.all([[alice, bob], [bob, alice]].map(([viewer, contact]) =>
          friendResult(viewer.page, contact).locator(".status-dot.on").waitFor(),
        ));
      });
    } else {
      failed.push("friendship prerequisite");
    }

    for (const [index, mode] of modes.entries()) {
      console.log("LIVE transport", mode);
      if (index > 0) {
        const ready = await stage("preserved accounts after opening " + mode, async () => {
          await Promise.all(peers.map((peer) => peer.page.close()));
          await Promise.all(peers.map((peer) => openPage(peer, origin, mode)));
          await Promise.all(peers.map((peer) => waitFor("Expected the remembered account " + peer.name, async () =>
            await peer.page.locator("#w-name").isVisible() &&
            (await peer.page.locator("#w-name").textContent())?.trim() === peer.name,
          )));
          if (added) await Promise.all([[alice, bob], [bob, alice]].map(([viewer, contact]) =>
            friendResult(viewer.page, contact).waitFor(),
          ));
        });
        if (!ready) continue;
      }
      const methods = mode === "turn-only" && options["all-transports"] ? ["code"]
        : options.join === "both" ? ["invite", "code"] : [options.join];
      for (const method of methods) {
        const label = mode + " " + method;
        if (method === "invite" && !added) {
          console.error("SKIP invitation requires accepted friendship in " + mode);
          failed.push("invite prerequisite in " + mode);
          continue;
        }
        const [host, guest] = method === "invite" ? [source, target] : [target, source];
        const joined = await stage("private room " + label, () => roomJoin(host, guest, method, mode));
        if (joined && mode === "no-direct") {
          await stage("chat-only participant status " + label, () =>
            Promise.all(peers.map((peer) => peer.page.locator("#people").getByText("На связи в чате", {
              exact: true,
            }).waitFor())),
          );
        }
        if (joined && mode === "turn-only") {
          await stage("authenticated nominated TURN and two-way RTP " + label, () => verifyTurnVoice(host, guest));
        }
        await Promise.all(peers.map(snapshot));
        if (joined) {
          await stage("bidirectional room chat " + label, () => roomChat(host, guest, method));
        } else {
          failed.push("room chat prerequisite for " + label);
        }
      }
      if (mode === "no-direct") {
        await stage("no native ICE/data path in either browser", () => assertNoDirectPaths(peers));
      }
    }
  } else {
    failed.push("onboarding prerequisite");
  }
} finally {
  for (const peer of peers) {
    await snapshot(peer);
    printRelays(peer);
    printMilestones(peer);
  }
  await browser?.close();
  await new Promise((ok) => server.close(ok));
}
const unknownTargets = [...peerMailTargets].filter((author) => !ownAuthors.has(author));
if (unknownTargets.length) {
  console.error("Encrypted mail targeted an identity outside the observed synthetic accounts.");
  failed.push("isolated mail targets");
}
if (privateWireExposures.size) {
  console.error("Plaintext exposure in public relay events", [...privateWireExposures]);
  failed.push("private relay traffic");
}
const signalingRelays = Object.fromEntries(peers.map((peer) => [
  peer.nick,
  [...peer.relays].filter(([, trace]) => trace.ack.has("ephemeral-signaling accepted")).map(([relay]) => relay),
]));
console.log("LIVE SUMMARY", JSON.stringify({
  failures: failed,
  signalingRelays,
  privateWireExposures: privateWireExposures.size,
  stages: Object.fromEntries(results),
}));
if (failed.length) process.exitCode = 1;

