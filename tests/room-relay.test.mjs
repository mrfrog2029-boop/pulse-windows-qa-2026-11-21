import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { b64, open, seal, newSecret, signEvent, roomEvent } from '../web/js/net.js';

const code = 'pulse-23456789ABCDabcd23456789';
const otherCode = 'pulse-23456789ABCDabcd23456788';
const signing = { name: 'ECDSA', namedCurve: 'P-256' };
const digest = { name: 'ECDSA', hash: 'SHA-256' };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = (value) => encoder.encode(JSON.stringify(value));

class Relay {
  pools = [];
  published = [];

  pool(isOnline = true) {
    const relay = this;
    const subscriptions = new Set();
    const listeners = new Set();
    let online = isOnline;
    const pool = {
      subscriptions, listeners, stopped: false,
      openCount: () => Number(online),
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setOnline(open) {
        online = open;
        for (const listener of listeners) listener(Number(open));
      },
      stop() {
        this.stopped = true;
        this.setOnline(false);
      },
      subscribe(filter, { onEvent }) {
        const entry = { filter, onEvent };
        subscriptions.add(entry);
        return () => subscriptions.delete(entry);
      },
      async publish(event) {
        if (!online) return { ok: 0, failed: 0 };
        relay.published.push(event);
        relay.deliver(event);
        return { ok: 1, failed: 0 };
      },
    };
    this.pools.push(pool);
    return pool;
  }

  deliver(event) {
    for (const pool of this.pools) {
      if (pool.openCount()) for (const { filter, onEvent } of pool.subscriptions) {
        if (filter.kinds?.includes(event.kind) && event.tags.some(([k, v]) => k === 't' && filter['#t'].includes(v))) {
          onEvent(event);
        }
      }
    }
  }
}

async function makeIdentity() {
  const [pair, dh] = await Promise.all([
    crypto.subtle.generateKey(signing, true, ['sign', 'verify']),
    crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
  ]);
  return {
    pair, pub: b64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    dhPub: b64(new Uint8Array(await crypto.subtle.exportKey('raw', dh.publicKey))),
  };
}

async function join(t, relay, name, options = {}) {
  const { openRoomRelay } = await import('../web/js/room-relay.js');
  const identity = options.identity ?? await makeIdentity();
  const profile = { name, color: '#ba9977', avatar: 'private avatar', nick: 'private nick' };
  const pool = options.pool ?? relay.pool();
  const peers = new Map();
  const chat = [];
  const leaves = [];
  const transport = await openRoomRelay({
    code: options.code ?? code, pool, identity, profile,
    onPeer: (peer, session) => peers.set(session, peer),
    onLeave: (session) => { leaves.push(session); peers.delete(session); },
    onText: (message, session) => chat.push({ message, session }),
  });
  t.after(() => transport.close());
  return { identity, profile, pool, peers, chat, leaves, transport };
}

async function waitFor(condition) {
  const deadline = performance.now() + 4500;
  while (!condition()) {
    assert.ok(performance.now() < deadline, 'Timed out waiting for relay traffic');
    await setImmediate();
  }
}

async function idle() {
  // Allow WebCrypto operations queued by the fake relay to complete.
  await new Promise((resolve) => setTimeout(resolve, 75));
}

async function signedText({ identity, profile }, text, overrides = {}) {
  const message = {
    id: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('hex'),
    ts: Date.now(), kind: 'text', text, name: profile.name, color: profile.color,
    pub: identity.pub, reply: { id: '12345678', name: 'Другой', text: 'Цитата' }, ...overrides,
  };
  const proof = ['pulse-msg-v2', message.id, message.ts, message.kind, message.text, null,
    message.name, message.color, message.pub, message.reply?.id ?? null];
  message.sig = b64(new Uint8Array(await crypto.subtle.sign(digest, identity.pair.privateKey, encode(proof))));
  return message;
}

test('a relay-only invitation requires a fresh authenticated peer, regardless of who opens first', async (t) => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const relay = new Relay();
  const host = await join(t, relay, 'Alice');
  const visitorPool = relay.pool();
  visitorPool.query = async () => [];
  const identity = await makeIdentity();
  const options = { code, pool: visitorPool, identity, profile: { name: 'Boris' }, timeout: 1500 };
  assert.equal((await verifyRoomEntry(options)).status, 'live');
  await waitFor(() => host.peers.size === 0);

  await host.transport.close();
  const returning = verifyRoomEntry(options);
  const reopened = await join(t, relay, 'Alice', { identity: host.identity });
  assert.equal((await returning).status, 'live');
  await waitFor(() => reopened.peers.size === 0);
  assert.equal(visitorPool.listeners.size, 0);
  assert.equal(visitorPool.subscriptions.size, 0);
});

test('successful relay acknowledgements alone do not confirm a wrong room code', async (t) => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const relay = new Relay();
  const host = await join(t, relay, 'Alice');
  const pool = relay.pool();
  pool.query = async () => [];
  const result = await verifyRoomEntry({ code: otherCode, pool, identity: await makeIdentity(), timeout: 100 });
  assert.equal(result.status, 'not-found');
  assert.equal(host.peers.size, 0);
  assert.equal(pool.subscriptions.size, 0);
});

test('a second device with the same identity cannot confirm a new room as a separate participant', async (t) => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const relay = new Relay();
  const host = await join(t, relay, 'Alice');
  const pool = relay.pool();
  pool.query = async () => [];
  const result = await verifyRoomEntry({ code, pool, identity: host.identity, timeout: 150 });
  assert.equal(result.status, 'not-found');
});

test('a signed public directory card can confirm a room with no live participants', async () => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const relay = new Relay();
  const pool = relay.pool();
  const secret = newSecret();
  const publicRoom = await roomEvent(secret, { code, name: 'Public Room' });
  const unrelated = await roomEvent(secret, { code: otherCode, name: 'Another Room' });
  pool.query = async () => [unrelated, publicRoom];
  const result = await verifyRoomEntry({ code, pool, identity: await makeIdentity(), timeout: 500 });
  assert.equal(result.status, 'public');
  assert.equal(result.room.name, 'Public Room');
});

test('a damaged, hidden or unrelated public card cannot confirm a room', async () => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const relay = new Relay();
  const pool = relay.pool();
  const secret = newSecret();
  const publicRoom = await roomEvent(secret, { code, name: 'Public Room' });
  const hidden = signEvent(secret, { ...await roomEvent(secret, { code, hidden: true }), created_at: publicRoom.created_at + 1 });
  const damaged = { ...await roomEvent(newSecret(), { code, name: 'Another Publication' }), sig: '0'.repeat(128) };
  const unrelated = await roomEvent(secret, { code: otherCode, name: 'Another Room' });
  pool.query = async () => [unrelated, publicRoom, damaged, hidden];
  const result = await verifyRoomEntry({ code, pool, identity: await makeIdentity(), timeout: 100 });
  assert.equal(result.status, 'not-found');
});

test('a room lookup with no relay reply reports unavailable and releases its subscriptions', async () => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const pool = new Relay().pool(false);
  pool.query = async () => { throw new Error('Relay unavailable'); };
  const result = await verifyRoomEntry({ code, pool, identity: await makeIdentity(), timeout: 100 });
  assert.equal(result.status, 'unavailable');
  assert.equal(pool.subscriptions.size, 0);
  assert.equal(pool.listeners.size, 0);
});

test('an authenticated reserve-voice peer can confirm a room after relay discovery times out', async () => {
  const { verifyRoomEntry } = await import('../web/js/room-relay.js');
  const pool = new Relay().pool(false);
  pool.query = async () => { throw new Error('Relay unavailable'); };
  let closed = false;
  const result = await verifyRoomEntry({
    code, pool, identity: await makeIdentity(), timeout: 100,
    async watchVoicePeer(onPeer) {
      const timer = setTimeout(onPeer, 120);
      return { ready: Promise.resolve(), close() { closed = true; clearTimeout(timer); } };
    },
  });
  assert.deepEqual(result, { status: 'live', transport: 'voice' });
  assert.equal(closed, true);
});

test('one room discovers live signed profiles and exchanges unchanged signed text without WebRTC', async (t) => {
  const relay = new Relay();
  const [a, b, foreign] = await Promise.all([
    join(t, relay, 'Алиса'), join(t, relay, 'Борис'), join(t, relay, 'Другой', { code: otherCode }),
  ]);
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  const [bSession, bProfile] = [...a.peers][0];
  const [aSession, aProfile] = [...b.peers][0];
  assert.equal(foreign.peers.size, 0);
  assert.notEqual(aSession, bSession);
  assert.deepEqual(bProfile, { pub: b.identity.pub, dhPub: b.identity.dhPub, name: 'Борис', color: '#ba9977' });
  assert.deepEqual(aProfile, { pub: a.identity.pub, dhPub: a.identity.dhPub, name: 'Алиса', color: '#ba9977' });

  const outgoing = await signedText(a, 'Секретный текст комнаты');
  const incoming = await signedText(b, 'Ответ доступен без RTC');
  assert.equal(await a.transport.sendText(outgoing), true);
  assert.equal(await b.transport.sendText(incoming), true);
  await waitFor(() => a.chat.length === 1 && b.chat.length === 1);
  assert.deepEqual(a.chat, [{ message: incoming, session: bSession }]);
  assert.deepEqual(b.chat, [{ message: outgoing, session: aSession }]);
  assert.deepEqual(foreign.chat, []);

  const wire = JSON.stringify(relay.published);
  for (const plaintext of [code, otherCode, incoming.text, outgoing.text, a.identity.pub, b.identity.dhPub, 'Алиса', 'Борис', 'private avatar']) {
    assert.ok(!wire.includes(plaintext), `${plaintext} escaped encryption`);
  }
  for (const event of relay.published) {
    assert.ok(event.kind >= 20_000 && event.kind < 30_000);
    assert.ok(event.tags.some(([tag, expire]) => tag === 'expiration' && Number(expire) > event.created_at));
  }
  assert.equal([...a.pool.subscriptions][0].filter.limit, 0);

  a.transport.updateProfile({ name: 'Алиса 2', color: '#123abc' });
  await waitFor(() => b.peers.get(aSession)?.name === 'Алиса 2');
  assert.equal(b.peers.get(aSession).color, '#123abc');
});

test('retained ciphertext from a previous session cannot create a member or replay chat', async (t) => {
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  const b = await join(t, relay, 'Boris');
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  assert.equal(await a.transport.sendText(await signedText(a, 'Old message')), true);
  await waitFor(() => b.chat.length === 1);
  const history = structuredClone(relay.published);
  a.pool.setOnline(false);
  b.pool.setOnline(false);
  const newcomer = await join(t, relay, 'Newcomer');
  for (const event of history) relay.deliver(event);
  await idle();
  assert.equal(newcomer.peers.size, 0);
  assert.equal(newcomer.chat.length, 0);
});

test('reconnect rediscovers live members and a clean leave removes a member', async (t) => {
  const relay = new Relay();
  const b = await join(t, relay, 'Boris');
  const pool = relay.pool(false);
  const a = await join(t, relay, 'Alice', { pool });
  pool.setOnline(true);
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  const [aSession] = b.peers.keys();
  const oldPackets = structuredClone(relay.published);
  pool.setOnline(false);
  await waitFor(() => a.leaves.length === 1);
  b.pool.setOnline(false);
  pool.setOnline(true);
  for (const event of oldPackets) relay.deliver(event);
  await idle();
  assert.equal(a.peers.size, 0);

  b.pool.setOnline(true);
  await waitFor(() => a.peers.size === 1 && b.peers.has(aSession));
  const previousLeaves = b.leaves.length;
  await a.transport.close();
  assert.equal(pool.subscriptions.size, 0);
  assert.equal(pool.listeners.size, 0);
  assert.equal(pool.stopped, false);
  await waitFor(() => b.leaves.length === previousLeaves + 1);
  assert.equal(b.leaves.at(-1), aSession);
  assert.equal(b.peers.size, 0);
  assert.equal(await a.transport.sendText(await signedText(a, 'after leave')), false);
});

test('a newly opened common relay triggers discovery before the next heartbeat', async (t) => {
  const relay = new Relay();
  const host = await join(t, relay, 'Alice');
  const visitorPool = relay.pool(false);
  let open = 0;
  const publish = visitorPool.publish;
  visitorPool.openCount = () => open;
  visitorPool.publish = async event => {
    if (open === 1) {
      relay.published.push(event);
      return { ok: 1, failed: 0 };
    }
    return publish(event);
  };
  const visitor = await join(t, relay, 'Boris', { pool: visitorPool });
  await idle();
  const previous = relay.published.length;
  open = 1;
  visitorPool.setOnline(true);
  await waitFor(() => relay.published.length > previous);
  open = 2;
  for (const listener of visitorPool.listeners) listener(open);
  await waitFor(() => host.peers.size === 1 && visitor.peers.size === 1);
});

test('invalid and non-text payloads never leave the local room transport', async (t) => {
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  const b = await join(t, relay, 'Boris');
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  await idle();
  const before = relay.published.length;
  const text = await signedText(a, 'One');
  const otherSigner = await signedText(b, 'From someone else');
  assert.equal(await a.transport.sendText({ ...text, text: 'Tampered' }), false);
  assert.equal(await a.transport.sendText(otherSigner), false);
  assert.equal(await a.transport.sendText(await signedText(a, 'A recording', { kind: 'voice' })), false);
  assert.equal(await a.transport.sendText({ ...text, file: { data: 'bytes' } }), false);
  assert.equal(await a.transport.sendText({ ...text, text: 'A'.repeat(4001) }), false);
  assert.equal(relay.published.length, before);
  assert.deepEqual(b.chat, []);
});

test('knowing the room code cannot authenticate forged room or chat signatures', async (t) => {
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  const b = await join(t, relay, 'Boris');
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  const text = await signedText(a, 'A valid message');
  await a.transport.sendText(text);
  const event = relay.published.at(-1);
  await waitFor(() => b.chat.length === 1);

  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(`pulse-room-relay-key-v1:${code}`)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const [body, proof] = JSON.parse(decoder.decode(await open(key, event.content)));
  const [session, sequence, type, profile] = JSON.parse(body);
  const [, [, expiration]] = event.tags;
  const topic = event.tags[0][1];
  const unsignedBody = JSON.stringify([session, sequence + 1, type, profile, { ...text, id: '98765432', text: 'Forged room envelope' }]);
  const forgedEnvelope = await seal(key, encode([unsignedBody, proof]));
  relay.deliver(signEvent(newSecret(), { kind: event.kind, tags: event.tags, created_at: event.created_at, content: forgedEnvelope }));

  const signedBody = JSON.stringify([session, sequence + 2, type, profile, { ...text, id: '87654321', text: 'Forged chat signature' }]);
  const signedEnvelope = encode(['pulse-room-relay-proof-v1', topic, event.kind, event.pubkey, event.created_at, Number(expiration), signedBody]);
  const freshProof = b64(new Uint8Array(await crypto.subtle.sign(digest, a.identity.pair.privateKey, signedEnvelope)));
  const content = await seal(key, encode([signedBody, freshProof]));
  relay.deliver({ ...event, id: 'a'.repeat(64), content });
  relay.deliver(event);
  relay.deliver({ ...event, id: 'b'.repeat(64) });
  await idle();
  assert.deepEqual(b.chat.map(({ message }) => message.text), ['A valid message']);
});

test('stopping the shared pool immediately releases room listeners', async (t) => {
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  const otherSubscription = a.pool.subscribe({}, { onEvent() {} });
  a.pool.stop();
  assert.equal(a.pool.subscriptions.size, 1);
  assert.equal(a.pool.listeners.size, 0);
  assert.equal(await a.transport.sendText(await signedText(a, 'after pool stop')), false);
  otherSubscription();
});

test('a vanished peer expires even when relays replay its recent packets', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.now() });
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  const b = await join(t, relay, 'Boris');
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  const [departed] = a.peers.keys();
  const history = structuredClone(relay.published);
  b.pool.setOnline(false);
  t.mock.timers.tick(25_000);
  for (const event of history) relay.deliver(event);
  await idle();
  assert.equal(a.peers.size, 1);
  t.mock.timers.tick(15_000);
  assert.deepEqual(a.leaves, [departed]);

  for (const event of history) relay.deliver(event);
  await idle();
  assert.equal(a.peers.size, 0);
});

test('one session has a bounded text burst and sends app text at its full supported length', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  const b = await join(t, relay, 'Boris');
  await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
  const full = await signedText(a, '字'.repeat(4000), { file: undefined });
  const messages = await Promise.all(Array.from({ length: 11 }, (_, i) => signedText(a, `Message ${i}`)));
  assert.equal(await a.transport.sendText(full), true);
  const results = await Promise.all(messages.map((message) => a.transport.sendText(message)));
  assert.equal(results.filter(Boolean).length, 7);
  await waitFor(() => b.chat.length === 8);
  assert.deepEqual(b.chat[0].message, JSON.parse(JSON.stringify(full)));
});

test('room traffic periodically releases the underlying Pool event deduplication table', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const relay = new Relay();
  const a = await join(t, relay, 'Alice');
  await waitFor(() => relay.published.length === 1);
  const event = relay.published[0];
  for (let i = 0; i < 1024; i++) relay.deliver({ ...event, id: i.toString(16).padStart(64, '0'), sig: '' });
  assert.equal(a.pool.subscriptions.size, 0);
  t.mock.timers.tick(1000);
  assert.equal(a.pool.subscriptions.size, 1);
});
