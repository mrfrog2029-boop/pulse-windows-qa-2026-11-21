import { randomBytes } from 'node:crypto';
import { KIND_APP, KIND_MAIL, RELAYS } from '../web/js/net.js';

const nonce = randomBytes(32).toString('hex');
const signalKind = 20_000 + [...nonce].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10_000;
const since = Math.floor(Date.now() / 1000) - 300;
const filters = {
  nickname: { kinds: [KIND_APP], '#t': ['pulse-user'], '#n': ['pulseprobe_' + nonce.slice(0, 12)], limit: 1 },
  contact: { kinds: [KIND_APP], '#d': ['pulse-contact:' + nonce], limit: 1 },
  mail: { kinds: [KIND_MAIL], '#p': [nonce], limit: 1 },
  presence: { kinds: [KIND_APP], authors: [nonce], '#d': ['pulse-presence', 'pulse-presence-offline'], limit: 1 },
  room: { kinds: [29_943], '#t': [nonce], limit: 0 },
  roomHistory: { kinds: [29_943], '#t': [nonce], since, limit: 1 },
  signal: { kinds: [signalKind], '#x': [nonce], since },
};
const knownReasons = new Set(['auth-required', 'blocked', 'duplicate', 'error', 'invalid', 'mute', 'pow', 'rate-limited', 'restricted']);
const limits = [
  'max_limit', 'max_subscriptions', 'max_message_length', 'auth_required',
  'payment_required', 'restricted_writes', 'min_pow_difficulty', 'created_at_upper_limit', 'created_at_lower_limit',
];

function errorCode(error) {
  const code = error?.cause?.code ?? error?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,50}$/.test(code) ? code : 'unavailable';
}

async function readNip11(endpoint) {
  try {
    const response = await fetch(endpoint.replace(/^wss:/, 'https:'), {
      headers: { Accept: 'application/nostr+json' },
      signal: AbortSignal.timeout(6500), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return { status: response.status, json: false };
    const info = await response.json();
    const advertised = Object.fromEntries(limits.flatMap((key) => {
      const value = info.limitation?.[key];
      return ['number', 'boolean'].includes(typeof value) ? [[key, value]] : [];
    }));
    return { status: response.status, advertised };
  } catch (error) {
    return { error: errorCode(error) };
  }
}

function readWebSocket(endpoint) {
  return new Promise((resolve) => {
    const socket = new WebSocket(endpoint);
    const started = performance.now();
    const requests = new Map(Object.keys(filters).map(name => [name, { events: 0 }]));
    const summary = { openMs: null, authChallenge: false, requests: Object.fromEntries(requests) };
    const elapsed = () => Math.round(performance.now() - started);
    let finished = false;
    const deadline = setTimeout(() => finish('deadline'), 8000);

    function finish(reason) {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      resolve({ ...summary, reason });
      if (socket.readyState < WebSocket.CLOSING) socket.close();
    }

    socket.addEventListener('open', () => {
      if (finished) return;
      summary.openMs = elapsed();
      for (const [name, filter] of Object.entries(filters)) socket.send(JSON.stringify(['REQ', name, filter]));
    });
    socket.addEventListener('message', ({ data }) => {
      if (finished) return;
      let frame;
      try { frame = JSON.parse(data); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [type, name, value] = frame;
      if (type === 'AUTH') summary.authChallenge = true;
      const request = requests.get(name);
      if (!request || request.type) return;
      if (type === 'EVENT') request.events++;
      if (type !== 'EOSE' && type !== 'CLOSED') return;
      request.type = type;
      request.ms = elapsed();
      if (type === 'CLOSED') {
        const prefix = typeof value === 'string' ? value.split(':')[0].toLowerCase() : '';
        request.category = knownReasons.has(prefix) ? prefix : 'other';
      }
      socket.send(JSON.stringify(['CLOSE', name]));
      if ([...requests.values()].every(result => result.type)) finish('answered');
    });
    socket.addEventListener('error', ({ error }) => { summary.error = errorCode(error); });
    socket.addEventListener('close', ({ code }) => {
      summary.closeCode = code;
      finish('closed');
    });
  });
}

async function readClock(endpoint) {
  const start = Date.now();
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(6500), credentials: 'omit', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer',
    });
    const body = response.ok ? await response.text() : '';
    const match = /^ts=(\d{10}(?:\.\d{1,6})?)\r?$/m.exec(body);
    const elapsed = Date.now() - start;
    return {
      endpoint, status: response.status, elapsedMs: elapsed,
      utcMinusHostMs: match ? Math.round(Number(match[1]) * 1000 - start - elapsed / 2) : null,
      crossOriginRead: response.headers.get('access-control-allow-origin') === '*',
    };
  } catch (error) {
    return { endpoint, error: errorCode(error) };
  }
}

const hostUtcAtStart = new Date().toISOString();
const [relays, clock] = await Promise.all([
  Promise.all(RELAYS.map(async (endpoint) => {
    const [nip11, wss] = await Promise.all([readNip11(endpoint), readWebSocket(endpoint)]);
    return { endpoint, nip11, wss };
  })),
  Promise.all(['https://speed.cloudflare.com/cdn-cgi/trace', 'https://1.1.1.1/cdn-cgi/trace'].map(readClock)),
]);
console.log(JSON.stringify({ hostUtcAtStart, relays, clock }, null, 2));
