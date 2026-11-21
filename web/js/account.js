import * as o from "./net.js";
import { updateAccountKeys as Z, d as U, v as friendCodeForPub } from "./chunk-7GRP2DEX.js";
import * as X from "./guard.js";
import { networkNow } from "./network-time.js";
import { traceNetwork } from "./network-diagnostics.js";

const FRIEND_CODE = /(?:^|[^A-Za-z0-9])[iI][dD]-([1-9A-HJ-NP-Za-km-z]{16,24})(?![A-Za-z0-9])/;
const KEY_FINGERPRINT = /^(?:[0-9a-f]{4}-){2}[0-9a-f]{4}$/i;
const ROOM_CODE = /^pulse-[1-9A-HJ-NP-Za-km-z]{16,40}$/;
const INVITE_LIFETIME = 300;
const REQUEST_OUTBOX = "friend-request-mail";
const DIRECTORY_UNAVAILABLE = "Не удалось проверить каталог. Проверь подключение и попробуй снова.";
const PRESENCE_PERIOD = 45_000;
const PRESENCE_TIMESTAMP = "presenceTimestamp";
let accountRelays = null;
let poolRelays = null;
let s = null, ee = null, u = null, f = null, h = null, L = false, v, m = false;
const T = new Promise((e) => v = e), S = () => Math.floor(networkNow() / 1e3), r = (e) => document.getElementById(e), P = (e, t) => {
  let n;
  return (...i) => (clearTimeout(n), n = setTimeout(() => e(...i), t));
}, d = () => {
  const urls = accountRelays ?? o.savedRelayUrls();
  if (ee && urls.length === poolRelays.length && urls.every((url, index) => url === poolRelays[index])) return ee;
  ee?.stop();
  poolRelays = urls;
  return ee = new o.Pool(urls).start();
}, me = () => s?.settings.nick || null, w = /* @__PURE__ */ new Map(), te = P(async () => {
  for (const [e, t] of w) {
    w.delete(e);
    const n = s.friends().get(e);
    n?.npub && x(n, { t: "ack", ids: [...t] });
  }
}, 1200), K = (e) => o.pairKey(s.identity().dh.privateKey, e.dhPub), x = async (e, t) => d().publish(await o.mailEvent(u, e.npub, await K(e), t)), be = { async send(e, t) {
  await T, !m && (e.npub && (await x(e, { t: "msg", ...t })).ok && s.friends().markSent(e.pub, t.id), d().publish(await o.mailEvent(u, f, h, { t: "out", to: e.pub, msg: t })));
}, async del(e, t, n) {
  await T, !m && (n && e.npub && x(e, { t: "del", id: t }), d().publish(await o.mailEvent(u, f, h, { t: "outdel", to: e.pub, id: t })));
}, async invite(friend, payload) {
  await T;
  if (m || !isRoomCode(payload?.code)) return false;
  const contact = s.friends().get(friend?.pub);
  if (!contact?.npub || !contact.dhPub) return false;
  try {
    const result = await x(contact, { t: "invite", code: payload.code, name: inviteName(payload.name), at: S() });
    return Boolean(result.ok);
  } catch {
    return false;
  }
} }, k = /* @__PURE__ */ new Set(), ne = async (e) => {
  if (k.has(e.id)) return;
  if (m) {
    k.add(e.id);
    return se(e);
  }
  const t = s.friends();
  if (e.pubkey === f) {
    const n = await o.readMail(h, e);
    if (n?.t === "out" && typeof n.to == "string") {
      if (!t.get(n.to)) return;
      k.add(e.id), await t.receive(n.to, n.msg, { mine: true });
    } else n?.t === "outdel" && typeof n.to == "string" && typeof n.id == "string" && (k.add(e.id), await t.removeByMail(n.to, n.id, true));
  } else {
    const n = t.list().find((a) => a.npub === e.pubkey);
    if (!n) return k.add(e.id), se(e);
    k.add(e.id);
    const i = await o.readMail(await K(n), e);
    if (i?.t === "msg") {
      const a = await t.receive(n.pub, i);
      a && ((w.get(n.pub) || w.set(n.pub, /* @__PURE__ */ new Set()).get(n.pub)).add(a.id), te());
    } else if (i?.t === "ack") {
      t.delivered(n.pub, i.ids);
    } else if (i?.t === "del" && typeof i.id === "string") {
      await t.removeByMail(n.pub, i.id, false);
    } else if (i?.t === "req" || i?.t === "res") {
      const profile = i.profile;
      if (profile?.pub === n.pub && profile.npub === n.npub && profile.code === n.code && profile.dhPub === n.dhPub) {
        await receiveFriendEnvelope(i, n);
      }
    } else if (i?.t === "invite" && isRoomCode(i.code) && Number.isSafeInteger(i.at)) {
      const age = S() - i.at;
      if (age >= -30 && age <= INVITE_LIFETIME) s.onRoomInvite?.(n, { code: i.code, name: inviteName(i.name) });
    }
  }
  e.created_at > (s.store.get("mailSince", 0) || 0) && s.store.set("mailSince", e.created_at), window.PulseAndroid?.setSeen?.(e.created_at);
}, $ = () => {
  const e = s.identity(), t = s.settings;
  const nick = pendingRegistration() ? undefined : t.nick;
  return { pub: e.pub, dhPub: e.dhPub, code: e.friendCode, name: t.name, color: t.color, bio: t.bio || "", nick, npub: f };
}, j = async (e, t) => {
  const n = await o.pairKey(s.identity().dh.privateKey, e.dhPub);
  return d().publish(await o.mailEvent(u, e.npub, n, t, [["k", s.identity().dhPub]]));
}, se = async (e) => {
  const t = e.tags?.find((l) => l[0] === "k")?.[1];
  if (!t) return;
  const n = await o.readMail(await o.pairKey(s.identity().dh.privateKey, t), e), i = n?.profile;
  if (!i || i.dhPub !== t || i.npub !== e.pubkey || typeof i.pub !== "string" || !isFriendCode(i.code) || await friendCodeForPub(i.pub).catch(() => null) !== i.code) return;
  const existing = s.friends().get(i.pub);
  if (existing && (existing.dhPub !== i.dhPub || existing.code !== i.code || existing.npub && existing.npub !== i.npub)) return;
  await receiveFriendEnvelope(n, existing ? { ...existing, npub: i.npub } : null);
};
const parseFriendCode = value => {
  const match = value.match(FRIEND_CODE);
  return match ? `id-${match[1]}` : null;
};
const isFriendCode = code => typeof code === "string" && parseFriendCode(code) === code;
const contains = (value, term) => String(value ?? "").toLowerCase().includes(term);
function matchesSearch(profile, raw, code, term) {
  if (code) return profile.code === code;
  if (!term) return true;
  if (raw.startsWith("@")) {
    return o.NICK_RE.test(term) ? o.normNick(profile.nick) === term : contains(profile.nick, term);
  }
  return [profile.nick, profile.name, profile.code].some(value => contains(value, term));
}
export function matchesFriendSearch(friend, input) {
  const raw = String(input ?? "").trim();
  return matchesSearch(friend, raw, parseFriendCode(raw), o.normNick(raw));
}
const isRoomCode = code => typeof code === "string" && code === code.trim() && ROOM_CODE.test(code);
const inviteName = name => (typeof name === "string" && name.trim().slice(0, 64)) || "Комната";
const pendingRegistration = () => {
  const vault = s.store.get("vault", null);
  return vault?.pending && vault.checkNick && vault.nick === s.settings.nick;
};

const queuedRequests = new Map();
const sendingRequests = new Map();
const requestKey = ({ type, code }) => `${type}:${code}`;
const saveRequests = () => s.store.set(REQUEST_OUTBOX, [...queuedRequests.values()]);
function loadRequests() {
  const stored = s.store.get(REQUEST_OUTBOX, []);
  if (!Array.isArray(stored)) return;
  for (const request of stored) {
    if (!isFriendCode(request?.code)) continue;
    if (request.type === "res") {
      if (!hasDeliveryKeys(request) || typeof request.pub !== "string" || typeof request.accepted !== "boolean") continue;
    } else if (request.type !== "req") continue;
    queuedRequests.set(requestKey(request), request);
  }
}
function hasDeliveryKeys(profile) {
  return !!profile && /^[a-f0-9]{64}$/.test(profile.npub) && typeof profile.dhPub === "string";
}
function requestIsCurrent(request) {
  const friends = s.friends();
  if (request.type === "req") return friends.outgoing().some(outgoing => outgoing.code === request.code);
  return request.expiresAt > Date.now() && Boolean(friends.get(request.pub)) === request.accepted;
}
function flushRequests(reconnected = false) {
  if (!queuedRequests.size) return;
  let removed = false;
  for (const [key, request] of queuedRequests) {
    if (!requestIsCurrent(request)) {
      queuedRequests.delete(key);
      removed = true;
    } else if (reconnected || request.retryAt <= Date.now()) {
      sendRequest(request).catch(() => {});
    }
  }
  if (removed) saveRequests();
}
function sendRequest(request) {
  const key = requestKey(request);
  if (sendingRequests.has(key)) return sendingRequests.get(key);
  if (!d().openCount()) return Promise.resolve(false);
  const operation = attemptRequest(request).finally(() => { sendingRequests.delete(key); });
  sendingRequests.set(key, operation);
  return operation;
}
async function attemptRequest(request) {
  if (request.type === "req" && !hasDeliveryKeys(request)) {
    const { profile } = await findContact(request.code);
    if (profile) Object.assign(request, { npub: profile.npub, dhPub: profile.dhPub });
  }
  const key = requestKey(request);
  let delivered = false;
  if (queuedRequests.get(key) === request && requestIsCurrent(request) && hasDeliveryKeys(request)) {
    const message = { t: request.type, profile: $() };
    if (request.type === "res") message.accepted = request.accepted;
    delivered = Boolean((await j(request, message).catch(() => null))?.ok);
  }
  if (queuedRequests.get(key) !== request) return delivered;
  if (delivered || !requestIsCurrent(request)) {
    queuedRequests.delete(key);
  } else {
    request.attempts = Math.min(5, (Number(request.attempts) || 0) + 1);
    request.retryAt = Date.now() + Math.min(300_000, 30_000 * 2 ** (request.attempts - 1));
  }
  saveRequests();
  return delivered;
}

async function receiveFriendEnvelope(message, knownFriend) {
  const friends = s.friends();
  if (message.t === "req") {
    if (knownFriend) return queueResponse(knownFriend, true);
    return friends.requestFrom(message.profile, accepted => queueResponse(message.profile, accepted));
  }
  if (message.t === "res" && typeof message.accepted === "boolean") {
    return friends.answerFrom(message.profile, message.accepted);
  }
}
function queueResponse({ code, pub, npub, dhPub }, accepted) {
  const entry = { type: "res", code, pub, npub, dhPub, accepted, attempts: 0, retryAt: 0, expiresAt: Date.now() + 30 * 86_400_000 };
  const key = requestKey(entry);
  const previous = queuedRequests.get(key);
  if (previous?.accepted === accepted) return sendRequest(previous).catch(() => false);
  queuedRequests.set(key, entry);
  saveRequests();
  return sendRequest(entry).catch(() => false);
}

async function addFriend(input) {
  await T;
  const profile = input && typeof input === "object" ? input : await resolveFriendProfile(input);
  const friends = s.friends();
  await friends.addByCode(profile.code);
  if (friends.list().some(friend => friend.code === profile.code)) return { delivered: true };
  if (!friends.outgoing().some(request => request.code === profile.code)) {
    return { delivered: friends.list().some(friend => friend.code === profile.code) };
  }
  const { code, npub, dhPub } = profile;
  const key = requestKey({ type: "req", code });
  let request = queuedRequests.get(key);
  if (!request) {
    request = { type: "req", code, npub, dhPub, attempts: 0, retryAt: 0 };
    queuedRequests.set(key, request);
    saveRequests();
  } else if (!hasDeliveryKeys(request) && hasDeliveryKeys(profile)) {
    Object.assign(request, { npub, dhPub });
    saveRequests();
  }
  return { delivered: await sendRequest(request) };
}

function cachedDirectory(fetchDirectory) {
  let cache = null;
  let pending = null;
  return async (refresh = false) => {
    if (pending) return pending;
    if (!refresh && cache && Date.now() - cache.at < 60_000) return cache.list;
    pending = fetchDirectory(d()).then(list => {
      cache = { at: Date.now(), list };
      return list;
    }).finally(() => { pending = null; });
    return pending;
  };
}
const N = cachedDirectory(o.fetchPeople), ae = cachedDirectory(o.fetchRooms);

async function findLegacyProfile(matches) {
  const directory = await N(true);
  const candidates = directory.filter(matches).sort((left, right) => left.since - right.since || right.at - left.at);
  for (const profile of candidates) if (await o.verifyDirectoryProfile(profile)) return profile;
  if (!o.queryWasComplete(directory)) throw new Error(DIRECTORY_UNAVAILABLE);
  return null;
}

async function findContact(code) {
  const [exact] = await Promise.allSettled([o.lookupFriendCode(d(), code, { requireComplete: true })]);
  if (exact.value) return { profile: exact.value, failed: false };
  const [legacy] = await Promise.allSettled([findLegacyProfile(profile => profile.code === code)]);
  if (legacy.value) return { profile: legacy.value, failed: false };
  return { profile: null, failed: exact.status === "rejected" || legacy.status === "rejected" };
}

async function findNick(nick) {
  const [exact] = await Promise.allSettled([o.lookupNick(d(), nick, { requireComplete: true })]);
  if (exact.value) return exact.value;
  const [legacy, vaults] = await Promise.allSettled([
    findLegacyProfile(profile => profile.nick === nick),
    o.findVaults(d(), nick, { requireComplete: true }),
  ]);
  if (legacy.value) return legacy.value;
  if (vaults.value?.length || exact.reason?.code === "CONTACT_PENDING") {
    throw Object.assign(new Error(`Карточка @${nick} пока недоступна. Попроси у друга ID.`), { code: "CONTACT_PENDING" });
  }
  if ([exact, legacy, vaults].some(answer => answer.status === "rejected")) throw new Error(DIRECTORY_UNAVAILABLE);
  return null;
}

let contactPublishing = null;
let publishedContact = null;
export async function publishDirectoryContact(pool, secret, identity, { name, nick }) {
  const { friendCode: code, pub, dhPub, pair } = identity;
  const event = await o.contactEvent(secret, { code, pub, dhPub, name, nick }, pair.privateKey);
  return pool.publish(event);
}
function publishContact() {
  if (contactPublishing) return contactPublishing;
  const identity = s.identity();
  const { name } = s.settings;
  const nick = pendingRegistration() || m ? "" : s.settings.nick || "";
  const revision = directoryRelayRevision;
  if (publishedContact?.revision === revision && publishedContact.nick === nick && publishedContact.name === name) return Promise.resolve();
  contactPublishing = (async () => {
    if ((await publishDirectoryContact(d(), u, identity, { name, nick })).ok) publishedContact = { revision, nick, name };
  })().finally(() => { contactPublishing = null; });
  return contactPublishing;
}

let publishedProfile = [];
let profileRelayRevision = -1;
let directoryRelayRevision = 0;
let profilePublishing = null;
let profilePublishFailure = false;
export function nickDirectoryStatus() {
  if (!s?.settings.nick) return "unset";
  if (pendingRegistration()) return "registration";
  if (publishedProfile[0] === s.settings.nick) return "published";
  return profilePublishFailure ? "unavailable" : "pending";
}
export async function publishDirectoryProfile(pool, secret, identity, settings) {
  const { nick, name, bio = "", color, avatar, nickSince } = settings;
  const { friendCode, pub, dhPub } = identity;
  const event = o.profileEvent(secret, { nick, name, bio, color, code: friendCode, pub, dhPub, av: await o.tinyImage(avatar) }, nickSince);
  return pool.publish(event);
}
async function M(force = false) {
  while (force && profilePublishing) await profilePublishing.catch(() => {});
  if (profilePublishing) return profilePublishing;
  const { nick, name, bio = "", color, avatar, nickSince } = s.settings;
  if (!nick || m || pendingRegistration()) return;
  const profile = [nick, name, bio, color, avatar, nickSince];
  const revision = directoryRelayRevision;
  if (!force && profileRelayRevision === revision && profile.every((value, index) => publishedProfile[index] === value)) return;

  profilePublishing = (async () => {
    const result = await publishDirectoryProfile(d(), u, s.identity(), { nick, name, bio, color, avatar, nickSince }).catch(() => null);
    if (result?.ok) {
      publishedProfile = profile;
      profileRelayRevision = revision;
    }
    const wasUnavailable = profilePublishFailure;
    profilePublishFailure = !result?.ok;
    if (result?.ok || wasUnavailable !== profilePublishFailure) s.rerender();
  })().finally(() => { profilePublishing = null; });
  return profilePublishing;
}

const publishedRooms = new Map();
let roomsPublishing = null;
async function F() {
  if (!roomsPublishing) roomsPublishing = publishRooms().finally(() => { roomsPublishing = null; });
  return roomsPublishing;
}
async function publishRooms() {
  const by = pendingRegistration() ? "" : s.settings.nick || "";
  const revision = directoryRelayRevision;
  for (const { code, name, icon, pub, wasPub, ephemeral } of s.rooms.list()) {
    if (ephemeral || !pub && !wasPub && !publishedRooms.has(code)) continue;
    const publication = pub ? [name, icon, by] : [null];
    const previous = publishedRooms.get(code);
    if (previous?.revision === revision && publication.every((value, index) => previous.fields[index] === value)) continue;
    const data = pub ? { code, name, icon: await o.tinyImage(icon, 64), by } : { code, hidden: true };
    if ((await d().publish(await o.roomEvent(u, data))).ok) publishedRooms.set(code, { fields: publication, revision });
  }
}
const oe = () => ({ v: 1, ...s.friends().snapshot(), rooms: s.rooms.list().filter((e) => !e.ephemeral).map(({ code: e, name: t, icon: n, color: i, created: a, metaTs: l, pub: p }) => ({ code: e, name: t, icon: n && n.length < 12e3 ? n : null, color: i, created: a, metaTs: l, pub: !!p })), profile: { name: s.settings.name, bio: s.settings.bio, color: s.settings.color, theme: s.settings.theme, at: s.settings.profileAt || 0 } });
let R = "";
let syncPublishing = null;
let syncRestoring = null;
function ce() {
  if (!syncPublishing) syncPublishing = publishSync().finally(() => { syncPublishing = null; });
  return syncPublishing;
}
async function publishSync() {
  await re();
  const snapshot = JSON.stringify(oe());
  if (snapshot !== R && (await d().publish(await o.syncEvent(u, JSON.parse(snapshot)))).ok) R = snapshot;
}
function re() {
  if (L) return Promise.resolve();
  if (!syncRestoring) syncRestoring = restoreSync().finally(() => { syncRestoring = null; });
  return syncRestoring;
}
async function restoreSync() {
  const snapshot = await o.fetchSync(d(), u);
  if (!o.queryWasComplete(snapshot)) throw new Error(DIRECTORY_UNAVAILABLE);
  const t = snapshot?.data;
  if (t) {
    const friends = s.friends();
    let n = friends.merge(t);
    for (const profile of t.friends || []) {
      const friend = friends.get(profile?.pub);
      if (friend && (!friend.npub || !friend.nick)) applyFriendProfile(friends, friend, profile);
    }
    for (const a of t.rooms || []) {
      if (typeof a?.code != "string") continue;
      const l = s.rooms.list().find((p) => p.code === a.code);
      if (l) (a.metaTs || 0) > (l.metaTs || 0) && (Object.assign(l, { name: a.name, icon: a.icon || l.icon, metaTs: a.metaTs, pub: !!a.pub }), n = true);
      else {
        const p = s.rooms.add(a.code, a.name, a.icon);
        Object.assign(p, { color: a.color || p.color, created: a.created || p.created, metaTs: a.metaTs || 0, pub: !!a.pub }), n = true;
      }
    }
    const i = t.profile;
    i && (i.at || 0) > (s.settings.profileAt || 0) && (Object.assign(s.settings, { name: i.name || s.settings.name, bio: i.bio ?? s.settings.bio, color: i.color || s.settings.color, profileAt: i.at }), s.saveSettings(), n = true), n && (s.rooms.save(), s.rerender());
  }
  L = true;
}

function matchesFriend(friend, profile, verifyRelay = true) {
  return profile?.pub === friend.pub && profile.code === friend.code && profile.dhPub === friend.dhPub
    && (!verifyRelay || !friend.npub || profile.npub === friend.npub);
}
function applyFriendProfile(friends, friend, profile, verifiedContact = false) {
  const current = friends.get(friend.pub);
  if (!profile?.npub || !current || !matchesFriend(current, profile, !verifiedContact)) return false;
  const changes = { npub: profile.npub, nick: profile.nick || current.nick };
  if (verifiedContact) {
    const at = profile.at * 1_000;
    if (!Number.isSafeInteger(at) || at <= 0 || at > networkNow() + 120_000) return false;
    if (at < current.npubAt || (at === current.npubAt && current.npub !== profile.npub)) return false;
    changes.npubAt = at;
  }
  if (Object.entries(changes).some(([key, value]) => current[key] !== value)) friends.setFriendInfo(friend.pub, changes);
  return true;
}

let hydration = null;
function G() {
  if (!hydration) hydration = hydrateFriends().finally(() => { hydration = null; });
  return hydration;
}
async function hydrateFriends() {
  const friends = s.friends();
  const candidates = friends.list().filter(friend => !friend.npub || !friend.nick || !friends.isOnline(friend.pub));
  if (!candidates.length) return;

  const unresolved = await Promise.all(candidates.map(async friend => {
    if (isFriendCode(friend.code)) {
      const contact = await o.lookupFriendCode(d(), friend.code, { waitForAll: true }).catch(() => null);
      if (applyFriendProfile(friends, friend, contact, true) && contact.nick) return null;
    }
    if (friend.npub && friend.nick) return null;
    if (friend.nick && applyFriendProfile(friends, friend, await o.lookupNick(d(), friend.nick).catch(() => null))) return null;
    return friend;
  }));
  if (unresolved.some(Boolean)) {
    const people = await N(true).catch(() => []);
    for (const friend of unresolved.filter(Boolean)) {
      const profile = people.find(person => matchesFriend(friend, person));
      if (profile && await o.verifyDirectoryProfile(profile)) applyFriendProfile(friends, friend, profile);
    }
  }
  refreshFriendSubscriptions();
}
let heartbeatActive = false;
let heartbeatTimer;
let heartbeatPublishing = null;
let lastAcknowledgedHeartbeat = -Infinity;
let offlinePublishing = null;
function signedPresence(online) {
  const previous = s.store.get(PRESENCE_TIMESTAMP, null);
  const now = S();
  const createdAt = previous?.npub === f && Number.isSafeInteger(previous.at) && previous.at >= now && previous.at < now + 120
    ? previous.at + 1 : now;
  const event = o.presenceEvent(u, { online, createdAt });
  try {
    s.store.set(PRESENCE_TIMESTAMP, { npub: f, at: createdAt });
  } catch {
    // An unavailable local store should not prevent publishing presence.
  }
  return event;
}
function heartbeat(force = false) {
  if (!heartbeatActive || heartbeatPublishing) return;
  const now = performance.now();
  if (!force && now - lastAcknowledgedHeartbeat < PRESENCE_PERIOD) return;
  const pool = d();
  if (!pool.openCount()) return;
  heartbeatPublishing = pool.publish(signedPresence(true)).then(result => {
    if (result.ok) lastAcknowledgedHeartbeat = now;
  }).catch(() => {}).finally(() => { heartbeatPublishing = null; });
}
export function goOffline() {
  if (offlinePublishing) return offlinePublishing;
  heartbeatActive = false;
  clearInterval(heartbeatTimer);
  if (!u || !ee?.openCount()) return Promise.resolve(false);
  offlinePublishing = ee.publish(signedPresence(false), 1_500).then(result => Boolean(result.ok)).catch(() => false);
  return offlinePublishing;
}
let stopPresenceSubscription = null;
let presenceAuthors = "";
let lastFriendStatus = "";
function refreshPresence(friends) {
  const state = friends.list().map(friend => `${friend.pub}:${friends.getPresence(friend.pub)}`).join(",");
  if (state === lastFriendStatus) return;
  lastFriendStatus = state;
  s.rerender();
}
function refreshFriendSubscriptions() {
  const friends = s.friends();
  const authors = [...new Set(friends.list().map(friend => friend.npub).filter(Boolean))].sort();
  const subscriptionKey = authors.join(",");
  if (subscriptionKey !== presenceAuthors) {
    presenceAuthors = subscriptionKey;
    stopPresenceSubscription?.();
    stopPresenceSubscription = authors.length ? d().subscribe(o.presenceFilter(authors), {
      acceptEvent: event => Boolean(o.readPresence(event)),
      onEvent: event => {
        const presence = o.readPresence(event);
        const friend = friends.list().find(contact => contact.npub === event.pubkey);
        if (!presence || !friend) return;
        friends.setPresence(friend.pub, presence.at, presence.online, event.id);
        traceNetwork("presence", { online: Number(presence.online) }, event.id);
        refreshPresence(friends);
      },
    }) : null;
  }
  refreshPresence(friends);
}
let V = "";
const z = () => {
  const e = window.PulseAndroid;
  if (m || !e?.setPush) return;
  const t = JSON.stringify({ npub: f, dh: s.account().keys.dh, relays: poolRelays.slice(0, 5), guard: X.enabled(), friends: s.friends().list().filter((n) => n.npub).map((n) => ({ npub: n.npub, dhPub: n.dhPub, name: n.name, pub: n.pub })) });
  t !== V && (V = t, e.setPush(t));
}, H = async (e) => {
  const t = o.nickError(e);
  if (t) return { ok: false, text: t };
  try {
    const n = await o.nickOwner(d(), e, { requireComplete: true });
    return n && n !== f ? { ok: false, text: `@${e} уже занят` } : { ok: true, text: `@${e} свободен`, owner: n };
  } catch {
    return { ok: true, text: "Не удалось проверить — сеть недоступна", unsure: true };
  }
};

let vaultPublishing = null;
let publishedVault = null;
let vaultRelayRevision = -1;
let unavailableNick = null;
let changingNick = false;
const reportNickConflict = nick => {
  const message = `@${nick} уже занят. Выбери другой ник.`;
  unavailableNick = nick;
  s.toast(message, "bad");
  Q(message);
};
function retryVault() {
  if (vaultPublishing) return vaultPublishing;
  const vault = s.store.get("vault", null);
  if (changingNick || !vault?.sealed || vault.nick !== s.settings.nick || unavailableNick === vault.nick) return Promise.resolve();
  if (!vault.pending && vaultRelayRevision === directoryRelayRevision && publishedVault?.nick === vault.nick && publishedVault.sealed === vault.sealed) return Promise.resolve();
  vaultPublishing = publishVault(vault).finally(() => { vaultPublishing = null; });
  return vaultPublishing;
}
async function publishVault(vault) {
  const revision = directoryRelayRevision;
  let since = s.settings.nickSince || S();
  if (vault.checkNick) {
    const owner = await o.nickOwner(d(), vault.nick, { requireComplete: true });
    if (owner && owner !== f) {
      reportNickConflict(vault.nick);
      return;
    }
    if (!owner) {
      since = S();
      s.settings.nickSince = since;
      s.saveSettings();
    }
  }
  if (!(await d().publish(o.vaultEvent(u, vault.nick, vault.sealed, since))).ok) return;
  publishedVault = { nick: vault.nick, sealed: vault.sealed };
  vaultRelayRevision = revision;
  const current = s.store.get("vault", null);
  if (vault.pending && current?.nick === vault.nick && current.sealed === vault.sealed) {
    s.store.set("vault", publishedVault);
    s.rerender();
  }
}

async function le(nick, password) {
  const account = s.account();
  const settings = s.settings;
  changingNick = true;
  try {
    if (!await s.checkPassword(account.id, password)) throw new Error("Неверный пароль");
    const status = await H(nick);
    if (!status.ok || status.unsure) throw new Error(status.text);
    await vaultPublishing?.catch(() => {});
    const sealed = await o.sealVault(password, { keys: account.keys, nick, card: { name: settings.name, color: settings.color, theme: settings.theme } });
    const revision = directoryRelayRevision;
    const keepSince = nick === settings.nick && (!pendingRegistration() || status.owner === f);
    const since = keepSince ? settings.nickSince || S() : S();
    if (!(await d().publish(o.vaultEvent(u, nick, sealed, since))).ok) throw new Error("Сеть недоступна. Попробуй позже");
    Object.assign(settings, { nick, nickSince: since });
    s.saveSettings();
    publishedVault = { nick, sealed };
    vaultRelayRevision = revision;
    s.store.set("vault", publishedVault);
    U(account.id, { nick, pub: s.identity().pub });
    await M(true).catch(() => {});
    s.rerender();
  } finally {
    changingNick = false;
  }
}
async function ke(password) {
  const { nick, name, color, theme } = s.settings;
  const { keys } = s.account();
  if (!nick || !keys) return;
  const sealed = await o.sealVault(password, { keys, nick, card: { name, color, theme } });
  const previous = s.store.get("vault", null);
  s.store.set("vault", { nick, sealed, pending: true, ...(previous?.checkNick && { checkNick: true }) });
  await retryVault().catch(() => {});
}

async function resolveFriendProfile(input) {
  const raw = String(input ?? "").trim();
  const code = parseFriendCode(raw);
  if (code) return { code };
  if (KEY_FINGERPRINT.test(raw)) throw new Error("Это отпечаток ключа. Попроси друга скопировать ID вида id-… в настройках аккаунта.");
  const nick = o.normNick(raw);
  if (o.nickError(nick)) throw new Error("Введи @ник друга или его ID (id-…)");
  if (nick === s.settings.nick) throw new Error("Это твой собственный ник 🙂");
  const profile = await findNick(nick);
  if (!profile) throw new Error(`Пользователь @${nick} не найден на настроенных релеях.`);
  if (profile.pub === s.identity().pub) throw new Error("Это твой собственный аккаунт");
  return profile;
}
const de = async input => (await resolveFriendProfile(input)).code;
const Q = (message = "") => {
  const field = r("nk-nick");
  field.value = s.settings.nick || "";
  r("nk-pw").value = "";
  r("nk-state").textContent = message;
  r("nk-state").className = message ? "nk-state bad" : "nk-state";
  s.openModal("nick-modal");
  setTimeout(() => field.focus(), 60);
}, he = () => !m && Q(), ue = () => {
  const e = P(async () => {
    const t = o.normNick(r("nk-nick").value);
    if (t === s.settings.nick) return;
    r("nk-state").textContent = "Проверяем…";
    const n = await H(t);
    o.normNick(r("nk-nick").value) === t && (r("nk-state").textContent = n.text, r("nk-state").className = n.unsure ? "nk-state" : `nk-state ${n.ok ? "ok" : "bad"}`);
  }, 450);
  r("nk-nick").addEventListener("input", e), r("nk-save").addEventListener("click", async () => {
    const t = r("nk-save");
    t.disabled = true;
    try {
      await le(o.normNick(r("nk-nick").value), r("nk-pw").value);
      s.closeModal("nick-modal");
      if (nickDirectoryStatus() === "published") s.toast(`@${s.settings.nick} опубликован в каталоге`, "ok");
      else s.toast("Ник сохранён. Pulse повторит публикацию в каталоге.", "info");
    } catch (n) {
      s.toast(n.message, "bad");
    } finally {
      t.disabled = false;
    }
  }), r("nk-pw").addEventListener("keydown", (t) => t.key === "Enter" && r("nk-save").click());
};

async function searchDirectory(term, byNick) {
  const validNick = o.NICK_RE.test(term);
  if (byNick) {
    if (validNick) {
      const [exact] = await Promise.allSettled([findNick(term)]);
      return {
        people: exact.value ? [exact.value] : [], rooms: [], message: exact.reason?.message,
        failed: exact.status === "rejected" && exact.reason?.code !== "CONTACT_PENDING",
      };
    }
    const [directory] = await Promise.allSettled([N(true)]);
    const failed = directory.status === "rejected" || !o.queryWasComplete(directory.value);
    return { people: directory.value ?? [], rooms: [], failed };
  }
  const exactLookup = validNick ? findNick(term) : Promise.resolve(null);
  const [exact, directory, rooms] = await Promise.allSettled([exactLookup, N(), ae()]);
  const pendingContact = exact.reason?.code === "CONTACT_PENDING";
  return {
    people: [exact.value, ...(directory.value ?? [])].filter(Boolean),
    rooms: rooms.value ?? [],
    message: pendingContact ? exact.reason.message : null,
    failed: (!pendingContact && exact.status === "rejected") || [directory, rooms].some(result => result.status === "rejected")
      || !o.queryWasComplete(directory.value) || !o.queryWasComplete(rooms.value),
  };
}

function pe() {
  const input = r("friend-search");
  const results = r("search-results");
  const label = text => s.el("div", { class: "list-label" }, s.el("span", { text }));
  const item = (avatar, name, description, action, onclick) => s.el("div", { class: "sr-item" }, avatar,
    s.el("div", { class: "f-main" }, s.el("div", { class: "f-name", text: name }), s.el("div", { class: "f-sub", text: description })),
    s.el("button", { class: "btn sm primary", text: action, onclick }));
  let revision = 0;
  const search = P(async (current, raw, code, term) => {
    const isCurrent = () => current === revision && input.value.trim() === raw;
    if (!isCurrent()) return;
    const clear = () => {
      if (!isCurrent()) return;
      revision++;
      input.value = "";
      results.replaceChildren();
    };
    const contact = code ? await findContact(code) : null;
    const found = contact
      ? { people: contact.profile ? [contact.profile] : [], rooms: [], failed: contact.failed }
      : await searchDirectory(term, raw.startsWith("@"));
    if (!isCurrent()) return;

    const local = s.friends().list();
    const own = s.identity();
    const codes = new Set(local.map(friend => friend.code));
    const people = [];
    for (const person of found.people) {
      if (person.npub === f || person.pub === own.pub || codes.has(person.code) || !matchesSearch(person, raw, code, term)) continue;
      if (!await o.verifyDirectoryProfile(person)) continue;
      people.push(person);
      codes.add(person.code);
      if (people.length === 20) break;
    }
    const joined = new Set(s.rooms.list().map(room => room.code));
    const rooms = found.rooms.filter(room => !joined.has(room.code) && contains(room.name, term)).slice(0, 20);
    const items = [];
    const personItem = (person, description, action = "Добавить") => item(
        s.avatar({ name: person.name || "?", color: person.color, avatar: person.av }, "md"),
        person.name || (person.nick ? `@${person.nick}` : person.code), description, action, async event => {
          if (!isCurrent()) return;
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const { delivered } = await addFriend(person);
            s.toast(delivered ? "Заявка отправлена" : "Заявка сохранена. Pulse повторит отправку, когда появится связь с другом.", delivered ? "ok" : "info");
            clear();
            s.rerender();
          } catch (error) {
            s.toast(error.message, "bad");
          } finally {
            button.disabled = false;
          }
        });
    if (people.length) {
      items.push(label("Люди в Pulse"), ...people.map(person => personItem(person, person.nick ? `@${person.nick}` : person.code)));
    } else if (code && !codes.has(code)) {
      const message = found.failed ? "Каталог по ID недоступен" : "Карточка по этому ID пока недоступна";
      items.push(personItem({ code }, message, "Добавить по ID"));
    }
    if (rooms.length) {
      items.push(label("Публичные комнаты"), ...rooms.map(room => item(
        s.avatar({ name: room.name, avatar: room.icon, color: "#4a4f66" }, "md"), room.name,
        room.by ? `создал(а) @${room.by}` : "комната", "Войти", async () => {
          if (!isCurrent()) return;
          if (await s.rooms.join(room.code, { name: room.name, icon: room.icon })) clear();
        })));
    }
    if (!isCurrent()) return;
    const existing = local.some(friend => matchesSearch(friend, raw, code, term));
    traceNetwork("search", { found: Number(Boolean(people.length || rooms.length || existing)), partial: Number(Boolean(found.failed)) });
    if (!items.length && !existing) {
      const text = found.message || (found.failed ? DIRECTORY_UNAVAILABLE : `По «${term}» никого не нашли на настроенных релеях`);
      items.push(s.el("div", { class: "sr-empty", text }));
    }
    results.replaceChildren(...items);
  }, 350);
  input.addEventListener("input", () => {
    const current = ++revision;
    const raw = input.value.trim();
    const code = parseFriendCode(raw);
    const term = code || o.normNick(raw);
    if (term.length < 2) return results.replaceChildren();
    if (KEY_FINGERPRINT.test(raw)) {
      return results.replaceChildren(s.el("div", { class: "sr-empty", text: "Это отпечаток ключа. Для поиска попроси у друга @ник или ID вида id-…" }));
    }
    if (code === s.identity().friendCode) {
      return results.replaceChildren(s.el("div", { class: "sr-empty", text: "Это твой ID для друзей" }));
    }
    results.replaceChildren(s.el("div", { class: "sr-loading" }, s.el("span", { class: "spinner" }), "Ищем в сети…"));
    search(current, raw, code, term);
  });
}

function maintainNetwork(sync = true) {
  if (!d().openCount()) return;
  publishContact().catch(() => {});
  if (m) return;
  const pendingVault = pendingRegistration();
  retryVault().then(() => { if (pendingVault) return M(); }).catch(() => {});
  M().catch(() => {});
  F().catch(() => {});
  if (sync) ce().catch(() => {});
}

async function we(context) {
  s = context;
  const preferredRelays = s.settings.relays;
  accountRelays = preferredRelays == null ? o.savedRelayUrls() : o.relayUrls(preferredRelays);
  if (preferredRelays != null) o.rememberRelayUrls(preferredRelays);
  const account = s.account();
  m = !account?.keys;
  if (m) {
    u = s.store.get("legacyNostr", null);
    try {
      f = o.pubOf(u);
    } catch {
      u = o.newSecret();
      f = o.pubOf(u);
      s.store.set("legacyNostr", u);
    }
  } else {
    if (!account.keys.nostr) Z(account, { ...account.keys, nostr: o.newSecret() });
    u = account.keys.nostr;
    f = o.pubOf(u);
    h = await o.selfKey(u);
  }
  if (s.settings.npub !== f) {
    s.settings.npub = f;
    s.saveSettings();
  }
  const pool = d();
  v();
  pe();
  loadRequests();
  if (!m) ue();
  let open = pool.openCount();
  let hasConnected = open > 0;
  const replicateDirectory = P(async () => {
    if (!pool.openCount()) return;
    directoryRelayRevision++;
    await Promise.allSettled([contactPublishing, vaultPublishing, profilePublishing, roomsPublishing]);
    maintainNetwork(false);
  }, 600);
  pool.onChange(count => {
    const added = count > open;
    const reconnected = !open && count;
    open = count;
    if (reconnected) {
      maintainNetwork();
      flushRequests(true);
    }
    if (added) {
      heartbeat(true);
      if (hasConnected) replicateDirectory();
      hasConnected = true;
      G().catch(() => {});
    }
  });
  maintainNetwork(false);
  heartbeatActive = true;
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, PRESENCE_PERIOD);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) heartbeat(true); });
  if (!m) await re().catch(() => {});
  const since = Math.max((s.store.get("mailSince", 0) || 0) - 3600, S() - 30 * 86400);
  pool.subscribe({ kinds: [o.KIND_MAIL], "#p": [f], since }, { onEvent: event => ne(event).catch(console.warn) });
  flushRequests();
  z();
  refreshFriendSubscriptions();
  if (open) G().catch(() => {});
  setInterval(() => {
    heartbeat();
    maintainNetwork();
    flushRequests();
    z();
    refreshFriendSubscriptions();
  }, 8_000);
  setInterval(() => { if (pool.openCount()) G().catch(() => {}); }, 60_000);
  if (!m && !s.settings.nick && !sessionStorage.getItem("pulse:nick-asked")) {
    sessionStorage.setItem("pulse:nick-asked", "1");
    setTimeout(Q, 1500);
  }
}
export {
  addFriend,
  he as askNick,
  le as claimNick,
  d as getPool,
  be as mail,
  me as myNick,
  H as nickState,
  ke as onPasswordChanged,
  N as people,
  ae as publicRooms,
  de as resolveFriend,
  we as start
};
