import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    root: { type: "string" },
    deps: { type: "string" },
    browser: { type: "string" },
    openssl: { type: "string" },
    mode: { type: "string", default: "custom" },
    join: { type: "string", default: "code" },
    presence: { type: "boolean", default: false },
    "room-recovery": { type: "boolean", default: false },
  },
});

assert(["custom", "default", "bootstrap"].includes(options.mode), "Use --mode custom, default, or bootstrap");
assert(["code", "invite", "both"].includes(options.join), "Use --join code, invite, or both");

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(options.root ?? join(here, "..", "web"));
const deps = resolve(options.deps ?? process.env.PULSE_E2E_DEPS ?? here);
const load = createRequire(join(deps, "package.json"));
const { chromium } = load("playwright-core");
const { WebSocket, WebSocketServer } = load("ws");

const browserExecutable = options.browser ?? [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find(existsSync);
const openssl = options.openssl ?? (
  existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
    ? "C:/Program Files/Git/usr/bin/openssl.exe"
    : "openssl"
);

const kinds = { app: 30078, mail: 4454, room: 29943 };
const defaultHosts = new Set([
  "nos.lol", "relay.primal.net", "nostr.mom", "relay.snort.social", "relay.nostr.dev.br",
  // Keep older extracted builds usable with --root.
  "nostr.oxtr.dev", "offchain.pub", "nostr-pub.wellorder.net", "relay.nostr.net",
]);
const clockSources = new Set([
  "https://speed.cloudflare.com/cdn-cgi/trace",
  "https://1.1.1.1/cdn-cgi/trace",
]);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const tag = (event, name) => event.tags.find(([key]) => key === name)?.[1];

function matches(event, filter) {
  if (filter.ids && !filter.ids.some((id) => event.id.startsWith(id))) return false;
  if (filter.authors && !filter.authors.some((author) => event.pubkey.startsWith(author))) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since != null && event.created_at < filter.since) return false;
  if (filter.until != null && event.created_at > filter.until) return false;
  return Object.entries(filter).every(([key, allowed]) =>
    !key.startsWith("#") || event.tags.some(([name, value]) =>
      name === key.slice(1) && allowed.includes(value),
    ),
  );
}

async function startFixture() {
  const dir = await mkdtemp(join(tmpdir(), "pulse-e2e-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  const removeCertificate = async () => {
    await Promise.all([rm(key, { force: true }), rm(cert, { force: true })]);
    await rmdir(dir);
  };
  try {
    execFileSync(openssl, [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1",
      "-keyout", key, "-out", cert,
    ], { stdio: "ignore" });
    const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
      try {
        const { pathname } = new URL(req.url, "https://127.0.0.1");
        const file = resolve(root, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
        if (!file.startsWith(root + sep)) {
          res.writeHead(403).end();
          return;
        }
        const body = await readFile(file);
        res.writeHead(200, {
          "Content-Type": mime[extname(file)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });

    const relay = new WebSocketServer({ server, path: "/relay" });
    const records = new Map();
    const subscriptions = new Map();
    const summary = { connections: 0, requests: 0, signaling: 0, droppedSignaling: 0, mail: 0 };
    let signalingPaused = false;
    let nativeSignalingPaused = false;
    let roomRelayPaused = false;
    relay.on("connection", (socket) => {
      summary.connections++;
      const subs = new Map();
      subscriptions.set(socket, subs);
      const send = (frame) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(frame));
      socket.on("error", () => {});
      socket.on("close", () => subscriptions.delete(socket));
      socket.on("message", (input) => {
        const [type, id, ...filters] = JSON.parse(String(input));
        if (type === "REQ") {
          summary.requests++;
          subs.set(id, filters);
          const history = [...records.values()].sort((a, b) =>
            b.created_at - a.created_at || a.id.localeCompare(b.id),
          );
          const replay = new Map();
          for (const filter of filters) {
            for (const event of history.filter((event) => matches(event, filter)).slice(0, filter.limit)) {
              replay.set(event.id, event);
            }
          }
          for (const event of replay.values()) send(["EVENT", id, event]);
          send(["EOSE", id]);
        }
        if (type === "CLOSE") subs.delete(id);
        if (type === "EVENT") {
          const event = id;
          if (event.kind === kinds.app || event.kind === kinds.mail) {
            const key = event.kind === kinds.app
              ? [event.kind, event.pubkey, tag(event, "d")].join(":")
              : event.id;
            const previous = records.get(key);
            if (previous && (previous.created_at > event.created_at ||
                (previous.created_at === event.created_at && previous.id <= event.id))) {
              send(["OK", event.id, true, "duplicate: existing event"]);
              return;
            }
            records.set(key, event);
            if (event.kind === kinds.mail) summary.mail++;
          } else if (event.kind >= 20000 && event.kind < 30000) {
            const native = !event.tags.some(([key]) => key === "t") || event.kind !== kinds.room;
            if (signalingPaused || nativeSignalingPaused && native || roomRelayPaused && !native) {
              summary.droppedSignaling++;
              send(["OK", event.id, true, ""]);
              return;
            }
            summary.signaling++;
          } else {
            send(["OK", event.id, false, "unsupported fixture event kind"]);
            return;
          }
          send(["OK", event.id, true, ""]);
          for (const [client, filters] of subscriptions) {
            for (const [subscription, parts] of filters) {
              if (client.readyState === WebSocket.OPEN && parts.some((filter) => matches(event, filter))) {
                client.send(JSON.stringify(["EVENT", subscription, event]));
              }
            }
          }
        }
      });
    });

    await new Promise((ok, fail) => {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", ok);
    });
    const base = "https://127.0.0.1:" + server.address().port;
    const url = base.replace("https:", "wss:") + "/relay";
    return {
      base, url, summary,
      profileCount: () => [...records.values()].filter((e) => tag(e, "d") === "pulse-profile").length,
      vaultCount: () => [...records.values()].filter((e) => tag(e, "d") === "pulse-acct").length,
      hasPublicRoom: (name) => [...records.values()].some(e =>
        e.kind === kinds.app && tag(e, "t") === "pulse-room" && JSON.parse(e.content).name === name),
      presenceTimes: () => new Map([...records.values()]
        .filter((event) => event.kind === kinds.app && tag(event, "d") === "pulse-presence")
        .map((event) => [event.pubkey, event.created_at])),
      pauseSignaling(paused) {
        signalingPaused = paused;
      },
      pauseNativeSignaling() {
        nativeSignalingPaused = true;
        roomRelayPaused = false;
      },
      pauseRoomRelay() { roomRelayPaused = true; },
      async close() {
        for (const client of relay.clients) client.terminate();
        await new Promise((ok) => relay.close(ok));
        await new Promise((ok) => server.close(ok));
        await removeCertificate();
      },
    };
  } catch (error) {
    await removeCertificate();
    throw error;
  }
}

async function waitFor(description, condition, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((ok) => setTimeout(ok, 125));
  }
  throw new Error(description);
}

async function expectText(page, selector, expected, timeout) {
  await page.locator(selector).waitFor({ state: "visible", timeout });
  await waitFor("Expected " + selector + " to show " + expected, async () =>
    (await page.locator(selector).textContent({ timeout: 1000 }))?.trim() === expected, timeout,
  );
}

function relayStats() {
  return {
    custom: 0, default: 0, blocked: 0,
    customAppRequests: 0, kindAppRequests: 0, pulses: 0, signaling: 0, clockSamples: 0,
  };
}

async function openPeer(browser, fixture, name, nick, policy) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    viewport: { width: 1380, height: 900 },
    permissions: ["microphone", "camera"],
  });
  const peer = { context, name, nick, errors: [], traffic: relayStats(), aliases: new Set() };
  await context.route((url) => url.origin !== fixture.base, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || !clockSources.has(url.origin + url.pathname)) return route.abort();
    peer.traffic.clockSamples++;
    return route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": fixture.base, "cache-control": "no-store" },
      contentType: "text/plain; charset=utf-8",
      body: "ts=" + (Date.now() / 1000).toFixed(3) + "\n",
    });
  });
  await context.routeWebSocket(/.*/, (route) => {
    const frame = (message, custom = false) => {
      const [type, first, ...filters] = JSON.parse(String(message));
      if (type === "REQ" && filters.some((filter) => filter.kinds?.includes(kinds.app))) {
        peer.traffic.kindAppRequests++;
        if (custom) peer.traffic.customAppRequests++;
      } else if (type === "EVENT" && first.kind === kinds.app) {
        peer.traffic.pulses++;
      } else if (type === "EVENT" && first.kind >= 20000 && first.kind < 30000) {
        peer.traffic.signaling++;
      }
    };
    if (route.url() === fixture.url) {
      peer.traffic.custom++;
      const socket = route.connectToServer();
      route.onMessage((message) => {
        frame(message, true);
        socket.send(message);
      });
      return;
    }
    if (policy.allowDefaults && defaultHosts.has(new URL(route.url()).hostname)) {
      peer.traffic.default++;
      // Simulate each bundled relay endpoint against the same loopback fixture.
      const socket = new WebSocket(fixture.url, { rejectUnauthorized: false });
      peer.aliases.add(socket);
      const pending = [];
      socket.on("open", () => pending.splice(0).forEach((message) => socket.send(message)));
      socket.on("message", (message) => route.send(String(message)));
      socket.on("close", () => {
        peer.aliases.delete(socket);
        route.close();
      });
      socket.on("error", () => route.close());
      route.onMessage((message) => {
        frame(message);
        if (socket.readyState === WebSocket.OPEN) socket.send(message);
        else if (socket.readyState === WebSocket.CONNECTING) pending.push(message);
      });
      route.onClose(() => socket.close());
      return;
    }
    peer.traffic.blocked++;
    route.close({ code: 1001, reason: "Endpoint disabled by the loopback test" });
  });

  await context.addInitScript(({ bootstrap, testPresence }) => {
    if (bootstrap && localStorage.getItem("pulse:networkRelays") === null) {
      localStorage.setItem("pulse:networkRelays", JSON.stringify([bootstrap]));
    }
    if (testPresence) {
      const actualTime = Date.now.bind(Date);
      const actualMonotonicTime = performance.now.bind(performance);
      window.pulseTestClockAdvance = 0;
      Date.now = () => actualTime() + window.pulseTestClockAdvance;
      performance.now = () => actualMonotonicTime() + window.pulseTestClockAdvance;
    }
    // Keep the browser's real ICE, DTLS/SCTP, and media while disabling external ICE servers.
    const NativePeer = window.RTCPeerConnection;
    const localIce = (configuration) => ({ ...configuration, iceServers: [], iceTransportPolicy: "all" });
    window.pulseTestPeers = [];
    window.pulseTestDirectConnection = false;
    window.RTCPeerConnection = class extends NativePeer {
      constructor(configuration) {
        super(localIce(configuration));
        window.pulseTestPeers.push(this);
        const checkConnection = () => {
          if (this.connectionState === "connected" ||
              ["connected", "completed"].includes(this.iceConnectionState)) {
            window.pulseTestDirectConnection = true;
          }
        };
        this.addEventListener("connectionstatechange", checkConnection);
        this.addEventListener("iceconnectionstatechange", checkConnection);
      }

      setConfiguration(configuration) {
        super.setConfiguration(localIce(configuration));
      }
    };
  }, { bootstrap: options.mode === "bootstrap" ? fixture.url : null, testPresence: options.presence });
  await newPage(peer);
  return peer;
}

async function newPage(peer) {
  const page = await peer.context.newPage();
  page.setDefaultTimeout(18000);
  page.on("pageerror", (error) => peer.errors.push(error.message));
  peer.page = page;
  return page;
}

async function onboard({ page, name, nick }) {
  const password = "Pulse-Loopback-Only!94";
  await page.locator("#ob-name").fill(name);
  await page.locator("#ob-nick").fill(nick);
  await page.locator("#ob-pw").fill(password);
  await page.locator("#ob-pw2").fill(password);
  await page.locator("#ob-terms-open").click();
  await page.locator("#terms-yes").click();
  await page.locator("#ob-create").click();
  await page.locator("#ob-go").click({ timeout: 30000 });
  await expectText(page, "#w-id", "@" + nick);
}

async function selectCustomRelay({ page }, url) {
  await page.locator("#rail-settings").click();
  await page.locator('.snav[data-sec="network"]').click();
  const relays = page.locator("#s-relays");
  await relays.fill(url);
  await relays.press("Tab");
  assert.equal(await relays.inputValue(), url);
  await page.locator("#settings-modal [data-close]").click();
}

const friendRow = (page, name) => page.locator("#friend-list .f-item").filter({
  has: page.getByText(name, { exact: true }),
});

async function addAndAccept(alice, bob) {
  await alice.page.locator("#friend-search").fill("@" + bob.nick);
  const result = alice.page.locator("#search-results .sr-item").filter({
    has: alice.page.getByText("@" + bob.nick, { exact: true }),
  });
  await result.getByRole("button", { name: "Добавить", exact: true }).click();
  const request = bob.page.locator("#req-box .req").filter({
    has: bob.page.getByText(alice.name, { exact: true }),
  });
  await request.getByTitle("Принять", { exact: true }).click();
  await Promise.all([
    friendRow(alice.page, bob.name).getByTitle("Позвонить", { exact: true }).waitFor(),
    friendRow(bob.page, alice.name).getByTitle("Позвонить", { exact: true }).waitFor(),
  ]);
  await Promise.all([
    expectText(alice.page, "#online-count", "1 в сети"),
    expectText(bob.page, "#online-count", "1 в сети"),
  ]);
}

async function expectPresence(peer, friend, online) {
  const row = friendRow(peer.page, friend.name);
  await row.locator(online ? ".status-dot.on" : ".status-dot:not(.on)").waitFor();
  await expectText(peer.page, "#online-count", (online ? "1" : "0") + " в сети");
}

async function assertNoDirectConnection(peer) {
  const direct = await peer.page.evaluate(() =>
    window.pulseTestDirectConnection || window.pulseTestPeers.some((connection) =>
      connection.connectionState === "connected" ||
      ["connected", "completed"].includes(connection.iceConnectionState),
    ),
  );
  assert.equal(direct, false, peer.name + " established native ICE while signaling was unavailable");
}

async function relayOnlyPresence(alice, bob, fixture) {
  const peers = [alice, bob];
  await waitFor("Expected a baseline heartbeat from each account", () =>
    fixture.presenceTimes().size === peers.length,
  );
  const forwarded = fixture.summary.signaling;
  const dropped = fixture.summary.droppedSignaling;
  fixture.pauseSignaling(true);

  await Promise.all(peers.map((peer) => peer.page.close()));
  const before = fixture.presenceTimes();
  const restartAt = Math.max(Math.floor(Date.now() / 1000), ...before.values()) + 1;
  const attempts = peers.map((peer) => peer.traffic.signaling);
  await waitFor("Expected the relay heartbeat timestamp to advance", () =>
    Math.floor(Date.now() / 1000) >= restartAt,
  );
  await Promise.all(peers.map(async (peer) => (await newPage(peer)).goto(fixture.base)));
  await Promise.all(peers.map((peer) => expectText(peer.page, "#w-id", "@" + peer.nick)));
  await waitFor("Both restarted peers must publish a new kind-30078 presence heartbeat", () => {
    const current = fixture.presenceTimes();
    return [...before.keys()].every((author) => current.get(author) >= restartAt);
  }, 15000);
  await waitFor("Both restarted peers must attempt signaling that the fixture drops", () =>
    fixture.summary.droppedSignaling > dropped &&
    peers.every((peer, index) => peer.traffic.signaling > attempts[index]), 15000,
  );
  assert.equal(fixture.summary.signaling, forwarded, "The fixture forwarded signaling during the outage");

  await Promise.all([expectPresence(alice, bob, true), expectPresence(bob, alice, true)]);
  await Promise.all(peers.map(assertNoDirectConnection));
  console.log("PASS both existing friends show online from fresh relay heartbeats with native ICE disconnected");

  await bob.page.close();
  await expectPresence(alice, bob, true);
  await alice.page.evaluate(() => { window.pulseTestClockAdvance = 125_000; });
  await expectPresence(alice, bob, false);
  await assertNoDirectConnection(alice);
  console.log("PASS the closed client becomes offline after its relay heartbeat expires");

  await alice.page.evaluate(() => { window.pulseTestClockAdvance = 0; });
  fixture.pauseSignaling(false);
  const reopened = await newPage(bob);
  await Promise.all([alice.page.reload(), reopened.goto(fixture.base)]);
  await Promise.all(peers.map((peer) => expectText(peer.page, "#w-id", "@" + peer.nick)));
  await Promise.all([expectPresence(alice, bob, true), expectPresence(bob, alice, true)]);
  console.log("PASS signaling restored with both existing profiles and friendships intact");
}

async function findExistingFriend({ page }, friend) {
  const search = page.locator("#friend-search");
  try {
    await search.fill("@" + friend.nick);
    await friendRow(page, friend.name).waitFor({ timeout: 3000 });
  } catch (error) {
    throw new Error("Existing friend " + friend.name + " was missing when filtering by @" + friend.nick, {
      cause: error,
    });
  } finally {
    await search.clear();
  }
}

async function roster(alice, bob) {
  await Promise.all([
    alice.page.locator("#people").getByText(bob.name, { exact: true }).waitFor({ timeout: 45000 }),
    bob.page.locator("#people").getByText(alice.name, { exact: true }).waitFor({ timeout: 45000 }),
  ]);
  await Promise.all([alice, bob].map(peer => expectText(peer.page, "#people-count", "2")));
}

async function exchangeRoomText(alice, bob, stage) {
  for (const [sender, receiver] of [[alice, bob], [bob, alice]]) {
    const message = "Loopback room chat from " + sender.name + " " + stage;
    await sender.page.locator("#msg-input").fill(message);
    await sender.page.locator("#send").click();
    const bubble = peer => peer.page.locator("#messages .kind-text .bubble").filter({ hasText: message });
    await bubble(sender).waitFor();
    await bubble(receiver).waitFor();
  }
}

async function joinRoom(alice, bob, method, room = "Pulse Local " + method) {
  const hostCode = alice.page.locator("#waiting-code");
  const previousCode = (await hostCode.textContent())?.trim();
  await alice.page.locator("#rail-add").click();
  await alice.page.locator("#rm-name").fill(room);
  assert.equal(await alice.page.locator("#rm-public").isChecked(), false);
  await alice.page.locator("#rm-create-btn").click();
  await expectText(alice.page, "#room-name", room);

  if (method === "invite") {
    await alice.page.locator("#quick-invite").getByRole("button", { name: "Позвать " + bob.name }).click();
    await bob.page.getByRole("button", { name: "Зайти", exact: true }).click();
  } else {
    const roomCodePattern = /^pulse-[A-Za-z0-9]{16,40}$/;
    let code;
    await waitFor("The host must expose a new room code", async () => {
      code = (await hostCode.textContent())?.trim();
      return code !== previousCode && roomCodePattern.test(code ?? "") && await hostCode.isVisible();
    });
    await bob.page.locator("#rail-add").click();
    await bob.page.locator('#rm-tabs [data-v="join"]').click();
    await bob.page.locator("#rm-code").fill("Залетай в Pulse — комната «" + room + "»\nКод: " + code);
    await bob.page.locator("#rm-join-btn").click();
  }

  await expectText(bob.page, "#room-name", room);
  await roster(alice, bob);
  console.log("PASS private room by " + method + ", both browsers display two named participants");
  await exchangeRoomText(alice, bob, "by " + method + " in " + room);
  console.log("PASS private room chat by " + method + " in both directions");
}

async function rejectsAbsentRoom(peer) {
  const { page } = peer;
  const roomName = await page.locator("#room-name").textContent();
  const rooms = page.locator("#rail-rooms .rail-btn");
  const previousCount = await rooms.count();
  await page.locator("#rail-add").click();
  await page.locator('#rm-tabs [data-v="join"]').click();
  await page.locator("#rm-code").fill("pulse-23456789ABCDabcd23456789");
  await page.locator("#rm-join-btn").click();
  await page.locator("#toasts").getByText(/комната по этому коду пока не найдена/i).waitFor({ timeout: 16000 });
  assert.equal(await rooms.count(), previousCount);
  assert.equal(await page.locator("#room-name").textContent(), roomName);
  assert.equal(await page.locator("#room-modal").isVisible(), true);
  await page.locator("#room-modal [data-close]").click();
  console.log("PASS an absent room code preserves the active room and saved list");
}

async function verifyDirectAudio(peers) {
  const samples = () => Promise.all(peers.map(peer => peer.page.evaluate(async () => {
    let packets = 0;
    for (const pc of window.pulseTestPeers) {
      if (pc.connectionState !== "connected") continue;
      const stats = await pc.getStats().catch(() => null);
      stats?.forEach(row => {
        if (row.type === "inbound-rtp" && (row.kind === "audio" || row.mediaType === "audio"))
          packets += row.packetsReceived ?? 0;
      });
    }
    return packets;
  })));
  const first = await samples();
  await waitFor("Both browsers should receive room audio packets", async () =>
    (await samples()).every((packets, index) => packets > first[index]), 15000);
  console.log("PASS native WebRTC audio packets advance on both browsers");
}

async function leaveRooms(peers) {
  await Promise.all(peers.map(peer => peer.page.locator("#btn-leave").click()));
  await Promise.all(peers.map(peer => peer.page.locator("#view-room").waitFor({ state: "hidden" })));
}

async function roomRecovery(alice, bob, fixture) {
  const peers = [alice, bob];
  await leaveRooms(peers);
  fixture.pauseNativeSignaling();
  await Promise.all(peers.map(peer => peer.page.reload()));
  await Promise.all(peers.map(peer => expectText(peer.page, "#w-id", "@" + peer.nick)));
  const room = "Pulse Local relay restore";
  await joinRoom(alice, bob, "code", room);
  await Promise.all(peers.map(assertNoDirectConnection));

  await leaveRooms(peers);
  await alice.page.close();
  await bob.page.reload();
  const reopen = async peer => {
    await expectText(peer.page, "#w-id", "@" + peer.nick);
    await peer.page.locator(`#rail-rooms [data-tip="${room}"]`).click();
    await expectText(peer.page, "#room-name", room);
  };
  await reopen(bob);
  await expectText(bob.page, "#people-count", "1");
  await newPage(alice);
  await alice.page.goto(fixture.base);
  await reopen(alice);
  await roster(alice, bob);
  await exchangeRoomText(alice, bob, "after role-reversed restart");
  await Promise.all(peers.map(assertNoDirectConnection));
  console.log("PASS saved guest reopens alone after restart, creator returns, and relay chat resumes both ways");
}

async function publicRoomWithoutPeers(alice, bob, fixture) {
  await leaveRooms([alice, bob]);
  fixture.pauseSignaling(true);
  const room = "Pulse Local Public";
  await alice.page.locator("#rail-add").click();
  await alice.page.locator("#rm-name").fill(room);
  await alice.page.locator("label").filter({ has: alice.page.locator("#rm-public") }).click();
  assert.equal(await alice.page.locator("#rm-public").isChecked(), true);
  await alice.page.locator("#rm-create-btn").click();
  await expectText(alice.page, "#room-name", room);
  await waitFor("The creator should publish the public room card", () => fixture.hasPublicRoom(room), 15000);
  await leaveRooms([alice]);
  await bob.page.locator("#friend-search").fill(room);
  const result = bob.page.locator("#search-results .sr-item").filter({ hasText: room });
  await result.getByRole("button", { name: "Войти", exact: true }).click();
  await expectText(bob.page, "#room-name", room);
  await expectText(bob.page, "#people-count", "1");
  await expectText(bob.page, "#waiting-title", "Поиск участников");
  assert.equal(await bob.page.locator("#waiting").isVisible(), true);
  await assertNoDirectConnection(bob);
  console.log("PASS signed public room opens from the catalogue and waits without a live participant");
}

async function diagnostics(peers, fixture) {
  console.error("Local relay:", JSON.stringify({
    ...fixture.summary, profiles: fixture.profileCount(), vaults: fixture.vaultCount(),
    heartbeatAgesSec: [...fixture.presenceTimes().values()].map((time) => Math.floor(Date.now() / 1000) - time),
  }));
  for (const peer of peers) {
    const ui = await peer.page.evaluate(() => {
      const text = (id) => document.getElementById(id)?.textContent.trim().slice(0, 300);
      return {
        onboarding: text("ob-error"), onboardingNetwork: text("ob-nick-state"), search: text("search-results"),
        online: text("online-count"), room: text("room-name"), participants: text("people"),
        messages: text("messages"),
        roomNetwork: text("net-text"), toasts: text("toasts"),
        rtc: Array.from(new Set(window.pulseTestPeers.map((pc) => pc.connectionState))),
        directObserved: window.pulseTestDirectConnection, clockAdvanceMs: window.pulseTestClockAdvance,
      };
    }).catch(() => ({}));
    console.error(peer.name + ":", JSON.stringify({
      ...peer.traffic, errors: peer.errors, ...ui,
    }));
  }
}

await readFile(join(root, "index.html"));
const fixture = await startFixture();
let browser;
let peers = [];
let stage = "browser startup";
try {
  browser = await chromium.launch({
    executablePath: browserExecutable,
    args: [
      "--no-proxy-server", "--disable-background-networking",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    ],
  });
  const policy = { allowDefaults: options.mode !== "bootstrap" };
  const alice = await openPeer(browser, fixture, "Loopback Alice", "loopback_alice", policy);
  const bob = await openPeer(browser, fixture, "Loopback Bob", "loopback_bob", policy);
  peers = [alice, bob];
  console.log("Pulse web root:", root);
  console.log("Relay mode:", options.mode);
  stage = "fresh account onboarding and publishing";
  await Promise.all(peers.map((peer) => peer.page.goto(fixture.base)));
  await Promise.all(peers.map(onboard));
  await waitFor("Both accounts must publish a profile and a vault to the local relay", () =>
    fixture.profileCount() === 2 && fixture.vaultCount() === 2, 10000,
  );
  console.log("PASS two independent accounts created through onboarding and published profiles");

  if (options.mode === "custom") {
    stage = "saving the custom relay through Settings";
    await Promise.all(peers.map((peer) => selectCustomRelay(peer, fixture.url)));
    stage = "account network after restart with bundled relays unavailable";
    policy.allowDefaults = false;
    for (const peer of peers) peer.traffic = relayStats();
    await Promise.all(peers.map((peer) => peer.page.reload()));
    await Promise.all(peers.map((peer) => expectText(peer.page, "#w-id", "@" + peer.nick)));
    await waitFor("Both accounts must query kind 30078 on the sole custom relay after restart", () =>
      peers.every((peer) => peer.traffic.customAppRequests > 0), 12000,
    );
    console.log("PASS saved custom relay serves account traffic on both restarted profiles");
  }
  if (options.mode === "bootstrap") {
    assert(peers.every((peer) => peer.traffic.customAppRequests > 0));
    console.log("PASS fresh onboarding used the preconfigured local relay");
  }

  stage = "search, friendship acceptance, and mutual presence";
  await addAndAccept(alice, bob);
  console.log("PASS @nick search, friend request, acceptance, and mutual online status");
  if (options.presence) {
    stage = "relay-only presence, heartbeat expiry, and signaling recovery";
    await relayOnlyPresence(alice, bob, fixture);
  }
  const friendSearchResults = await Promise.allSettled([
    findExistingFriend(alice, bob), findExistingFriend(bob, alice),
  ]);
  const friendSearchErrors = friendSearchResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  if (friendSearchErrors.length === 0) {
    console.log("PASS existing friends are searchable by exact @nick from both profiles");
  } else {
    for (const error of friendSearchErrors) console.error("FAIL " + error);
  }

  if (options["room-recovery"]) fixture.pauseRoomRelay();
  const methods = options.join === "both" ? ["invite", "code"] : [options.join];
  for (const [index, method] of methods.entries()) {
    stage = "joining the same private room by " + method + " and exchanging room chat";
    if (index > 0) await leaveRooms(peers);
    await joinRoom(alice, bob, method);
  }
  if (options["room-recovery"]) {
    stage = "direct room audio";
    await verifyDirectAudio(peers);
    stage = "unknown room code";
    await rejectsAbsentRoom(bob);
    stage = "relay-only join and a restart with the guest arriving before the creator";
    await roomRecovery(alice, bob, fixture);
    stage = "a signed public room with no live peer";
    await publicRoomWithoutPeers(alice, bob, fixture);
  }
  stage = "confirming both browsers sent local signaling";
  assert(fixture.summary.signaling > 0, "The local relay must receive actual signaling traffic");
  assert(peers.every((peer) => peer.traffic.signaling > 0), "Both contexts must publish signaling");
  if (friendSearchErrors.length > 0) {
    stage = "searching existing friends by exact @nick";
    throw new Error(friendSearchErrors.join("\n"));
  }
  console.log("PASS end-to-end Pulse regression");
} catch (error) {
  console.error("FAIL during " + stage);
  console.error(error.message);
  await diagnostics(peers, fixture);
  process.exitCode = 1;
} finally {
  for (const peer of peers) {
    for (const socket of peer.aliases) socket.terminate();
  }
  await browser?.close();
  await fixture.close();
}

