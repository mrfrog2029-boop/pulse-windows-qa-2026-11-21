const MAX_CORRECTION_MS = 86_400_000;
const CLOCK_CHANGE_MS = 2_000;
const RETRY_MS = 15_000;
const REFRESH_MS = 300_000;
const TRACE_URLS = [
  "https://speed.cloudflare.com/cdn-cgi/trace",
  "https://1.1.1.1/cdn-cgi/trace",
];

const appWindow = globalThis.window;
let anchor = null;
let lastAttempt = null;
let pending = null;

function localClock() {
  return { wall: Date.now(), monotonic: performance.now() };
}

function wallChange(before, after) {
  return Math.abs((after.wall - before.wall) - (after.monotonic - before.monotonic));
}

function estimatedUTC(local) {
  return anchor.utc + local.monotonic - anchor.monotonic;
}

function withinDeadline(operation, milliseconds) {
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(resolve, milliseconds, null); });
  return Promise.race([Promise.resolve().then(operation).catch(() => null), deadline])
    .finally(() => clearTimeout(timer));
}

async function readBridge(bridge) {
  const before = localClock();
  const offset = await withinDeadline(() => bridge.clockOffset(), 7_000);
  const after = localClock();
  if (!Number.isFinite(offset) || Math.abs(offset) >= MAX_CORRECTION_MS
      || wallChange(before, after) >= CLOCK_CHANGE_MS) return null;
  return { ...after, offset, utc: after.wall + offset };
}

async function readTrace(url) {
  const controller = new AbortController();
  const started = performance.now();
  try {
    const body = await withinDeadline(async () => {
      const response = await fetch(url, {
        signal: controller.signal, credentials: "omit", cache: "no-store",
        redirect: "error", referrerPolicy: "no-referrer",
      });
      return response.ok ? response.text() : null;
    }, 2_000);
    const match = /^ts=(\d{10}(?:\.\d{1,6})?)\r?$/m.exec(body ?? "");
    if (!match) return null;
    const after = localClock();
    const utc = Number(match[1]) * 1000 + (after.monotonic - started) / 2;
    return Math.abs(utc - after.wall) < MAX_CORRECTION_MS ? { ...after, utc } : null;
  } finally {
    controller.abort();
  }
}

function reliableNative(result) {
  // The native bridge returns zero when the two probes both fail, too.
  return result && (result.offset !== 0
    || (anchor && Math.abs(estimatedUTC(result) - result.wall) < CLOCK_CHANGE_MS));
}

async function measure() {
  const bridge = appWindow.pulse ?? appWindow.PulseAndroid;
  const native = typeof bridge?.clockOffset === "function" ? readBridge(bridge) : null;
  const quick = native && await withinDeadline(() => native, 1_750);
  if (reliableNative(quick)) return quick;

  for (const url of TRACE_URLS) {
    const sample = await readTrace(url);
    if (sample) return sample;
  }

  const fallback = quick ?? await native;
  return reliableNative(fallback) ? fallback : null;
}

export function refreshNetworkTime() {
  if (!appWindow) return Promise.resolve(false);
  if (pending) return pending;
  const now = localClock();
  if (lastAttempt && wallChange(lastAttempt, now) < CLOCK_CHANGE_MS
      && now.monotonic - lastAttempt.monotonic < (lastAttempt.success ? REFRESH_MS : RETRY_MS)) {
    return Promise.resolve(!!anchor);
  }

  lastAttempt = { ...now, success: false };
  pending = measure().then(sample => {
    if (sample) {
      anchor = sample;
      lastAttempt.success = true;
    }
    return !!anchor;
  }).catch(() => !!anchor).finally(() => { pending = null; });
  return pending;
}

export function networkNow() {
  const now = localClock();
  void refreshNetworkTime();
  // An acquired UTC anchor advances independently of later wall-clock changes.
  return anchor ? Math.round(estimatedUTC(now)) : now.wall;
}

// Start calibration before login and retry when the device returns online.
if (appWindow) {
  void refreshNetworkTime();
  appWindow.addEventListener?.("online", () => {
    if (!pending) lastAttempt = null;
    void refreshNetworkTime();
  });
}
