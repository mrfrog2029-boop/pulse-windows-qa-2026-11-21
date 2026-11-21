import assert from 'node:assert/strict';
import test from 'node:test';
import * as net from '../web/js/net.js';
import { v as friendCodeForPub } from '../web/js/chunk-7GRP2DEX.js';

const first = 'wss://first.example';
const second = 'wss://second.example';

function fixture(t, urls) {
  const sockets = new Map();
  class WebSocket {
    readyState = 0;
    sent = [];

    constructor(url) {
      sockets.set(url, this);
    }

    open() {
      this.readyState = 1;
      this.onopen?.();
    }

    send(data) {
      assert.equal(this.readyState, 1);
      this.sent.push(JSON.parse(data));
    }

    receive(frame) {
      this.onmessage?.({ data: JSON.stringify(frame) });
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.();
    }

    request() {
      return this.sent.findLast(([type]) => type === 'REQ')?.[1];
    }
  }

  replaceGlobal(t, 'WebSocket', { value: WebSocket });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed);
  const pool = new net.Pool(urls).start();
  t.after(() => pool.stop());
  const tick = (ms) => {
    elapsed += ms;
    t.mock.timers.tick(ms);
  };
  return { pool, socket: (url) => sockets.get(url), tick };
}

function replaceGlobal(t, key, descriptor) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, ...descriptor });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete globalThis[key];
  });
}

function lookup(pool, timeout = 5000) {
  return pool.query({ kinds: [30078], '#t': ['pulse-user'] }, { timeout });
}

async function syntheticContactProfile() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const exchange = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = net.b64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const dhPub = net.b64(new Uint8Array(await crypto.subtle.exportKey('raw', exchange.publicKey)));
  return {
    signingKey: pair.privateKey,
    profile: { code: await friendCodeForPub(pub), pub, dhPub, name: 'Synthetic contact', nick: 'contact_test' },
  };
}

function sendDuplicateFromRelays(socket, event) {
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, { ...event, content: '' }]);
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['EVENT', id, event]);
  socket(second).receive(['EOSE', id]);
}

test('an empty relay response does not hide a later relay’s profile', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const result = lookup(pool);
  socket(first).open();
  const id = socket(first).request();
  socket(first).receive(['EOSE', id]);
  tick(1000);
  socket(second).open();
  const profile = { id: 'profile', kind: 30078, tags: [['t', 'pulse-user']] };
  socket(second).receive(['EVENT', id, profile]);
  socket(second).receive(['EOSE', id]);
  tick(5000);
  assert.deepEqual(await result, [profile]);
});

test('a positive query merges relay results and does not wait for a dead relay', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second, 'wss://silent.example']);
  const result = lookup(pool);
  socket(first).open();
  const id = socket(first).request();
  const one = { id: 'one', kind: 30078, tags: [['t', 'pulse-user']] };
  const two = { id: 'two', kind: 30078, tags: [['t', 'pulse-user']] };
  socket(first).receive(['EVENT', id, one]);
  socket(first).receive(['EOSE', id]);
  tick(100);
  socket(second).open();
  socket(second).receive(['EVENT', id, one]);
  socket(second).receive(['EVENT', id, two]);
  socket(second).receive(['EOSE', id]);
  tick(1500);
  assert.deepEqual(await Promise.race([result, Promise.resolve('pending')]), [one, two]);
});

test('CLOSED without a usable read reports network unavailable', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const result = assert.rejects(lookup(pool, 100), { code: 'RELAY_UNAVAILABLE' });
  socket(first).open();
  socket(first).receive(['CLOSED', socket(first).request(), 'auth-required: sign in']);
  tick(100);
  await result;
});

test('a successful empty EOSE resolves as an empty result', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const result = lookup(pool);
  socket(first).open();
  socket(first).receive(['EOSE', socket(first).request()]);
  tick(0);
  assert.deepEqual(await Promise.race([result, Promise.resolve('pending')]), []);
});

test('strict lookup reports an incomplete empty read when another configured relay is silent', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const result = assert.rejects(pool.query({ kinds: [30078] }, { timeout: 100, requireComplete: true }), {
    code: 'RELAY_UNAVAILABLE',
  });
  socket(first).open();
  socket(second).open();
  socket(first).receive(['EOSE', socket(first).request()]);
  tick(100);
  await result;
});

test('strict lookup preserves a positive response with partial relay coverage', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const result = pool.query({ kinds: [30078] }, { timeout: 100, requireComplete: true });
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  const profile = { id: 'existing-profile', kind: 30078 };
  socket(first).receive(['EVENT', id, profile]);
  socket(first).receive(['EOSE', id]);
  tick(100);
  const events = await result;
  assert.deepEqual(events, [profile]);
  assert.equal(net.queryWasComplete(events), false);
});

test('a terminal CLOSED does not delay a normal query served by another relay', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const result = lookup(pool);
  socket(first).open();
  socket(second).open();
  socket(first).receive(['EOSE', socket(first).request()]);
  socket(second).receive(['CLOSED', socket(second).request(), 'restricted: read unavailable']);
  tick(0);
  const response = await Promise.race([result, Promise.resolve('pending')]);
  assert.deepEqual(response, []);
});

test('a matching event survives the deadline even when EOSE never arrives', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const result = lookup(pool, 100);
  socket(first).open();
  const profile = { id: 'profile', kind: 30078, tags: [['t', 'pulse-user']] };
  socket(first).receive(['EVENT', socket(first).request(), profile]);
  tick(100);
  assert.deepEqual(await result, [profile]);
});

test('a late EOSE cannot extend a query beyond its deadline', async (t) => {
  const third = 'wss://third.example';
  const { pool, socket, tick } = fixture(t, [first, second, third]);
  for (const relay of [first, second, third]) socket(relay).open();
  const result = lookup(pool, 100);
  const id = socket(first).request();
  const profile = { id: 'profile', kind: 30078, tags: [['t', 'pulse-user']] };
  tick(90);
  socket(first).receive(['EVENT', id, profile]);
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['EOSE', id]);
  tick(10);
  assert.deepEqual(await Promise.race([result, Promise.resolve('pending')]), [profile]);
});

test('transient CLOSED retries a live subscription after a delay', (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const received = [];
  const cancel = pool.subscribe({ kinds: [30078] }, { onEvent: (event) => received.push(event.id) });
  socket(first).open();
  const id = socket(first).request();
  socket(first).receive(['CLOSED', id, 'rate-limited: too many requests']);
  tick(100);
  assert.equal(socket(first).sent.filter(([type]) => type === 'REQ').length, 1);
  tick(3000);
  assert.equal(socket(first).sent.filter(([type]) => type === 'REQ').length, 2);
  socket(first).receive(['EVENT', id, { id: 'back-after-retry', kind: 30078 }]);
  assert.deepEqual(received, ['back-after-retry']);
  socket(first).receive(['CLOSED', id, 'error: temporary']);
  cancel();
  tick(30000);
  assert.equal(socket(first).sent.filter(([type]) => type === 'REQ').length, 2);
});

test('both concurrent publishes for the same event receive the relay ACK', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  socket(first).open();
  const event = { id: 'same-id', kind: 30078 };
  const one = pool.publish(event, 100);
  const two = pool.publish(event, 100);
  socket(first).receive(['OK', 'same-id', true, '']);
  tick(100);
  assert.deepEqual(await Promise.all([one, two]), [{ ok: 1, failed: 0 }, { ok: 1, failed: 0 }]);
});

test('publish times out without an ACK and never sends its expired backlog', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const publish = pool.publish({ id: 'expired', kind: 30078 }, 100);
  tick(100);
  assert.deepEqual(await publish, { ok: 0, failed: 0 });
  socket(first).open();
  assert.deepEqual(socket(first).sent, []);
});

test('an ACK settles a publish while a late relay can still receive the event', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  socket(first).open();
  const event = { id: 'shared', kind: 30078 };
  const publish = pool.publish(event, 100);
  socket(first).receive(['OK', event.id, true, '']);
  tick(10);
  assert.deepEqual(await Promise.race([publish, Promise.resolve('pending')]), { ok: 1, failed: 0 });
  socket(second).open();
  assert.deepEqual(socket(second).sent, [['EVENT', event]]);
});

test('one positive acknowledgement settles a publish despite a silent open relay', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  socket(first).open();
  socket(second).open();
  const event = { id: 'acknowledged', kind: 30078 };
  const published = pool.publish(event, 7000);
  socket(first).receive(['OK', event.id, true, '']);
  tick(1000);
  assert.deepEqual(await Promise.race([published, Promise.resolve('pending')]), { ok: 1, failed: 0 });
});

test('an offline event can be sent before the publish deadline even if the wall clock jumps forward', async (t) => {
  const { pool, socket } = fixture(t, [first]);
  const event = { id: 'queued-before-clock-change', kind: 30078 };
  const published = pool.publish(event, 100);
  t.mock.method(Date, 'now', () => 86_400_000);
  socket(first).open();
  assert.deepEqual(socket(first).sent, [['EVENT', event]]);
  socket(first).receive(['OK', event.id, true, '']);
  assert.deepEqual(await published, { ok: 1, failed: 0 });
});

test('offline publish backlog stays bounded and preserves the latest event', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const publishes = Array.from({ length: 256 }, (_, index) => pool.publish({ id: `event-${index}`, kind: 30078 }, 100));
  socket(first).open();
  const ids = socket(first).sent.filter(([type]) => type === 'EVENT').map(([, event]) => event.id);
  tick(100);
  await Promise.all(publishes);
  assert(ids.length < 256);
  assert.equal(ids.at(-1), 'event-255');
});

test('readable relays must answer the current connection', (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  pool.subscribe({ kinds: [30078] });
  socket(first).open();
  assert.equal(typeof pool.readableCount, 'function');
  assert.equal(pool.readableCount(), 0);
  socket(first).receive(['EOSE', 'other-subscription']);
  assert.equal(pool.readableCount(), 0);
  socket(first).receive(['EOSE', socket(first).request()]);
  assert.equal(pool.readableCount(), 1);
  socket(first).close();
  tick(2000);
  socket(first).open();
  assert.equal(pool.readableCount(), 0);
});

test('returning online reconnects a backing-off relay and restores its live subscription', (t) => {
  const window = new EventTarget();
  replaceGlobal(t, 'window', { value: window });
  const { pool, socket, tick } = fixture(t, [first]);
  const received = [];
  pool.subscribe({ kinds: [30078] }, { onEvent: event => received.push(event.id) });
  socket(first).open();
  const request = socket(first).request();
  socket(first).close();
  tick(2000);
  const failed = socket(first);
  failed.close();

  window.dispatchEvent(new Event('online'));
  assert.notEqual(socket(first), failed);
  socket(first).open();
  assert.equal(socket(first).request(), request);
  socket(first).receive(['EVENT', request, { id: 'after-network-return', kind: 30078 }]);
  assert.deepEqual(received, ['after-network-return']);
});

test('device relay preferences select only unique valid secure WebSocket URLs', (t) => {
  const store = new Map();
  replaceGlobal(t, 'localStorage', { value: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  } });
  assert.equal(typeof net.relayUrls, 'function');
  assert.equal(typeof net.savedRelayUrls, 'function');
  assert.equal(typeof net.savedRelayPreference, 'function');
  assert.equal(typeof net.rememberRelayUrls, 'function');
  const input = [` ${first} `, 'ws://relay.local', `${first}/`, 'wss://', 'https://example.com', 'wss://user@relay.example', `${second}/nostr`];
  assert.deepEqual(net.relayUrls(input), [first, `${second}/nostr`]);
  assert.deepEqual(net.savedRelayUrls(), net.RELAYS);
  assert.deepEqual(net.rememberRelayUrls(input), [first, `${second}/nostr`]);
  assert.deepEqual(net.savedRelayPreference(), [first, `${second}/nostr`]);
  assert.deepEqual(new net.Pool().urls, [first, `${second}/nostr`]);
  assert.deepEqual(net.rememberRelayUrls([]), []);
  assert.deepEqual(net.savedRelayPreference(), []);
  assert.deepEqual(net.savedRelayUrls(), net.RELAYS);
  assert.deepEqual(new net.Pool(['ws://127.0.0.1:8080']).urls, ['ws://127.0.0.1:8080']);
});

test('denied device storage cannot prevent a relay connection', (t) => {
  replaceGlobal(t, 'localStorage', { get: () => { throw new Error('storage denied'); } });
  assert.equal(typeof net.savedRelayUrls, 'function');
  assert.deepEqual(net.savedRelayUrls(), net.RELAYS);
  assert.doesNotThrow(() => net.rememberRelayUrls([first]));
});

test('a saved full previous default set follows the maintained relays', (t) => {
  const previousDefault = [
    'wss://relay.nostr.net', 'wss://nostr-pub.wellorder.net', 'wss://offchain.pub',
    'wss://nostr.oxtr.dev', 'wss://relay.snort.social', 'wss://nostr.mom',
    'wss://relay.primal.net', ' wss://nos.lol/ ',
  ];
  let saved = JSON.stringify(previousDefault);
  replaceGlobal(t, 'localStorage', { value: {
    getItem: () => saved,
    setItem: (_key, value) => { saved = value; },
    removeItem: () => { saved = null; },
  } });

  assert.deepEqual(net.savedRelayPreference(), []);
  assert.deepEqual(new net.Pool().urls, net.RELAYS);
  assert.deepEqual(net.relayUrls(previousDefault), net.RELAYS);
  assert.deepEqual(net.rememberRelayUrls(previousDefault), []);
  assert.equal(saved, null);

  const custom = ['wss://offchain.pub', 'wss://nos.lol'];
  assert.deepEqual(net.rememberRelayUrls(custom), custom);
  assert.deepEqual(net.savedRelayPreference(), custom);
  assert.deepEqual(net.relayUrls([...previousDefault, first]), [...previousDefault.slice(0, -1), 'wss://nos.lol', first]);
});

test('an unreadable stored sync snapshot does not look like an empty restore', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const secret = net.newSecret();
  const unavailable = net.signEvent(secret, {
    kind: 30078, tags: [['d', 'pulse-sync']], content: 'corrupt',
  });
  socket(first).open();
  const result = assert.rejects(net.fetchSync(pool, secret), { code: 'SYNC_UNREADABLE' });
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, unavailable]);
  socket(first).receive(['EOSE', id]);
  tick(0);
  await result;
});

test('sync restore can recover an older readable snapshot', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const secret = net.newSecret();
  const snapshot = { v: 1, friends: [], rooms: [] };
  const readable = await net.syncEvent(secret, snapshot);
  const unavailable = net.signEvent(secret, {
    kind: 30078, tags: [['d', 'pulse-sync']], content: 'corrupt', created_at: readable.created_at + 1,
  });
  socket(first).open();
  const result = net.fetchSync(pool, secret);
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, unavailable]);
  socket(first).receive(['EVENT', id, readable]);
  socket(first).receive(['EOSE', id]);
  tick(0);
  assert.deepEqual(await result, { at: readable.created_at, data: snapshot });
});

test('signed offline presence uses a separate address from the legacy heartbeat', () => {
  const secret = net.newSecret();
  const online = net.presenceEvent(secret, { createdAt: 1800000000 });
  const offline = net.presenceEvent(secret, { online: false, createdAt: 1800000001 });
  assert.equal(online.content, '');
  assert.deepEqual(online.tags, [['d', 'pulse-presence']]);
  assert.deepEqual(offline.tags, [['d', 'pulse-presence-offline']]);
  assert.deepEqual(net.readPresence(online), { at: 1800000000000, online: true });
  assert.deepEqual(net.readPresence(offline), { at: 1800000001000, online: false });
  assert.equal(net.readPresence({ ...online, content: offline.content }), null);
  assert.equal(net.readPresence(net.signEvent(secret, { kind: 30078, tags: [['d', 'pulse-profile']] })), null);
});

test('three relays deliver a logout only to clients subscribing to the new presence address', (t) => {
  const urls = [first, second, 'wss://third.example'];
  const { pool, socket } = fixture(t, urls);
  const secret = net.newSecret();
  const online = net.presenceEvent(secret, { createdAt: 1800000000 });
  const offline = net.presenceEvent(secret, { online: false, createdAt: 1800000001 });
  const original = [];
  const current = [];
  pool.subscribe({ kinds: [30078], authors: [online.pubkey], '#d': ['pulse-presence'] }, {
    onEvent: event => original.push(event.id),
  });
  pool.subscribe(net.presenceFilter([online.pubkey]), { onEvent: event => current.push(net.readPresence(event).online) });
  for (const url of urls) {
    const relay = socket(url);
    relay.open();
    const requests = relay.sent.filter(frame => frame[0] === 'REQ');
    for (const event of [online, offline]) {
      for (const [, id, filter] of requests) {
        if (filter['#d'].includes(event.tags[0][1])) relay.receive(['EVENT', id, event]);
      }
    }
  }
  assert.deepEqual(original, [online.id]);
  assert.deepEqual(current, [true, false]);
});

test('a rejected presence envelope does not suppress the authentic copy from another relay', (t) => {
  const { pool, socket } = fixture(t, [first, second]);
  const received = [];
  const event = net.presenceEvent(net.newSecret());
  pool.subscribe(net.presenceFilter([event.pubkey]), {
    acceptEvent: value => Boolean(net.readPresence(value)),
    onEvent: value => received.push(value),
  });
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, { ...event, content: 'offline' }]);
  socket(second).receive(['EVENT', id, event]);
  assert.deepEqual(received, [event]);
});

test('a room list retains partial coverage after events are mapped to rooms', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const room = { code: 'pulse-123456789ABCDEFG', name: 'Synthetic test room' };
  const event = await net.roomEvent(net.newSecret(), room);
  const pending = net.fetchRooms(pool);
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, event]);
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['CLOSED', id, 'restricted: test relay disabled reads']);
  tick(0);
  const rooms = await pending;
  assert.deepEqual(rooms.map(({ code, name }) => ({ code, name })), [room]);
  assert.equal(net.queryWasComplete(rooms), false);
});

test('invalid profile records do not turn a partial exact nickname lookup into a confirmed miss', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const result = assert.rejects(net.lookupNick(pool, 'remote_user', { requireComplete: true }), {
    code: 'RELAY_UNAVAILABLE',
  });
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  const event = net.profileEvent(net.newSecret(), { nick: 'remote_user', code: 'id-123456789ABCDEFG' });
  socket(first).receive(['EVENT', id, { ...event, sig: '00'.repeat(64) }]);
  socket(first).receive(['EOSE', id]);
  tick(10000);
  await result;
});

test('a signed nickname whose contact card is unreadable reports a pending contact', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const nick = 'pending_card';
  const pending = assert.rejects(net.lookupNick(pool, nick, { requireComplete: true }), { code: 'CONTACT_PENDING' });
  const event = net.profileEvent(net.newSecret(), { nick });
  socket(first).open();
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, event]);
  socket(first).receive(['EOSE', id]);
  tick(0);
  await pending;
});

test('exact nickname lookup accepts a signed copy after an invalid copy with the same id', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const { profile } = await syntheticContactProfile();
  const event = net.profileEvent(net.newSecret(), profile);
  socket(first).open();
  socket(second).open();
  const pending = net.lookupNick(pool, profile.nick, { requireComplete: true });
  sendDuplicateFromRelays(socket, event);
  tick(0);
  assert.equal((await pending)?.npub, event.pubkey);
});

test('exact vault lookup accepts a signed copy after an invalid copy with the same id', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const nick = 'vault_test';
  const event = net.vaultEvent(net.newSecret(), nick, '{}');
  socket(first).open();
  socket(second).open();
  const pending = net.findVaults(pool, nick, { requireComplete: true, waitForAll: true });
  sendDuplicateFromRelays(socket, event);
  tick(0);
  assert.deepEqual(await pending, [event]);
});

test('exact contact lookup accepts a signed copy after an invalid copy with the same id', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const { profile, signingKey } = await syntheticContactProfile();
  const event = await net.contactEvent(net.newSecret(), profile, signingKey);
  socket(first).open();
  socket(second).open();
  const pending = net.lookupFriendCode(pool, profile.code, { requireComplete: true });
  sendDuplicateFromRelays(socket, event);
  tick(0);
  assert.equal((await pending)?.npub, event.pubkey);
});

test('nickname ownership checks both record types and ignores unsigned claims', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const nick = 'claimed_nick';
  const vault = net.vaultEvent(net.newSecret(), nick, '{}', 1799999990);
  const profile = net.profileEvent(net.newSecret(), { nick }, 1799999980);
  const unauthenticated = { ...vault, tags: vault.tags.map(tag => tag[0] === 'since' ? ['since', '1'] : tag) };
  const result = net.nickOwner(pool, nick);
  socket(first).open();
  const [[, id, filter]] = socket(first).sent;
  assert.deepEqual(new Set(filter['#t']), new Set(['pulse-acct', 'pulse-user']));
  assert.deepEqual(filter['#n'], [nick]);
  socket(first).receive(['EVENT', id, unauthenticated]);
  socket(first).receive(['EVENT', id, profile]);
  socket(first).receive(['EOSE', id]);
  tick(0);
  assert.equal(await result, profile.pubkey);
});

test('strict nickname ownership does not declare a name free on an incomplete read', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const pending = assert.rejects(net.nickOwner(pool, 'maybe_used', { requireComplete: true }), { code: 'RELAY_UNAVAILABLE' });
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['CLOSED', id, 'restricted: test relay disabled reads']);
  tick(0);
  await pending;
});

test('vault reads retain coverage after filtering signed matching records', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const nick = 'saved_test';
  const event = net.vaultEvent(net.newSecret(), nick, '{}');
  const pending = net.findVaults(pool, nick, { requireComplete: true, waitForAll: true });
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, event]);
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['CLOSED', id, 'restricted: test relay disabled reads']);
  tick(0);
  const vaults = await pending;
  assert.deepEqual(vaults, [event]);
  assert.equal(net.queryWasComplete(vaults), false);
});

test('sync restore waits for a newer snapshot on the slower relay', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const secret = net.newSecret();
  const previous = await net.syncEvent(secret, { v: 1, friends: [], rooms: [] });
  tick(1000);
  const data = { v: 1, friends: [], rooms: [{ name: 'Saved later' }] };
  const newer = await net.syncEvent(secret, data);
  socket(first).open();
  socket(second).open();
  const pending = net.fetchSync(pool, secret);
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, previous]);
  socket(first).receive(['EOSE', id]);
  tick(1500);
  socket(second).receive(['EVENT', id, newer]);
  socket(second).receive(['EOSE', id]);
  tick(0);
  assert.deepEqual(await pending, { at: newer.created_at, data });
});

test('sync restore uses the signed snapshot timestamp', async (t) => {
  const { pool, socket, tick } = fixture(t, [first]);
  const secret = net.newSecret();
  const older = await net.syncEvent(secret, { v: 1, friends: [], rooms: [] });
  tick(1000);
  const data = { v: 1, friends: [], rooms: [{ name: 'Current version' }] };
  const newest = await net.syncEvent(secret, data);
  const pending = net.fetchSync(pool, secret);
  socket(first).open();
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, { ...older, created_at: newest.created_at + 1 }]);
  socket(first).receive(['EVENT', id, newest]);
  socket(first).receive(['EOSE', id]);
  tick(0);
  assert.deepEqual(await pending, { at: newest.created_at, data });
});

test('an empty partial sync read does not authorize overwriting the remote snapshot', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const pending = assert.rejects(net.fetchSync(pool, net.newSecret()), { code: 'RELAY_UNAVAILABLE' });
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['CLOSED', id, 'restricted: test relay disabled reads']);
  tick(0);
  await pending;
});

test('a readable snapshot from a partial read remains marked incomplete', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const secret = net.newSecret();
  const data = { v: 1, friends: [], rooms: [] };
  const event = await net.syncEvent(secret, data);
  const pending = net.fetchSync(pool, secret);
  socket(first).open();
  socket(second).open();
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, event]);
  socket(first).receive(['EOSE', id]);
  socket(second).receive(['CLOSED', id, 'restricted: test relay disabled reads']);
  tick(0);
  const snapshot = await pending;
  assert.deepEqual(snapshot, { at: event.created_at, data });
  assert.equal(net.queryWasComplete(snapshot), false);
});

test('a fresh contact lookup waits for a newer relay identity after the first response', async (t) => {
  const { pool, socket, tick } = fixture(t, [first, second]);
  const { profile, signingKey } = await syntheticContactProfile();
  const previous = await net.contactEvent(net.newSecret(), profile, signingKey);
  tick(1000);
  const newer = await net.contactEvent(net.newSecret(), profile, signingKey);
  socket(first).open();
  socket(second).open();
  const pending = net.lookupFriendCode(pool, profile.code, { waitForAll: true });
  const id = socket(first).request();
  socket(first).receive(['EVENT', id, previous]);
  socket(first).receive(['EOSE', id]);
  tick(1500);
  socket(second).receive(['EVENT', id, newer]);
  socket(second).receive(['EOSE', id]);
  tick(0);
  assert.equal((await pending).npub, newer.pubkey);
});
