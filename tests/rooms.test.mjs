import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../web/js/chunk-ITVMY7Q3.js", import.meta.url), "utf8");
const roomCode = "pulse-23456789ABCDabcd23456789";
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};

function sourceBetween(start, end) {
  const first = source.indexOf(start);
  assert.notEqual(first, -1, "Missing room code section: " + start);
  const last = source.indexOf(end, first + start.length);
  assert.notEqual(last, -1, "Missing room code section end: " + end);
  return source.slice(first, last);
}

test("room discovery accepts a peer whose clock is briefly behind", () => {
  const relayRequests = [];
  const time = 1_700_000_000;
  const relay = { url: "wss://test.invalid", send: request => relayRequests.push(JSON.parse(request)) };
  const connection = { topics: new Map([["room", noop]]), subIds: [], pendingEose: new Set() };
  const helpers = runInNewContext(
    "var " + sourceBetween("ds = () =>", ", us =") + ", " + sourceBetween("fs = (e) =>", ", gs =") + "; ({ ds, fs })",
    {
      Ke: { [relay.url]: connection }, De: JSON.stringify, It: () => "subscription", cs: 250, us: () => 23456,
      Date: { now: () => (time + 80) * 1000 }, networkNow: () => time * 1000,
    },
  );
  helpers.fs(relay);
  assert.equal(relayRequests.length, 1);
  const [, , filter] = relayRequests[0];
  assert.deepEqual(filter["#x"], ["room"]);
  assert.ok(filter.since <= time - 240, "A recent announcement should match the requested window");
  assert.ok(filter.since >= time - 360, "The replay window should stay bounded");
  assert.equal(helpers.ds(), time, "New events should use the network-adjusted clock");
});

test("pasting a copied invite uses its code line even if the room name looks like a code", () => {
  const parse = runInNewContext("var " + sourceBetween("Dd = new RegExp", ", Md =") + "; xs", { kl: "[1-9A-HJ-NP-Za-km-z]" });
  const name = "pulse-ABCDEFGHJKLMNPQRSTUVWXYZ";
  assert.equal(parse("Залетай в Pulse — комната «" + name + "»\r\nКод: " + roomCode), roomCode);
  assert.equal(parse("Залетай в Pulse — комната «" + name + "»\r\nКод: " + roomCode + "\r\nЗайди сейчас"), roomCode);
  assert.equal(parse(" " + roomCode + " "), roomCode);
  assert.equal(parse(roomCode + "Z".repeat(40)), null);
  assert.equal(parse("not-" + roomCode), null);
  assert.equal(parse(roomCode + "-suffix"), null);
  assert.equal(parse(roomCode + "\nКод: неверный"), null);
});

test("room chat verifies and forwards original signed time when the peer clock is ahead", async () => {
  const now = 1_700_000_000_000;
  const algorithm = { name: "ECDSA", hash: "SHA-256" };
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = Buffer.from(await crypto.subtle.exportKey("spki", pair.publicKey)).toString("base64");
  const incoming = {
    id: "12345678", ts: now + 120_000, kind: "text", text: "A message from the faster peer",
    name: "Friend", color: "#123abc", pub,
  };
  const signed = ["pulse-msg-v2", incoming.id, incoming.ts, "text", incoming.text, null, "Friend", "#123abc", pub, null];
  incoming.sig = Buffer.from(await crypto.subtle.sign(algorithm, pair.privateKey, Buffer.from(JSON.stringify(signed)))).toString("base64");
  const { xa, Mo, lr } = runInNewContext(sourceBetween("var bu =", ", Ao =") + "; ({ xa, Mo, lr })", {
    Date: { now: () => now }, Gn: () => now, ct: value => value, hr: () => true, Ds: () => null,
    al: (key, signature, canonical) => key === pub && crypto.subtle.verify(algorithm, pair.publicKey, Buffer.from(signature, "base64"), Buffer.from(canonical)),
  });
  const received = xa(incoming);
  assert.equal(await Mo(received), true, "The signed time must remain eligible for signature verification");
  assert.equal(received.ts, now + 60_000, "Presentation should keep the existing future-time clamp");
  const forwarded = lr(received);
  assert.equal(forwarded.ts, incoming.ts, "A synchronized peer needs the original signed time");
  assert.equal(await Mo(xa(forwarded)), true);
});

function friendsHarness({ direct, mail }) {
  const friend = { pub: "friend", npub: "mail-friend", dhPub: "public-key", name: "Friend" };
  const connection = {
    actions: new Map(),
    makeAction(name) {
      const action = { send: name === "invite" ? direct : noop };
      this.actions.set(name, action);
      return action;
    },
  };
  const createFriends = runInNewContext(
    "var " + sourceBetween("_d = ({ settings:", ", ve =") + "; _d",
    {
      pe: { get: (name, fallback) => name === "friends" ? [friend] : fallback, set: noop },
      Ee: () => ({ friendCode: "self" }),
      Ss: async code => code.startsWith("dm-") ? connection : { makeAction: () => ({}) },
      nl: async () => "shared", Kn: async () => friend, yt: value => value, networkNow: Date.now,
    },
  );
  const friends = createFriends({ settings: {}, getProfile: () => ({}), events: {}, media: {}, mail: { invite: mail } });
  return { friend, friends, connection };
}

test("a room invite uses encrypted mail without requiring direct presence", async () => {
  const deliveries = [];
  const { friend, friends } = friendsHarness({ mail: async (recipient, payload) => {
    deliveries.push([recipient, payload.code, payload.name]);
    return true;
  } });
  assert.equal(await friends.invite(friend.pub, roomCode, "Music"), true);
  assert.deepEqual(deliveries, [[friend, roomCode, "Music"]]);
});

for (const directFailures of [false, true]) {
  test(directFailures ? "a direct invite with no delivered bytes falls back to mail" : "a completed direct send avoids a duplicate encrypted invite", async () => {
    const attempts = [];
    const { friend, friends, connection } = friendsHarness({
      direct: async (payload, { target, onProgress }) => {
        attempts.push(["direct", target, payload.code, payload.name]);
        if (!directFailures) onProgress(1);
      },
      mail: async (recipient, payload) => {
        attempts.push(["mail", recipient.pub, payload.code, payload.name]);
        return true;
      },
    });
    await friends.start();
    await nextTurn();
    await connection.actions.get("hi").onMessage(friend, { peerId: "peer" });
    assert.equal(await friends.invite(friend.pub, roomCode, "Music"), true);
    const directAttempt = [["direct", "peer", roomCode, "Music"]];
    if (directFailures) directAttempt.push(["mail", friend.pub, roomCode, "Music"]);
    assert.deepEqual(attempts, directAttempt);
  });
}

test("an invite remains pending until delivery is accepted", async () => {
  const ack = Promise.withResolvers();
  const room = { code: roomCode, record: { name: "Music" }, invited: new Set(), invitePending: new Set() };
  const notifications = [];
  const invite = runInNewContext(sourceBetween("var pa =", ", ge =") + "; pa", {
    l: room, W: { get: () => ({ name: "Friend" }), invite: () => ack.promise }, wo: noop,
    H: (message, tone) => notifications.push([message, tone]),
  });
  const pending = invite("friend");
  assert.equal(notifications.length, 0);
  assert.equal(room.invited.has("friend"), false);
  ack.resolve(true);
  assert.equal(await pending, true);
  assert.equal(room.invited.has("friend"), true);
  assert.equal(notifications[0][1], "ok");
});

function roomEntryHarness({ saved = [], settings = {}, verify }) {
  const entries = [];
  const notifications = [];
  const records = [...saved];
  const open = runInNewContext("var " + sourceBetween("Sn = async", ", Qn =") + "; Sn", {
    l: null, nt: records, v: settings, oa: noop, kt: noop, rt: noop, roomEntryPending: false,
    isRoomCode: value => value === roomCode, Qt: { getPool: noop },
    Ee: noop, at: noop, ct: value => value, traceRoom: noop,
    watchDirectRoomPeer: noop, watchVoiceRoomPeer: noop, verifyRoomEntry: verify,
    H: (message, tone) => notifications.push([message, tone]),
    xn: (code, name, icon, created) => {
      const record = { code, name, icon, created };
      records.push(record);
      return record;
    },
    ha: async (code, options) => {
      entries.push({ code, record: options?.record });
      return true;
    },
  });
  return { open, entries, records, notifications };
}

test("an unsaved code stays out of the room list while confirmation is pending or missing", async () => {
  const confirmation = Promise.withResolvers();
  const app = roomEntryHarness({ verify: () => confirmation.promise });
  const opening = app.open(roomCode, { name: "From an invitation" });
  await nextTurn();
  assert.equal(app.entries.length, 0);
  assert.equal(app.records.length, 0);
  confirmation.resolve({ status: "not-found" });
  assert.equal(await opening, false);
  assert.equal(app.entries.length, 0);
  assert.equal(app.records.length, 0);
  assert.match(app.notifications[0][0], /открыть комнату/i);
});

test("failed relay lookup reports an unverified code", async () => {
  const app = roomEntryHarness({ verify: async () => ({ status: "unavailable" }) });
  assert.equal(await app.open(roomCode), false);
  assert.equal(app.records.length, 0);
  assert.match(app.notifications[0][0], /проверить код/i);
});

test("room code verification respects the disabled reserve voice setting", async () => {
  const app = roomEntryHarness({
    settings: { reserveVoice: false },
    async verify(options) {
      assert.equal(options.watchVoicePeer, undefined);
      assert.equal(typeof options.watchDirectPeer, "function");
      return { status: "unavailable" };
    },
  });
  assert.equal(await app.open(roomCode), false);
});

test("an authenticated live room is saved only after confirmation", async () => {
  const confirmation = Promise.withResolvers();
  const app = roomEntryHarness({ verify: () => confirmation.promise });
  const opening = app.open(roomCode, { name: "Music" });
  assert.equal(app.records.length, 0);
  confirmation.resolve({ status: "live" });
  assert.equal(await opening, true);
  assert.equal(app.entries[0].record, app.records[0]);
  assert.equal(app.records[0].name, "Music");
  assert.equal(app.records[0].code, roomCode);
});

test("a saved room or a newly created room opens while its peer is offline", async () => {
  const saved = { code: roomCode, name: "Music" };
  const failIfQueried = () => assert.fail("The saved room or host must be able to wait alone");
  const guest = roomEntryHarness({ saved: [saved], verify: failIfQueried });
  const host = roomEntryHarness({ verify: failIfQueried });
  assert.equal(await guest.open(roomCode), true);
  assert.equal(guest.entries[0].record, saved);
  assert.equal(await host.open(roomCode, { name: "Music", create: true, pub: true }), true);
  assert.equal(host.entries[0].record, host.records[0]);
  assert.equal(host.records[0].pub, true);
});

test("cancelling a pending code check cannot open or save the room afterwards", async () => {
  const confirmation = Promise.withResolvers();
  const cancellation = new AbortController();
  const app = roomEntryHarness({ verify: () => confirmation.promise });
  const opening = app.open(roomCode, { signal: cancellation.signal });
  cancellation.abort();
  confirmation.resolve({ status: "live" });
  assert.equal(await opening, false);
  assert.equal(app.records.length, 0);
  assert.equal(app.entries.length, 0);
});

function roomHarness({ connect, microphone = async () => {} }) {
  const register = [];
  const roomMessages = [];
  const bridge = runInNewContext(
    sourceBetween("var ru =", '\nc("btn-leave")') + "; ({ enter: ha, leave: kt, active: () => l })",
    {
      l: null, Nt: false, v: { joinMuted: true }, V: { type: "room" }, aa: null,
      K: { resume: noop, stopMic: noop, detachPeer: noop },
      c: () => ({ replaceChildren: noop }), Sa: new Map(), We: new Map(), Jt: new Map(),
      Ka: async () => "hash", Oa: value => value, xn: code => ({ code, name: "Music" }),
      rt: noop, oa: noop, Ia: message => roomMessages.push(message), Ss: connect, mu: microphone, H: noop,
      he: { setInCall: noop }, iu: () => register.push("actions installed"),
      xe: noop, Je: noop, st: noop, Ae: noop, bt: noop, He: noop, startRoomChatRelay: noop,
      Mu: noop, Au: noop, Fo: noop, zo: noop, Ea: noop, or: noop, vo: noop,
      wt: noop, Wt: noop, cr: { cancelRecording: noop, setReply: noop },
      setInterval: () => 1, setTimeout: () => 2, clearInterval: noop, clearTimeout: noop,
    }
  );
  return { ...bridge, register, roomMessages };
}

test("opening a saved room describes participant discovery before any remote peer joins", async () => {
  const room = roomHarness({ connect: async () => ({ leave: async () => {} }) });
  await room.enter(roomCode);
  assert.equal(room.active().code, roomCode);
  assert.equal(room.active().peers.size, 0);
  assert.match(room.roomMessages.at(-1), /поиск участников/i);
});

function roomStatusHarness(openRelayCount) {
  const room = { code: roomCode, record: { ephemeral: false }, peers: new Map(), joinErrors: new Set() };
  const nodes = new Map();
  const dom = id => {
    if (!nodes.has(id)) {
      const element = { textContent: "" };
      element.classList = { toggle: (key, forced) => { if (key === "hidden") element.hidden = forced; } };
      nodes.set(id, element);
    }
    return nodes.get(id);
  };
  const hooks = runInNewContext(
    "var " + sourceBetween("Fo = () =>", ", zo =") + ", " + sourceBetween("au = ({ error:", ", kt =") + "; ({ Fo, au })",
    { l: room, Yr: () => ({ open: openRelayCount, total: 8 }), c: dom, console: { warn: noop }, H: noop, roomRelayOnlyPeers: () => [] },
  );
  return { room, render: hooks.Fo, fail: hooks.au, dom };
}

test("an empty room stays open and explains that discovery is still running", () => {
  const ui = roomStatusHarness(8);
  ui.room.waitedForPeers = true;
  ui.render();
  assert.equal(ui.room.code, roomCode);
  assert.equal(ui.dom("waiting-title").textContent, "Пока в комнате только ты");
  assert.match(ui.dom("waiting-detail").textContent, /продолжает поиск/i);
  assert.equal(ui.dom("waiting-network").hidden, false);
});

test("an empty room separates missing relay connections from a failed peer handshake", () => {
  const disconnected = roomStatusHarness(0);
  disconnected.room.waitedForPeers = true;
  disconnected.render();
  assert.equal(disconnected.dom("waiting-title").textContent, "Узлы поиска недоступны");

  const handshake = roomStatusHarness(8);
  handshake.fail({ peerId: "peer", error: "could not connect to peer after exchanging SDP" });
  assert.equal(handshake.dom("waiting-title").textContent, "Подключение к участнику не удалось");
  assert.match(handshake.dom("waiting-detail").textContent, /TURN/);
  assert.equal(handshake.dom("waiting-network").hidden, false);
});

test("a public directory result stays in the waiting UI when peer transports are offline", async () => {
  const guest = roomEntryHarness({ verify: async () => ({ status: "public", room: { name: "Public Room" } }) });
  assert.equal(await guest.open(roomCode), true);
  assert.equal(guest.records[0].name, "Public Room");
  assert.equal(guest.records[0].pub, undefined, "The visitor must not republish the room as its owner");

  const opening = roomHarness({ connect: async () => ({ leave: async () => {} }) });
  await opening.enter(roomCode, { record: guest.records[0] });
  assert.equal(opening.active().peers.size, 0);
  assert.match(opening.roomMessages.at(-1), /поиск участников/i);
  const status = roomStatusHarness(0);
  status.room.record = opening.active().record;
  status.render();
  assert.equal(status.dom("waiting-title").textContent, "Поиск участников");
  assert.equal(status.dom("waiting-detail").textContent, "Ждём подключения к узлам поиска.");
});

test("room discovery and chat handlers start while microphone permission is pending", async () => {
  const microphone = Promise.withResolvers();
  const peerRoom = { leave: async () => {} };
  const room = roomHarness({ connect: async () => peerRoom, microphone: () => microphone.promise });
  const opening = room.enter(roomCode);
  await nextTurn();
  assert.equal(room.active().room, peerRoom);
  assert.deepEqual(room.register, ["actions installed"]);
  microphone.resolve();
  await opening;
});

test("quick rejoin waits for a pending connection to leave before opening the same room", async () => {
  const firstConnection = Promise.withResolvers();
  const operations = [];
  const room = roomHarness({ connect: async () => {
    operations.push("connect");
    return operations.length === 1 ? firstConnection.promise : { leave: async () => {} };
  } });
  const first = room.enter(roomCode);
  await nextTurn();
  const leaving = room.leave();
  const second = room.enter(roomCode);
  await nextTurn();
  assert.deepEqual(operations, ["connect"]);
  firstConnection.resolve({ leave: async () => operations.push("leave") });
  await Promise.all([first, leaving, second]);
  assert.deepEqual(operations, ["connect", "leave", "connect"]);
});

test("a microphone granted after leaving is stopped without reopening audio", async () => {
  const microphone = Promise.withResolvers();
  let stopped = false;
  const track = { stop: () => { stopped = true; }, clone: () => ({}) };
  const audio = runInNewContext("(" + sourceBetween("$d = class {", ", qt =").replace("$d = ", "") + ")", {
    navigator: { mediaDevices: { getUserMedia: () => microphone.promise } },
    MediaStream: class {},
  });
  const engine = Object.create(audio.prototype);
  const node = { gain: {}, connect: noop };
  engine.ctx = {
    createMediaStreamSource: () => node, createAnalyser: () => node, createGain: () => node,
    createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [{}] } }),
  };
  const opening = engine.startMic({});
  engine.stopMic();
  microphone.resolve({ getTracks: () => [track], getAudioTracks: () => [track] });
  await opening;
  assert.equal(stopped, true);
  assert.equal(engine.mic, undefined);
});
