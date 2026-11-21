const events = [];
const session = crypto.randomUUID().slice(0, 8);
let sequence = 0;
const roomStages = new Set(['room.create', 'room.join', 'room.confirmed', 'room.timeout', 'room.reconnect']);
const stages = new Set(['query', 'publish', 'presence', 'search', ...roomStages]);
const fields = ['received', 'eose', 'refused', 'total', 'kind', 'accepted', 'online', 'found', 'partial', 'members'];

export function traceNetwork(stage, counts = {}, eventId = '') {
  if (!stages.has(stage)) return;
  const entry = { at: new Date().toISOString(), attempt: ++sequence, stage };
  for (const key of fields) {
    const count = counts[key];
    if (Number.isSafeInteger(count) && count >= 0) entry[key] = count;
  }
  if (/^[0-9a-f]{64}$/.test(eventId)) entry.ref = eventId.slice(0, 12);
  events.push(entry);
  if (events.length > 160) events.shift();
}

async function fingerprint(domain, value) {
  const bytes = new TextEncoder().encode(domain + '\n' + value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function traceRoom(stage, code, members = 0) {
  if (!roomStages.has(stage) || typeof code !== 'string') return;
  return fingerprint('pulse-diagnostic-room-v1', code)
    .then(ref => traceNetwork(stage, { members }, ref))
    .catch(() => traceNetwork(stage, { members }));
}

async function relayRefs(urls) {
  const addresses = new Set();
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.protocol === 'wss:') addresses.add(url.origin + url.pathname);
    } catch {}
  }
  return Promise.all([...addresses].sort().map(async address =>
    (await fingerprint('pulse-diagnostic-relay-v1', address)).slice(0, 12)));
}

export async function networkReport(directoryUrls, roomUrls) {
  const [directory, rooms] = await Promise.all([relayRefs(directoryUrls), relayRefs(roomUrls)]);
  const build = globalThis.document?.querySelector?.('meta[name="pulse-build-id"]')?.content ?? 'source';
  return { build, session, directory, rooms, events: events.map(event => ({ ...event })) };
}
