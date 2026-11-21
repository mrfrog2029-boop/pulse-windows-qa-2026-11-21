import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const web = process.env.PULSE_WEB_ROOT ?? fileURLToPath(new URL('../web/', import.meta.url));
const timeModule = pathToFileURL(path.join(web, 'js', 'network-time.js'));

function loadClock(scenario) {
  const url = new URL(timeModule);
  url.searchParams.set('test', scenario);
  return import(url);
}

test('presence carries the corrected timestamp when the device clock runs three minutes behind', async () => {
  const offset = 180_000;
  globalThis.window = { pulse: { clockOffset: async () => offset } };
  try {
    const net = await import(pathToFileURL(path.join(web, 'js', 'net.js')));
    await new Promise(resolve => setImmediate(resolve));
    const before = Math.floor((Date.now() + offset) / 1000);
    const presence = net.presenceEvent(net.newSecret());
    const after = Math.floor((Date.now() + offset) / 1000);
    assert.ok(presence.created_at >= before && presence.created_at <= after,
      `presence was stamped ${before - presence.created_at} seconds behind the relay clock`);
  } finally {
    delete globalThis.window;
  }
});

test('browser fallback calibrates from the timestamp body over HTTPS', async () => {
  const realFetch = globalThis.fetch;
  const serverOffset = 70_000;
  const requests = [];
  globalThis.window = {};
  globalThis.fetch = async (url, options) => {
    requests.push([url, options]);
    if (url === 'https://speed.cloudflare.com/cdn-cgi/trace') return { ok: false };
    return { ok: true, text: async () => `ts=${(Date.now() + serverOffset) / 1000}\n` };
  };
  try {
    const clock = await loadClock('browser-fallback');
    assert.equal(typeof clock.refreshNetworkTime, 'function');
    assert.equal(await clock.refreshNetworkTime(), true);
    assert.ok(Math.abs(clock.networkNow() - Date.now() - serverOffset) < 100);
    assert.equal(requests.length, 2);
    assert.equal(requests[1][0], 'https://1.1.1.1/cdn-cgi/trace');
    assert.ok(requests.every(([, options]) =>
      options.credentials === 'omit' && options.cache === 'no-store' && options.referrerPolicy === 'no-referrer'));
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.window;
  }
});

test('a Windows clock adjustment keeps the estimated network time and refreshes the bridge', async () => {
  const realNow = Date.now;
  const realFetch = globalThis.fetch;
  let wallAdjustment = 0;
  let measurements = 0;
  Date.now = () => realNow() + wallAdjustment;
  globalThis.window = { pulse: { clockOffset: async () => {
    measurements++;
    return 70_000 - wallAdjustment;
  } } };
  globalThis.fetch = async () => { throw new Error('A synchronized native clock needs no HTTP fallback'); };
  try {
    const clock = await loadClock('wall-jump');
    assert.equal(await clock.refreshNetworkTime(), true);
    assert.equal(measurements, 1);
    wallAdjustment = 70_000;
    assert.ok(Math.abs(clock.networkNow() - Date.now()) < 100);
    assert.equal(await clock.refreshNetworkTime(), true);
    assert.equal(measurements, 2);
    assert.ok(Math.abs(clock.networkNow() - Date.now()) < 100);
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
    delete globalThis.window;
  }
});

test('an inconclusive zero native sample does not delay recovery after HTTPS time becomes available', async (t) => {
  const start = 1_800_000_000_000;
  const offset = 70_000;
  let elapsed = 0;
  let attempts = 0;
  t.mock.method(Date, 'now', () => start + elapsed);
  t.mock.method(performance, 'now', () => elapsed);
  globalThis.window = { pulse: { clockOffset: async () => 0 } };
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    if (attempts <= 2) return { ok: false };
    return { ok: true, text: async () => `ts=${(Date.now() + offset) / 1000}\n` };
  });
  try {
    const clock = await loadClock('inconclusive-zero');
    assert.equal(await clock.refreshNetworkTime(), false);
    assert.equal(attempts, 2);
    elapsed = 15_001;
    assert.equal(await clock.refreshNetworkTime(), true);
    assert.equal(clock.networkNow(), Date.now() + offset);
  } finally {
    delete globalThis.window;
  }
});
