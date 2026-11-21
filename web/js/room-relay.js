import { KIND_APP, Pool, b64, newSecret, open, pubOf, queryWasComplete, roomId, seal, signEvent, unb64, verifyAppEvent } from './net.js';
import { networkNow } from './network-time.js';

const KIND = 29943; // Nostr ephemeral event
const EVENT_LIFETIME = 90;
const MAX_CLOCK_LEAD = 75;
const HEARTBEAT = 10_000;
const LEASE = 35_000;
const CHALLENGE_LIFETIME = 2 * HEARTBEAT;
const PUBLISH_TIMEOUT = 2800;
const MAX_CIPHERTEXT = 44_000;
const MAX_PEERS = 48;
const MAX_QUEUE = 64;
const SUBSCRIPTION_LIMIT = 1024;
const REPLAY_WINDOW = 128;
const CODE = /^pulse-[1-9A-HJ-NP-Za-km-z]{16,40}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const MESSAGE_ID = /^[0-9a-f]{8,40}$/;
const KEY = /^[A-Za-z0-9+/]{87}=$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const SIGNING_KEY = { name: 'ECDSA', namedCurve: 'P-256' };
const EXCHANGE_KEY = { name: 'ECDH', namedCurve: 'P-256' };
const SIGNATURE_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' };
const SAFE_NAME = /[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g;
const TEXT_FIELDS = new Set(['id', 'ts', 'kind', 'text', 'name', 'color', 'pub', 'sig', 'reply', 'file']);
const REPLY_FIELDS = new Set(['id', 'name', 'text']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const json = (value) => encoder.encode(JSON.stringify(value));
const asHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const randomToken = () => asHex(crypto.getRandomValues(new Uint8Array(16)));
const domainHash = (domain, code) => crypto.subtle.digest('SHA-256', encoder.encode(`${domain}:${code}`));
const seconds = () => Math.floor(networkNow() / 1000);
const tuple = (value, length) => Array.isArray(value) && value.length === length;
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const bounded = (value, length) => typeof value === 'string' && value.length <= length;
const owner = (pub, session) => `${pub}/${session}`;

export function isRoomCode(code) {
  return matches(code, CODE) && code.trim() === code;
}

function keyBytes(value) {
  if (!matches(value, KEY)) return null;
  const bytes = unb64(value);
  return bytes[0] === 4 && b64(bytes) === value ? bytes : null;
}

function profileFields({ pub, dhPub }, profile) {
  const name = typeof profile?.name === 'string' ? profile.name.replace(SAFE_NAME, '').trim().slice(0, 32) : '';
  const color = matches(profile?.color, COLOR) ? profile.color : '#7c5cff';
  return [pub, dhPub, name, color];
}

function envelopeProof(topic, author, createdAt, body) {
  return json(['pulse-room-relay-proof-v1', topic, KIND, author, createdAt, createdAt + EVENT_LIFETIME, body]);
}

function validText(message, pub, createdAt) {
  if (!message || message.kind !== 'text' || message.pub !== pub || message.file != null ||
      !matches(message.id, MESSAGE_ID) || !Number.isSafeInteger(message.ts) ||
      Math.abs(message.ts - createdAt * 1000) > EVENT_LIFETIME * 1000 ||
      !bounded(message.text, 4000) || !message.text.trim() || !bounded(message.name, 32) ||
      !matches(message.color, COLOR) || !matches(message.sig, SIGNATURE) ||
      !Object.keys(message).every((key) => TEXT_FIELDS.has(key))) return false;
  const reply = message.reply;
  return reply == null || !!(matches(reply.id, MESSAGE_ID) && bounded(reply.name, 32) && bounded(reply.text, 120) &&
    Object.keys(reply).every((key) => REPLY_FIELDS.has(key)));
}

function verifyText(key, message) {
  // This is the renderer's pulse-msg-v2 wire format. Keep its original timestamp.
  const proof = json(['pulse-msg-v2', message.id, message.ts, 'text', message.text, null,
    message.name, message.color, message.pub, message.reply?.id ?? null]);
  return crypto.subtle.verify(SIGNATURE_ALGORITHM, key, unb64(message.sig), proof);
}

function budget(capacity, perSecond) {
  let remaining = capacity;
  let updatedAt = Date.now();
  return () => {
    const now = Date.now();
    remaining = Math.min(capacity, remaining + Math.max(0, now - updatedAt) * perSecond / 1000);
    updatedAt = now;
    if (remaining < 1) return false;
    remaining -= 1;
    return true;
  };
}

function remember(map, key, until, capacity) {
  map.delete(key);
  map.set(key, until);
  if (map.size > capacity) map.delete(map.keys().next().value);
}

function acceptSequence(peer, sequence) {
  if (sequence <= peer.floor || peer.seen.has(sequence)) return false;
  peer.floor = Math.max(peer.floor, sequence - REPLAY_WINDOW);
  for (const seen of peer.seen) if (seen <= peer.floor) peer.seen.delete(seen);
  peer.seen.add(sequence);
  return true;
}

function validEvent(event, topic) {
  const now = seconds();
  return event?.kind === KIND && matches(event.id, HEX_64) && matches(event.pubkey, HEX_64) &&
    matches(event.sig, HEX_128) && Number.isSafeInteger(event.created_at) &&
    event.created_at + EVENT_LIFETIME > now && event.created_at <= now + MAX_CLOCK_LEAD &&
    tuple(event.tags, 2) && tuple(event.tags[0], 2) && event.tags[0][0] === 't' && event.tags[0][1] === topic &&
    tuple(event.tags[1], 2) && event.tags[1][0] === 'expiration' && event.tags[1][1] === String(event.created_at + EVENT_LIFETIME) &&
    bounded(event.content, MAX_CIPHERTEXT);
}

/**
 * Open a live text and presence channel for a Pulse invite code. Pass an active
 * account Pool to share its relay connections. The identity is the renderer's
 * {pub, dhPub, pair.privateKey}; callbacks receive opaque session identifiers.
 * onPeer receives a minimal profile on discovery and on profile changes.
 * sendText takes a signed pulse-msg-v2 wire message and resolves to relay ACK
 * status. close unsubscribes immediately and returns a best-effort leave promise.
 */
export async function openRoomRelay({ code, pool, identity, profile, onPeer, onLeave, onText, signal }) {
  if (!isRoomCode(code)) throw new TypeError('Invalid Pulse room code');
  const pub = keyBytes(identity?.pub);
  if (!pub || !keyBytes(identity?.dhPub) || !identity?.pair?.privateKey) throw new TypeError('Invalid Pulse identity');
  const [topicHash, keyHash, localSigningKey] = await Promise.all([
    domainHash('pulse-room-relay-topic-v1', code),
    domainHash('pulse-room-relay-key-v1', code),
    crypto.subtle.importKey('raw', pub, SIGNING_KEY, false, ['verify']),
  ]);
  const topic = asHex(new Uint8Array(topicHash));
  const key = await crypto.subtle.importKey('raw', keyHash, 'AES-GCM', false, ['encrypt', 'decrypt']);
  signal?.throwIfAborted();
  const ownPool = !pool;
  pool ??= new Pool().start();
  if (pool.stopped) throw new Error('Room relay pool is stopped');

  const session = randomToken();
  const address = owner(identity.pub, session);
  const secret = newSecret();
  const author = pubOf(secret);
  const peers = new Map();
  const retired = new Map();
  const answered = new Map();
  const receivedText = new Map();
  const queue = [];
  const acceptEvent = budget(128, 40);
  const acceptControl = budget(28, 8);
  const acceptText = budget(8, 3);
  let localProfile = profileFields(identity, profile);
  let challenges = [];
  let openCount = 0;
  let generation = 0;
  let sequence = 0;
  let writing = Promise.resolve();
  let writeCount = 0;
  let draining = false;
  let closed = false;
  let closing;
  let unsubscribe;
  let resubscribe;
  let reconnectAnnouncement;
  let lastHello = -Infinity;

  function publish(type, data, leaving = false) {
    if (!pool.openCount() || (closed && !leaving) || (writeCount >= MAX_QUEUE && !leaving)) return Promise.resolve(false);
    const body = JSON.stringify([session, ++sequence, type, localProfile, data]);
    const currentGeneration = generation;
    const current = () => pool.openCount() && (leaving || (!closed && generation === currentGeneration));
    writeCount++;
    // Queue encryption and writes in order. ACKs can finish independently.
    const sent = writing.then(async () => {
      if (!current()) return null;
      const createdAt = seconds();
      const proof = b64(new Uint8Array(await crypto.subtle.sign(SIGNATURE_ALGORITHM, identity.pair.privateKey,
        envelopeProof(topic, author, createdAt, body))));
      const content = await seal(key, json([body, proof]));
      if (!current() || content.length > MAX_CIPHERTEXT) return null;
      const tags = [['t', topic], ['expiration', String(createdAt + EVENT_LIFETIME)]];
      return { ack: pool.publish(signEvent(secret, { kind: KIND, tags, content, created_at: createdAt }), PUBLISH_TIMEOUT) };
    });
    writing = sent.then(() => { writeCount--; }, () => { writeCount--; });
    return sent.then(async (result) => Boolean((await result?.ack)?.ok)).catch(() => false);
  }

  function challenge() {
    const now = Date.now();
    const token = randomToken();
    challenges = [...challenges.filter((entry) => entry.until > now).slice(-1), { token, until: now + CHALLENGE_LIFETIME }];
    return token;
  }

  function announce(discover) {
    if (!openCount || !acceptControl()) return;
    lastHello = Date.now();
    void publish('hello', [challenge(), discover]);
  }

  function respond(target, echo, reciprocal) {
    const now = Date.now();
    const responseKey = `${target}/${echo}`;
    if ((answered.get(responseKey) ?? 0) > now || !acceptControl()) return;
    remember(answered, responseKey, now + (EVENT_LIFETIME + MAX_CLOCK_LEAD) * 1000, 256);
    const latest = challenges.at(-1);
    const follow = reciprocal ? (latest?.until > now ? latest.token : challenge()) : null;
    void publish('proof', [target, echo, follow]);
  }

  function forget(remote) {
    if (peers.delete(remote)) onLeave?.(remote);
  }

  function refresh(peer, nextProfile, remote, counter, now) {
    if (counter <= peer.presenceSequence) return;
    peer.presenceSequence = counter;
    peer.until = now + LEASE;
    if (peer.profile?.name === nextProfile.name && peer.profile?.color === nextProfile.color) return;
    peer.profile = nextProfile;
    onPeer?.({ ...nextProfile }, remote);
  }

  async function receive(event, connectionGeneration) {
    const envelope = JSON.parse(decoder.decode(await open(key, event.content)));
    if (!tuple(envelope, 2) || typeof envelope[0] !== 'string' || !matches(envelope[1], SIGNATURE)) return;
    const [body, signature] = envelope;
    const packet = JSON.parse(body);
    if (!tuple(packet, 5)) return;
    const [sender, counter, type, fields, data] = packet;
    if (!matches(sender, HEX_32) || !Number.isSafeInteger(counter) || counter < 1 || !tuple(fields, 4)) return;
    const [pub, dhPub, name, color] = fields;
    const rawSigningKey = keyBytes(pub);
    if (!rawSigningKey || !keyBytes(dhPub) || !bounded(name, 32) || !matches(color, COLOR) || name.replace(SAFE_NAME, '').trim() !== name) return;
    const remote = owner(pub, sender);
    if (remote === address || (retired.get(remote) ?? 0) > Date.now()) return;

    const proofMatches = () => tuple(data, 3) && data[0] === address &&
      challenges.some(({ token, until }) => token === data[1] && until > Date.now()) &&
      (data[2] === null || matches(data[2], HEX_32));
    if (type === 'hello') {
      if (!tuple(data, 2) || !matches(data[0], HEX_32) || typeof data[1] !== 'boolean') return;
    } else if (type === 'proof') {
      if (!proofMatches()) return;
    } else if (type === 'text') {
      if (!peers.has(remote) || !validText(data, pub, event.created_at)) return;
    } else if (type !== 'leave' || data !== null) return;

    let peer = peers.get(remote);
    if (peer && (event.pubkey !== peer.author || dhPub !== peer.profile.dhPub)) return;
    const signingKey = peer?.key ?? await crypto.subtle.importKey('raw', rawSigningKey, SIGNING_KEY, false, ['verify']);
    if (!await crypto.subtle.verify(SIGNATURE_ALGORITHM, signingKey, unb64(signature),
      envelopeProof(topic, event.pubkey, event.created_at, body))) return;

    const current = () => !closed && generation === connectionGeneration;
    const now = Date.now();
    if (!current() || !validEvent(event, topic)) return;
    peer = peers.get(remote);
    if (peer?.until <= now) {
      forget(remote);
      peer = undefined;
    }
    if (peer && !acceptSequence(peer, counter)) return;
    const nextProfile = { pub, dhPub, name, color };
    if (type === 'hello') {
      if (peer) refresh(peer, nextProfile, remote, counter, now);
      if (!peer || data[1]) respond(remote, data[0], true);
    } else if (type === 'proof') {
      if (!proofMatches() || (!peer && peers.size >= MAX_PEERS)) return;
      if (!peer) {
        await crypto.subtle.importKey('raw', keyBytes(dhPub), EXCHANGE_KEY, false, []);
        if (!current() || !proofMatches()) return;
        peer = { key: signingKey, author: event.pubkey, floor: counter, seen: new Set(), presenceSequence: 0, textBudget: budget(8, 3) };
        peers.set(remote, peer);
      }
      if (data[2]) respond(remote, data[2], false);
      refresh(peer, nextProfile, remote, counter, Date.now());
    } else if (type === 'leave') {
      remember(retired, remote, now + (EVENT_LIFETIME + MAX_CLOCK_LEAD) * 1000, 256);
      forget(remote);
    } else if (peer?.textBudget()) {
      const messageKey = `${pub}/${data.id}`;
      if ((receivedText.get(messageKey) ?? 0) > now || !await verifyText(peer.key, data)) return;
      if (!current() || peers.get(remote) !== peer) return;
      remember(receivedText, messageKey, now + (EVENT_LIFETIME + MAX_CLOCK_LEAD) * 1000, 1024);
      onText?.(data, remote);
    }
  }

  async function drain() {
    draining = true;
    while (!closed && queue.length) {
      try {
        await receive(queue.shift(), generation);
      } catch {
        // An untrusted frame may fail decryption, decoding, or key import.
      }
    }
    draining = false;
  }

  function subscribe() {
    let count = 0;
    unsubscribe = pool.subscribe({ kinds: [KIND], '#t': [topic], since: seconds() - EVENT_LIFETIME, limit: 0 }, {
      onEvent(event) {
        if (closed) return;
        // Pool tracks event IDs per subscription. Renew to bound its memory too.
        if (++count === SUBSCRIPTION_LIMIT) {
          unsubscribe?.();
          unsubscribe = null;
          resubscribe = setTimeout(() => {
            if (!closed) subscribe();
          }, 1000);
        }
        if (openCount && queue.length < MAX_QUEUE && validEvent(event, topic) && acceptEvent()) {
          queue.push(event);
          if (!draining) void drain();
        }
      },
    });
  }

  function connectionChanged(count) {
    if (pool.stopped) {
      for (const remote of peers.keys()) forget(remote);
      void close();
      return;
    }
    const previous = openCount;
    openCount = count;
    if (!count && previous) {
      clearTimeout(reconnectAnnouncement);
      generation++;
      queue.length = 0;
      challenges = [];
      for (const remote of peers.keys()) forget(remote);
    } else if (count > previous) {
      clearTimeout(reconnectAnnouncement);
      const delay = previous ? lastHello + 1000 - Date.now() : 0;
      if (delay > 0) reconnectAnnouncement = setTimeout(() => announce(true), delay);
      else announce(true);
    }
  }

  function heartbeat() {
    const now = Date.now();
    for (const [remote, peer] of peers) if (peer.until <= now) forget(remote);
    for (const map of [retired, answered, receivedText]) {
      for (const [entry, until] of map) if (until <= now) map.delete(entry);
    }
    announce(false);
  }

  function close() {
    if (closed) return closing;
    closed = true;
    clearInterval(timer);
    clearTimeout(resubscribe);
    clearTimeout(reconnectAnnouncement);
    unsubscribe?.();
    unlisten();
    queue.length = 0;
    challenges = [];
    peers.clear();
    retired.clear();
    answered.clear();
    receivedText.clear();
    closing = publish('leave', null, true).then(() => { if (ownPool) pool.stop(); });
    return closing;
  }

  async function sendText(message) {
    if (closed || !openCount || !validText(message, identity.pub, seconds()) || !acceptText()) return false;
    const wire = JSON.parse(JSON.stringify(message));
    const currentGeneration = generation;
    if (!await verifyText(localSigningKey, wire) || currentGeneration !== generation) return false;
    return publish('text', wire);
  }

  subscribe();
  const unlisten = pool.onChange(connectionChanged);
  const timer = setInterval(heartbeat, HEARTBEAT);
  connectionChanged(pool.openCount());
  return {
    sendText,
    updateProfile(nextProfile) {
      const fields = profileFields(identity, nextProfile);
      if (!closed && (fields[2] !== localProfile[2] || fields[3] !== localProfile[3])) {
        localProfile = fields;
        announce(false);
      }
    },
    close,
  };
}

async function publicRoomForCode(pool, code, timeout) {
  const address = 'pulse-room:' + await roomId(code);
  const events = await pool.query({ kinds: [KIND_APP], '#d': [address], '#t': ['pulse-room'], limit: 40 },
    { timeout, requireComplete: true, waitForAll: true });
  const publications = events.filter(event => verifyAppEvent(event) &&
    event.tags.some(tag => tag[0] === 'd' && tag[1] === address) &&
    event.tags.some(tag => tag[0] === 't' && tag[1] === 'pulse-room'))
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  const authors = new Set();
  for (const event of publications) {
    if (authors.has(event.pubkey)) continue;
    authors.add(event.pubkey);
    try {
      const { v, hidden, name, code: publishedCode, icon } = JSON.parse(event.content);
      if (v === 1 && !hidden && publishedCode === code && typeof name === 'string' && name.trim())
        return { room: { name, icon }, available: true };
    } catch {
      // A malformed card does not establish membership.
    }
  }
  return { room: null, available: queryWasComplete(events) };
}

// An invite code is a namespace, so a successful relay write alone does not
// prove a live room. Require a signed directory card or a live account proof.
export async function verifyRoomEntry({ code, pool, identity, profile, watchDirectPeer, watchVoicePeer, signal, timeout = 12_000 }) {
  if (!isRoomCode(code)) return { status: 'invalid' };
  if (signal?.aborted) return { status: 'cancelled' };
  const probe = new AbortController();
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const live = transport => finish({ status: 'live', transport });
  const cancel = () => finish({ status: 'cancelled' });
  signal?.addEventListener('abort', cancel, { once: true });

  let directoryAvailable = false;
  let voiceAvailable = false;
  let voiceDeadline;
  const expire = () => finish({ status: directoryAvailable || voiceAvailable ? 'not-found' : 'unavailable' });
  const deadline = setTimeout(() => {
    // A creator starts the reserve transport after a delay. Allow its live
    // handshake to finish once the service has accepted our silent probe.
    if (voiceAvailable) voiceDeadline = setTimeout(expire, 8000);
    else expire();
  }, timeout);
  const relay = openRoomRelay({
    code, pool, identity, profile, signal: probe.signal,
    onPeer(peer) { if (peer.pub !== identity.pub) live('relay'); },
  });
  void relay.catch(() => {});
  void publicRoomForCode(pool, code, Math.min(timeout, 6000)).then(({ room, available }) => {
    directoryAvailable = available;
    if (room) finish({ status: 'public', room });
  }).catch(() => {});

  // Older clients can prove membership with their existing signed RTC hello.
  let direct;
  const directDelay = watchDirectPeer && setTimeout(() => {
    direct = Promise.resolve().then(() => watchDirectPeer(() => live('direct'), probe.signal));
    void direct.catch(() => {});
  }, Math.min(1200, timeout / 4));
  let voice;
  const voiceDelay = watchVoicePeer && setTimeout(() => {
    voice = Promise.resolve().then(() => watchVoicePeer(() => live('voice'), probe.signal));
    void voice.then(async handle => {
      if (!handle) return;
      await handle.ready;
      if (!probe.signal.aborted) voiceAvailable = true;
    }).catch(() => {});
  }, Math.min(3000, timeout / 3));
  try {
    return await result;
  } finally {
    probe.abort();
    clearTimeout(deadline);
    clearTimeout(voiceDeadline);
    clearTimeout(directDelay);
    clearTimeout(voiceDelay);
    signal?.removeEventListener('abort', cancel);
    void relay.then(handle => handle.close()).catch(() => {});
    await Promise.allSettled([direct?.then(close => close?.()), voice?.then(handle => handle?.close())]);
  }
}
