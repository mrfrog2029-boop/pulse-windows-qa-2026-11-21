import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startRelayFixture } from "./exe-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { values: options } = parseArgs({ options: {
  exe: { type: "string" }, sha256: { type: "string" }, web: { type: "string" },
  "baseline-web": { type: "string" }, "legacy-web": { type: "string" },
  "post-clean-installs": { type: "string" }, "build-id": { type: "string" },
  openssl: { type: "string" }, csc: { type: "string" }, edge: { type: "string" },
  report: { type: "string", default: join(here, "..", "test-runs", "exe", "acceptance.json") },
  deps: { type: "string", default: join(tmpdir(), "Pulse-Acceptance-Deps-20261120") },
  mode: { type: "string", default: "loopback" }, live: { type: "boolean" },
  timeout: { type: "string", default: "36" }, transport: { type: "string", default: "default" },
} });

class CheckError extends Error {}
function check(value, description) { if (!value) throw new CheckError(description); }
const isBaseline = Boolean(options["baseline-web"]);
const isPublic = options.mode === "public";
const noDirect = options.transport === "relay-only";
const timeout = Number(options.timeout) * 1000;
const origin = "https://app.pulse.invalid";
const idPattern = /^id-[1-9A-HJ-NP-Za-km-z]{16,24}$/;
const roomPattern = /^pulse-[1-9A-HJ-NP-Za-km-z]{16,40}$/;
const runId = randomBytes(5).toString("hex");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const expectedWeb = resolve(options.web ?? join(here, "..", "web"));
const assets = ["/index.html", "/styles.css", "/js/auth.js", "/js/account.js", "/js/net.js",
  "/js/network-time.js", "/js/chunk-7GRP2DEX.js", "/js/chunk-ITVMY7Q3.js", "/js/guard.js", "/js/room-links.js",
  "/js/room-relay.js", "/js/room-voice.js", "/vendor/vdoninja-sdk-1.6.2/vdoninja-sdk.min.js"];
const voiceModules = ["/js/room-relay.js", "/js/room-voice.js", "/vendor/vdoninja-sdk-1.6.2/vdoninja-sdk.min.js"];
const report = { startedAt: new Date().toISOString(), runId, mode: options.mode, transport: options.transport,
  clients: isBaseline ? "Two Edge processes serving extracted baseline WebView assets" : "Two Pulse.exe processes under one Windows host",
  executableSha256: null, resources: {}, checks: {}, lifecycle: [], relay: null };

check(process.platform === "win32", "This acceptance runner uses the Windows WebView2 runtime.");
check(["loopback", "public"].includes(options.mode), "Use --mode loopback or public.");
check(["default", "relay-only"].includes(options.transport), "Use --transport default or relay-only.");
check(Number.isFinite(timeout) && timeout >= 18000, "Use a timeout of at least 18 seconds.");
check(!isPublic || options.live, "Pass --live for real disposable publications to the bundled public relays.");
check(isBaseline || (options.exe && /^[a-fA-F0-9]{64}$/.test(options.sha256 ?? "")),
  "Supply the portable-enabled release path and its verified --sha256.");
check(!options["post-clean-installs"] || (!isPublic && !isBaseline && process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_ENVIRONMENT === "github-hosted" && process.env.RUNNER_ARCH === "X64" && process.env.RUNNER_TEMP),
  "Post-clean acceptance expects a disposable GitHub Windows runner and the exact native release.");
const require = createRequire(join(resolve(options.deps), "package.json"));
const { chromium } = require("playwright-core");
const ws = require("ws");

let fixture;
let launcher;
const clients = [];
const publicAuthors = new Set();
const publicRecipients = new Set();
const publicRoomTopics = new Map();
const forbiddenWireText = new Set();
let plainLeakCount = 0;
const rendererErrors = new Map();

async function waitFor(description, condition, limit = timeout) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const value = await condition();
    if (value) return value;
    await sleep(100);
  }
  throw new CheckError(description);
}

async function stage(label, work, prereq = true) {
  const tick = Date.now();
  if (!prereq) {
    report.checks[label] = { status: "BLOCKED", details: "Prerequisite failed or requires loopback outage controls." };
  } else {
    try {
      const details = await work();
      report.checks[label] = { status: "PASS", ms: Date.now() - tick, details };
    } catch (error) {
      report.checks[label] = { status: "FAIL", ms: Date.now() - tick,
        details: error instanceof CheckError ? error.message : error.name,
        testCodeLine: Number(error.stack?.match(/exe-acceptance\.mjs:(\d+):\d+/)?.[1]) || undefined };
    }
  }
  const result = report.checks[label];
  console.log(result.status, label, result.status === "PASS" ? `${result.ms}ms` : result.details);
  return result.status === "PASS";
}

async function findPort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

function rendererInstrumentation({ relayOnly }) {
  if (!relayOnly) return;
  const NativeConnection = window.RTCPeerConnection;
  window.pulseQaPeerConnections = [];
  window.RTCPeerConnection = class extends NativeConnection {
    constructor(config) {
      super({ ...config, iceServers: [], iceTransportPolicy: "relay" });
      window.pulseQaPeerConnections.push(this);
    }
    setConfiguration(config) {
      super.setConfiguration({ ...config, iceServers: [], iceTransportPolicy: "relay" });
    }
  };
}

function trackPublicTraffic(page) {
  const stats = new Map();
  page.on("websocket", (socket) => {
    const endpoint = new URL(socket.url()).hostname;
    const summary = stats.get(endpoint) ?? { sockets: 0, accepted: 0, rejected: 0, eose: 0,
      profilesAccepted: 0, roomAccepted: 0, networkErrors: 0 };
    summary.sockets++;
    stats.set(endpoint, summary);
    const pending = new Map();
    socket.on("framesent", ({ payload }) => {
      try {
        const [method, event] = JSON.parse(String(payload));
        if (method !== "EVENT" || !event?.id) return;
        if ([...forbiddenWireText].some((text) => String(payload).includes(text))) plainLeakCount++;
        const category = event.kind === 29943 ? "room" : event.kind === 30078 &&
          event.tags.some(([key, value]) => key === "d" && value === "pulse-profile") ? "profile" : "other";
        pending.set(event.id, category);
        if (category === "profile") publicAuthors.add(event.pubkey);
        if (event.kind === 4454) publicRecipients.add(event.tags.find(([key]) => key === "p")?.[1]);
        if (category === "room") {
          const topic = event.tags.find(([key]) => key === "t")?.[1];
          if (!publicRoomTopics.has(topic)) publicRoomTopics.set(topic, new Set());
          publicRoomTopics.get(topic).add(event.pubkey);
        }
      } catch {}
    });
    socket.on("framereceived", ({ payload }) => {
      try {
        const [method, id, accepted] = JSON.parse(String(payload));
        if (method === "EOSE") summary.eose++;
        if (method !== "OK" || !pending.has(id)) return;
        const category = pending.get(id);
        pending.delete(id);
        if (accepted) {
          summary.accepted++;
          if (category === "profile") summary.profilesAccepted++;
          if (category === "room") summary.roomAccepted++;
        } else summary.rejected++;
      } catch {}
    });
    socket.on("socketerror", () => summary.networkErrors++);
  });
  return stats;
}

async function installAssetRoute(context, root) {
  await context.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const name = decodeURIComponent(url.pathname).replace(/^\//, "");
    const file = resolve(root, name || "index.html");
    if (!file.startsWith(root + sep)) return route.abort();
    const type = { html: "text/html", js: "text/javascript", css: "text/css", png: "image/png", woff2: "font/woff2" };
    try {
      await route.fulfill({ body: await readFile(file),
        contentType: type[name.split(".").at(-1)] ?? "application/octet-stream",
        headers: { "Cache-Control": "no-store" } });
    } catch { await route.fulfill({ status: 404 }); }
  });
}

function makeClients(root, suffix = "") {
  return ["A", "B"].map((label) => {
    const peer = { label: label + suffix, root: join(root, label), name: `Pulse QA ${label}${suffix} ${runId}`,
      nick: `pulsee2e_${label.toLowerCase()}${suffix.toLowerCase()}_${runId}`,
      password: `Pulse-QA!${randomBytes(18).toString("hex")}`, stats: new Map() };
    forbiddenWireText.add(peer.password);
    clients.push(peer);
    return peer;
  });
}

function webArgs() {
  const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--disable-background-networking",
    "--disable-quic", "--mute-audio", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];
  if (fixture) args.push(`--proxy-server=${fixture.proxy}`, `--ignore-certificate-errors-spki-list=${fixture.pin}`,
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
  return args;
}

function inspectBrowserChild(pid, port) {
  try {
    const query = `@($owned = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid} AND Name = 'msedgewebview2.exe'"); ` +
      `[pscustomobject]@{childCount=$owned.Count; commandLines=@($owned | Where-Object CommandLine).Count; ` +
      `debugPortConfigured=@($owned | Where-Object CommandLine -Match '--remote-debugging-port=${port}( |$)').Count}) | ConvertTo-Json -Compress`;
    const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", query],
      { encoding: "utf8", timeout: 8000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(result);
  } catch (error) { return { error: error.name }; }
}

async function launch(peer, { legacyRoot, fresh = false } = {}) {
  await mkdir(peer.root, { recursive: true });
  if (isBaseline) {
    const edge = options.edge ?? join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe");
    peer.context = await chromium.launchPersistentContext(join(peer.root, "EdgeProfile"), {
      executablePath: edge, args: webArgs(), headless: true, permissions: ["microphone"], viewport: { width: 1400, height: 880 },
    });
    peer.page = peer.context.pages()[0];
    if (!fixture) await installAssetRoute(peer.context, resolve(options["baseline-web"]));
  } else {
    const image = join(peer.root, "Pulse.exe");
    const data = join(peer.root, "Data");
    const profile = join(data, "WebView");
    if (fresh) {
      check(!existsSync(profile), "Expected a new WebView2 user data folder.");
      await copyFile(resolve(options.exe), image);
      await writeFile(join(peer.root, "Pulse.ini"), `; Pulse от exepcstudio — настройки этой копии\nportable=1\ndata=${data}\ntray=0\nautostart=0\n`);
    }
    check(sha(await readFile(image)) === report.executableSha256, "Disposable image differs from release SHA-256.");
    const port = await findPort();
    const additional = [...webArgs(), `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", "--enable-automation"];
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^WEBVIEW2_/i.test(key)));
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = additional.join(" ");
    const privateDesktop = !options["post-clean-installs"];
    const args = privateDesktop ? [image] : [image, "--inherit-desktop"];
    const child = spawn(launcher, args, { cwd: peer.root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    peer.child = child;
    peer.childOutput = "";
    peer.childError = "";
    child.stdout.on("data", (bytes) => { peer.childOutput += bytes; });
    child.stderr.on("data", (bytes) => { peer.childError += bytes; });
    child.stdin.on("error", () => {});
    child.on("error", () => {});
    const url = `http://127.0.0.1:${port}`;
    peer.pid = await waitFor("Windows child launcher did not create a Pulse.exe process.", () =>
      Number(peer.childOutput.match(/PULSE_PID=(\d+)/)?.[1]));
    const observation = { label: peer.label, pid: peer.pid, fresh, privateDesktop, legacyAssetsRoute: Boolean(legacyRoot),
      cdpEndpointReached: false, cdpTargets: {} };
    report.lifecycle.push(observation);
    try {
      await waitFor("The spawned Pulse.exe did not expose its isolated WebView2 target.", async () => {
        if (child.exitCode != null) throw new CheckError(`Pulse.exe launcher exited early with code ${child.exitCode}.`);
        try {
          const response = await fetch(`${url}/json/list`, { signal: AbortSignal.timeout(700) });
          observation.cdpEndpointReached = true;
          observation.cdpHttpStatus = response.status;
          const targets = await response.json();
          observation.cdpTargets = { total: targets.length,
            blank: targets.filter((target) => target.url === "about:blank").length,
            errors: targets.filter((target) => target.url?.startsWith("chrome-error:")).length,
            app: targets.filter((target) => target.url?.startsWith(origin + "/")).length };
          return targets.some((target) => target.type === "page" && target.url.startsWith(origin + "/"));
        } catch { return false; }
      });
    } catch (error) {
      observation.webViewChildren = inspectBrowserChild(peer.pid, port);
      console.log("NATIVE START", JSON.stringify(observation));
      throw error;
    }
    peer.browser = await chromium.connectOverCDP(url, { timeout });
    peer.page = await waitFor("CDP did not attach to the launched native WebView page.", () =>
      peer.browser.contexts().flatMap((context) => context.pages()).find((page) => page.url().startsWith(origin + "/")));
    peer.context = peer.page.context();
    await peer.page.setViewportSize({ width: 1400, height: 880 });
    const browserCdp = await peer.browser.newBrowserCDPSession();
    const runtime = await browserCdp.send("Browser.getVersion");
    const command = await browserCdp.send("Browser.getBrowserCommandLine").catch(() => ({ arguments: [] }));
    const dataArg = command.arguments.find((arg) => arg.startsWith("--user-data-dir="))?.substring(16);
    const expectedProfile = resolve(profile).toLowerCase();
    const reportedProfile = dataArg ? resolve(dataArg).toLowerCase() : null;
    const profileArgMatches = reportedProfile === expectedProfile || reportedProfile?.startsWith(expectedProfile + sep);
    check(profileArgMatches && (await lstat(profile)).isDirectory(), "Unexpected WebView2 runtime user data path.");
    Object.assign(observation, { runtime: runtime.product, profileCreated: true, profileArgMatches });
    if (legacyRoot) await installAssetRoute(peer.context, resolve(legacyRoot));
  }
  peer.page.setDefaultTimeout(timeout);
  peer.page.on("pageerror", (error) => { rendererErrors.set(error.name, (rendererErrors.get(error.name) ?? 0) + 1); });
  if (isPublic) peer.stats = trackPublicTraffic(peer.page);
  await peer.context.addInitScript(rendererInstrumentation, { relayOnly: noDirect });
  if (isBaseline) await peer.page.goto(`${fixture?.base ?? origin}/index.html`);
  if (legacyRoot || (!isBaseline && noDirect)) await peer.page.reload({ waitUntil: "domcontentloaded" });
}

async function stop(peer) {
  if (isBaseline) {
    if (peer.context) await peer.context.close().catch(() => {});
    peer.context = null;
    return;
  }
  const child = peer.child;
  if (child && child.exitCode == null && child.signalCode == null) {
    child.stdin.end("stop\n");
    const exit = waitFor("The dedicated Windows test job did not shut down.", () =>
      child.exitCode !== null || child.signalCode !== null, 14000);
    try { await exit; } catch { child.kill(); await sleep(600); }
    report.lifecycle.push({ label: peer.label, stopped: /CLOSE=graceful/.test(peer.childOutput) ? "WM_CLOSE" : "job" });
  }
  peer.child = null;
  peer.browser = null;
  peer.context = null;
}

const text = async (page, selector) => (await page.locator(selector).textContent())?.trim() ?? "";
const isVisible = (page, selector) => page.locator(selector).isVisible();
const visibility = async (page, selector) => page.locator(selector).waitFor({ state: "visible" });
const hidden = async (page, selector) => page.locator(selector).waitFor({ state: "hidden" });
const expectText = (page, selector, value) => waitFor(`Unexpected value in ${selector}.`, async () =>
  (await text(page, selector)) === value);
async function click(locator) {
  await locator.waitFor();
  await waitFor("The requested UI action remained disabled.", () => locator.isEnabled());
  await locator.evaluate((button) => button.click());
}
const clickIn = (page, selector) => click(page.locator(selector));
async function input(page, selector, value, change = false) {
  const field = page.locator(selector);
  await field.waitFor();
  const written = await field.evaluate((element, { value, change }) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    if (change) element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === value;
  }, { value, change });
  check(written, `The value in ${selector} changed during input.`);
}

async function attestResourceLoads(peer, root, label, paths) {
  if (existsSync(join(root, "js/network-diagnostics.js"))) paths = [...paths, "/js/network-diagnostics.js"];
  const actual = await peer.page.evaluate(async (paths) => {
    const originallyLoaded = new Set(performance.getEntriesByType("resource")
      .filter((entry) => entry.initiatorType !== "fetch").map((entry) => new URL(entry.name).pathname));
    return Object.fromEntries(await Promise.all(paths.map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      return [path, { status: response.status, mime: response.headers.get("content-type"), hash,
        cache: response.headers.get("cache-control"),
        loadedByPage: originallyLoaded.has(path) }];
    })));
  }, paths);
  report.resources[label] = actual;
  for (const path of paths) {
    const expected = await readFile(join(root, path.slice(1)));
    check(actual[path].status === 200 && actual[path].hash === sha(expected), `Loaded bytes differ for ${path}.`);
    if (path.endsWith(".js")) check(/javascript/i.test(actual[path].mime ?? ""), `Wrong script MIME for ${path}.`);
    check(/(?:^|,)\s*no-store\b/i.test(actual[path].cache ?? ""), `The live resource ${path} allows caching.`);
  }
  for (const path of ["/js/auth.js", "/js/net.js", "/js/account.js", "/styles.css"])
    check(actual[path]?.loadedByPage, `Normal startup did not load ${path}.`);
  if (!isBaseline && root === expectedWeb) {
    const id = await peer.page.evaluate(() => document.querySelector('meta[name="pulse-build-id"]')?.content);
    check(id && (!options["build-id"] || id === options["build-id"]), "The document build marker differs from the expected release.");
    actual.buildId = id;
  }
}

async function activeModules(peer, label) {
  const loaded = await peer.page.evaluate(() => [...new Set(performance.getEntriesByType("resource")
    .filter((entry) => entry.initiatorType !== "fetch" && entry.name.startsWith(location.origin))
    .map((entry) => new URL(entry.name).pathname).filter((path) => path.endsWith(".js")))].sort());
  report.resources[label] = loaded;
  return loaded;
}

async function assertIndependence([a, b]) {
  if (!isBaseline) {
    check(a.pid !== b.pid, "Both WebView controls belong to the same Pulse process.");
    const native = await Promise.all([a, b].map((peer) => peer.page.evaluate(() =>
      location.origin === "https://app.pulse.invalid" && document.documentElement.classList.contains("native-frame") &&
      typeof window.pulse?.info === "function")));
    check(native.every(Boolean), "Expected two app-hosted WebView2 documents with the native bridge.");
  }
  const key = "pulse-qa-profile-proof";
  const separate = async (owner, other, value) => {
    await owner.page.evaluate(({ key, value }) => {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    }, { key, value });
    return other.page.evaluate((key) => !localStorage.getItem(key) && !sessionStorage.getItem(key), key);
  };
  check(await separate(a, b, "A"), "The B profile could see the A storage marker.");
  await a.page.evaluate((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); }, key);
  check(await separate(b, a, "B"), "The A profile could see the B storage marker.");
  await b.page.evaluate((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); }, key);
}

async function cleanOnboard(peer) {
  await visibility(peer.page, "#ob-step1");
  const fresh = await peer.page.evaluate(() => !localStorage.getItem("pulse:accounts") &&
    !localStorage.getItem("pulse:lastAccount") && !sessionStorage.getItem("pulse:locked"));
  check(fresh, "A clean test profile already contains Pulse account state.");
  if (fixture) await peer.page.evaluate((url) => localStorage.setItem("pulse:networkRelays", JSON.stringify([url])), fixture.url);
  await input(peer.page, "#ob-name", peer.name);
  await input(peer.page, "#ob-nick", peer.nick);
  await input(peer.page, "#ob-pw", peer.password);
  await input(peer.page, "#ob-pw2", peer.password);
  await clickIn(peer.page, "#ob-terms-open");
  await clickIn(peer.page, "#terms-yes");
  await clickIn(peer.page, "#ob-create");
  await waitFor("Onboarding did not finish through the new account UI.", async () => {
    if (await isVisible(peer.page, "#ob-go")) return true;
    const error = await text(peer.page, "#ob-error");
    if (/пароли не совпадают/i.test(error)) throw new CheckError("The onboarding UI rejected the verified matching passwords.");
    return false;
  });
  await clickIn(peer.page, "#ob-go");
  await expectText(peer.page, "#w-name", peer.name);
  await hidden(peer.page, "#onboarding");
}

const friend = (a, b) => a.page.locator("#friend-list .f-item").filter({ has: a.page.getByText(b.name, { exact: true }) });
const searchRow = (a, b) => a.page.locator("#search-results .sr-item").filter({ has: a.page.getByText(b.name, { exact: true }) });

async function startSearch(peer, query) {
  await input(peer.page, "#friend-search", "");
  await input(peer.page, "#friend-search", query);
}

async function searchOutcome(peer, target) {
  return waitFor("Search did not reach a classified terminal UI result.", async () => {
    if (target && await searchRow(peer, target).isVisible()) return "found";
    const blank = peer.page.locator("#search-results .sr-empty");
    if (!await blank.isVisible()) return false;
    const message = (await blank.textContent()).toLowerCase();
    if (/не удалось|недоступ|соединени|подключени/.test(message)) return "technical failure";
    if (/никого не нашли|нет пользователя|не найден/.test(message)) return "absent";
    return false;
  });
}

async function findByNick(a, b) {
  await startSearch(a, "@" + b.nick.toUpperCase());
  const result = await searchOutcome(a, b);
  check(result === "found", `Expected existing nickname in ${a.label}, search reported ${result}.`);
  await searchRow(a, b).getByText("@" + b.nick, { exact: true }).waitFor();
  return result;
}

async function friendPair(a, b) {
  await findByNick(a, b);
  await click(searchRow(a, b).getByRole("button", { name: "Добавить", exact: true }));
  const request = b.page.locator("#req-box .req").filter({ has: b.page.getByText(a.name, { exact: true }) });
  await click(request.getByTitle("Принять", { exact: true }));
  await Promise.all([friend(a, b).waitFor(), friend(b, a).waitFor()]);
}

async function online(a, b) {
  return waitFor(`Expected confirmed online state in ${a.label}.`, async () =>
    await friend(a, b).locator(".status-dot.on").isVisible());
}

async function readFriendCode(peer) {
  await clickIn(peer.page, "#rail-settings");
  const code = await text(peer.page, "#s-friendcode");
  await clickIn(peer.page, "#settings-modal [data-close]");
  check(idPattern.test(code), "Expected a stable friend ID in account settings.");
  return code;
}

async function saveLoopbackThroughUi(peer) {
  await clickIn(peer.page, "#rail-settings");
  await clickIn(peer.page, '.snav[data-sec="network"]');
  await input(peer.page, "#s-relays", fixture.url, true);
  await clickIn(peer.page, "#settings-modal [data-close]");
}

async function signIn(peer) {
  await visibility(peer.page, "#ob-login");
  await input(peer.page, "#login-pw", peer.password);
  await peer.page.locator("#login-remember").evaluate((field) => { field.checked = true; });
  await clickIn(peer.page, "#login-btn");
  await expectText(peer.page, "#w-name", peer.name);
  await hidden(peer.page, "#onboarding");
}

async function signOut(peer) {
  await clickIn(peer.page, "#rail-settings");
  await clickIn(peer.page, '.snav[data-sec="account"]');
  await clickIn(peer.page, "#s-logout");
  await click(peer.page.locator("#toasts").getByRole("button", { name: "Выйти", exact: true }));
  await visibility(peer.page, "#ob-login");
}

async function leave(peer) {
  if (!await isVisible(peer.page, "#view-room")) return;
  await clickIn(peer.page, "#btn-leave");
  await hidden(peer.page, "#view-room");
}

async function joinByCode(peer, code, name) {
  await clickIn(peer.page, "#rail-add");
  await clickIn(peer.page, '#rm-tabs [data-v="join"]');
  await input(peer.page, "#rm-code", `Залетай в Pulse — комната «${name}»\nКод: ${code}`);
  await clickIn(peer.page, "#rm-join-btn");
}

async function bothInRoom(a, b, name) {
  await Promise.all([[a, b], [b, a]].map(async ([peer, other]) => {
    await expectText(peer.page, "#room-name", name);
    await waitFor(`${peer.label} did not display ${other.label} in its room roster.`, () =>
      peer.page.locator("#people").getByText(other.name, { exact: true }).isVisible());
    await expectText(peer.page, "#people-count", "2");
  }));
}

async function confirmRoomModules(pair) {
  const loaded = await Promise.all(pair.map((peer) => waitFor(`${peer.label} did not load the room transport modules.`, async () => {
    const paths = await activeModules(peer, `${peer.label} after room entry`);
    return voiceModules.every((path) => paths.includes(path)) && paths;
  })));
  return loaded.map((paths) => voiceModules.every((path) => paths.includes(path)));
}

async function exchangeText(a, b) {
  for (const [sender, receiver] of [[a, b], [b, a]]) {
    const message = "Pulse QA chat " + randomBytes(8).toString("hex");
    forbiddenWireText.add(message);
    await input(sender.page, "#msg-input", message);
    await clickIn(sender.page, "#send");
    await waitFor(`The room message sent by ${sender.label} did not appear in its own chat.`, () =>
      sender.page.locator("#messages .kind-text .bubble").filter({ hasText: message }).isVisible());
    await waitFor(`The room message sent by ${sender.label} did not appear on ${receiver.label}.`, () =>
      receiver.page.locator("#messages .kind-text .bubble").filter({ hasText: message }).isVisible());
  }
}

async function roomPair(host, guest, suffix) {
  for (const peer of [host, guest]) await leave(peer);
  const name = `Pulse QA ${suffix} ${runId}`;
  forbiddenWireText.add(name);
  await clickIn(host.page, "#rail-add");
  await input(host.page, "#rm-name", name);
  check(!await host.page.locator("#rm-public").isChecked(), "The disposable room must be private.");
  await clickIn(host.page, "#rm-create-btn");
  await expectText(host.page, "#room-name", name);
  const code = await waitFor("The room host did not display a valid join code.", async () => {
    const value = await text(host.page, "#waiting-code");
    return roomPattern.test(value) && await isVisible(host.page, "#waiting-code") && value;
  });
  forbiddenWireText.add(code);
  await joinByCode(guest, code, name);
  await bothInRoom(host, guest, name);
  await exchangeText(host, guest);
  const topic = createHash("sha256").update("pulse-room-relay-topic-v1:" + code).digest("hex");
  const observed = () => fixture ? fixture.matchedRoomTopic(code) : (publicRoomTopics.get(topic)?.size ?? 0) >= 2;
  if (noDirect) await waitFor("Relay-only room did not exchange signed events on one shared topic.", observed);
  const commonRoomTopic = observed();
  return { code, name, commonRoomTopic };
}

async function invalidRoom(peer) {
  await leave(peer);
  await joinByCode(peer, "invalid-test-code", "Unknown test room");
  await waitFor("Malformed code did not get an error.", async () =>
    /не код комнаты/i.test(await text(peer.page, "#toasts")));
  check(!await isVisible(peer.page, "#view-room"), "A malformed code opened the room UI.");
  await clickIn(peer.page, "#room-modal [data-close]");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const unknown = "pulse-" + [...randomBytes(36)].map((byte) => alphabet[byte % alphabet.length]).join("");
  await joinByCode(peer, unknown, "Unknown test room");
  const outcome = await waitFor("No final outcome for the valid-format, unused room code.", async () => {
    if (await isVisible(peer.page, "#view-room")) return "room opened";
    const toast = await text(peer.page, "#toasts");
    if (/комната по этому коду пока не найдена/i.test(toast)) return "not found";
    if (/не удалось проверить код комнаты/i.test(toast)) return "verification unavailable";
    return false;
  });
  check(outcome === "not found", `The unused valid-format code reported ${outcome}.`);
}

async function assertRelayOnly(peers) {
  if (!noDirect) return;
  const state = await Promise.all(peers.map((peer) => peer.page.evaluate(() => {
    const tracked = window.pulseQaPeerConnections ?? [];
    return { observed: tracked.length, direct: tracked.some((connection) =>
      connection.connectionState === "connected" || ["connected", "completed"].includes(connection.iceConnectionState)) };
  })));
  check(state.every((item) => item.observed && !item.direct), "RTC evidence did not distinguish the relay-only room path.");
  return state;
}

async function oldProfileRound(root, releaseRoot) {
  const pair = makeClients(root, "L");
  const [a, b] = pair;
  for (const peer of pair) {
    await launch(peer, { fresh: true, legacyRoot: options["legacy-web"] });
    await attestResourceLoads(peer, resolve(options["legacy-web"]), `${peer.label} extracted baseline`, assets);
    await cleanOnboard(peer);
    await saveLoopbackThroughUi(peer);
  }
  await friendPair(a, b);
  const originalIds = await Promise.all(pair.map(readFriendCode));
  check(originalIds[0] !== originalIds[1], "Baseline accounts do not have distinct friend IDs.");
  for (const peer of pair) await peer.page.evaluate((value) => {
    localStorage.setItem("pulse-qa-profile-persistence", value);
    sessionStorage.setItem("pulse-qa-profile-persistence", value);
  }, peer.label);
  for (const peer of pair) await stop(peer);
  for (const peer of pair) {
    await launch(peer);
    await expectText(peer.page, "#w-name", peer.name);
    await attestResourceLoads(peer, releaseRoot, `${peer.label} final`, assets);
    const reopenedSameProfile = await peer.page.evaluate((value) => {
      const key = "pulse-qa-profile-persistence";
      const result = localStorage.getItem(key) === value && !sessionStorage.getItem(key);
      localStorage.removeItem(key);
      return result;
    }, peer.label);
    check(reopenedSameProfile, "The update did not reopen the same storage with a new WebView session.");
    const keptRelay = await peer.page.evaluate(async (expected) => {
      const { savedRelayUrls } = await import("/js/net.js");
      return savedRelayUrls().length === 1 && savedRelayUrls()[0] === expected;
    }, fixture.url);
    check(keptRelay, "The explicit loopback relay setting did not survive the update.");
  }
  check((await readFriendCode(a)) === originalIds[0] && (await readFriendCode(b)) === originalIds[1],
    "A persistent account changed its stable ID across the web update.");
  await Promise.all([online(a, b), online(b, a)]);
  await roomPair(a, b, "legacy");
  return { persistentDistinctIds: true, existingProfilesWithNewSessions: true, friendships: true,
    configuredRelay: true, roomParticipants: 2, textDirections: 2 };
}

async function acceptPair(pair, prefix) {
  const [a, b] = pair;
  const onboards = await stage(`${prefix}startup and new profiles`, async () => {
    for (const peer of pair) await launch(peer, { fresh: true });
    await assertIndependence(pair);
    for (const peer of pair) {
      await attestResourceLoads(peer, isBaseline ? resolve(options["baseline-web"]) : expectedWeb, peer.label, assets);
      await cleanOnboard(peer);
      const loaded = await activeModules(peer, `${peer.label} after onboarding`);
      check(loaded.includes("/js/chunk-ITVMY7Q3.js"), "Normal sign-in did not activate the app renderer module.");
    }
    return { distinctProfilesAndSessions: true, freshProfiles: 2 };
  });
  const found = await stage(`${prefix}1 bidirectional exact nickname`, async () => {
    if (fixture) await waitFor("Both synthetic profiles must publish to the loopback relay.", () => fixture.summary().authors >= 2);
    const result = await Promise.all([findByNick(a, b), findByNick(b, a)]);
    return { A: result[0], B: result[1] };
  }, onboards);
  await stage(`${prefix}2a absent nickname`, async () => {
    await startSearch(a, "@qa_missing_" + runId);
    const result = await searchOutcome(a);
    check(result === "absent", `The absent nickname reported ${result}.`);
    return { result };
  }, onboards);
  await stage(`${prefix}2b directory technical failure`, async () => {
    fixture.setDirectoryFailure(true);
    const before = fixture.summary().exactUnavailable;
    try {
      await startSearch(a, "@qa_failure_" + runId);
      const result = await searchOutcome(a);
      check(fixture.summary().exactUnavailable > before, "The queried nickname did not reach the failing relay path.");
      check(result === "technical failure", `The failed directory query reported ${result}.`);
      return { result, relayClosedQuery: true };
    } finally { fixture.setDirectoryFailure(false); }
  }, onboards && Boolean(fixture));
  const presence = await stage(`${prefix}3 accepted friendship and online presence`, async () => {
    await input(b.page, "#friend-search", "");
    await friendPair(a, b);
    await Promise.all([online(a, b), online(b, a)]);
    return { accepted: true, onlineBothWays: true };
  }, found);
  await stage(`${prefix}4 sign-out and sign-in`, async () => {
    const offlineBefore = fixture?.summary().offlineEvents;
    await signOut(b);
    try {
      await waitFor("The other client did not show explicit offline after logout.", async () =>
        ((await friend(a, b).locator(".f-sub").textContent()) ?? "").trim() === "не в сети");
    } finally { await signIn(b); }
    await Promise.all([online(a, b), online(b, a)]);
    const signedOfflineEvent = fixture ? fixture.summary().offlineEvents > offlineBefore : undefined;
    if (!isBaseline && fixture) check(signedOfflineEvent, "The relay did not receive an explicit signed offline record.");
    return { observedOffline: true, observedOnlineAfterSignIn: true, signedOfflineEvent };
  }, presence);
  await stage(`${prefix}7 malformed and unknown room codes`, async () => {
    await invalidRoom(a);
    return { malformedRejected: true, unusedValidFormatRejected: true, roomUiNeverOpened: true };
  }, onboards);
  let reversal;
  const forward = await stage(`${prefix}5 A hosts and B joins by code`, async () => {
    const room = await roomPair(a, b, "A-host");
    return { participantsOnBothClients: 2, textDirections: 2, sameRelayRoomTopic: room.commonRoomTopic };
  }, onboards);
  if (!isBaseline) await stage(`${prefix}activated room transport resources`, async () =>
    ({ bothClients: await confirmRoomModules(pair) }), forward);
  const reversed = await stage(`${prefix}6 B hosts and A joins by code`, async () => {
    reversal = await roomPair(b, a, "B-host");
    return { participantsOnBothClients: 2, textDirections: 2, sameRelayRoomTopic: reversal.commonRoomTopic,
      relayOnly: await assertRelayOnly(pair) };
  }, onboards);
  await stage(`${prefix}8 actual outage, socket recovery and process restart`, async () => {
    const before = fixture.summary().connections;
    if (noDirect) await assertRelayOnly(pair);
    fixture.setAvailable(false);
    try {
      await waitFor("Loopback relay sockets remained live during the outage.", () => !fixture.activeConnections());
      await Promise.all(pair.map((peer) => expectText(peer.page, "#net-text", "Узлы недоступны")));
    } finally { fixture.setAvailable(true); }
    await waitFor("Both clients did not reconnect to the loopback relay.", () => fixture.summary().connections >= before + 2);
    await bothInRoom(b, a, reversal.name);
    await exchangeText(a, b);
    const priorPid = a.pid;
    await stop(a);
    await launch(a);
    if (!isBaseline) check(a.pid !== priorPid, "The guest process was not restarted.");
    if (await isVisible(a.page, "#ob-login")) await signIn(a);
    await expectText(a.page, "#w-name", a.name);
    if (!await isVisible(a.page, "#view-room")) await joinByCode(a, reversal.code, reversal.name);
    await bothInRoom(b, a, reversal.name);
    await exchangeText(b, a);
    return { actualSocketClosure: true, newConnections: fixture.summary().connections - before,
      guestProcessChanged: !isBaseline, participantsOnBothClients: 2, textDirections: 2 };
  }, reversed && Boolean(fixture));
}

const tmpRoot = await realpath(tmpdir());
const scratch = await mkdtemp(join(tmpRoot, "PulseExeQa-"));
let postCleanPair;
try {
  if (!isBaseline) {
    check(basename(options.exe).toLowerCase() === "pulse.exe", "Use the full release Pulse.exe artifact.");
    report.executableSha256 = sha(await readFile(resolve(options.exe)));
    check(report.executableSha256 === options.sha256.toLowerCase(), "Unexpected release SHA-256.");
    launcher = join(scratch, "PulseDesktop.exe");
    const csc = options.csc ?? join(process.env.WINDIR ?? "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
    execFileSync(csc, ["/nologo", "/optimize+", "/platform:x64", `/out:${launcher}`, join(here, "exe-desktop.cs")], { windowsHide: true });
  }
  if (!isPublic) fixture = await startRelayFixture(options.openssl ??
    join(process.env.ProgramW6432 ?? process.env.ProgramFiles ?? "C:/Program Files", "Git/usr/bin/openssl.exe"), ws,
    isBaseline ? resolve(options["baseline-web"]) : undefined);
  if (options["post-clean-installs"]) {
    const startedClean = await stage("10 hosted cleanup paths free of the old executables and profiles", async () => {
      const runnerTemp = await realpath(process.env.RUNNER_TEMP);
      const fixture = join(runnerTemp, "pulse-cleanup-hosted");
      const installs = join(fixture, "installs");
      check(resolve(options["post-clean-installs"]).toLowerCase() === installs.toLowerCase(),
        "Use the canonical installs directory created by cleanup-hosted.ps1.");
      check((await realpath(fixture)).toLowerCase() === fixture.toLowerCase(), "The hosted cleanup root was redirected.");
      for (const current of [installs, join(installs, "A"), join(installs, "B")]) {
        if (existsSync(current)) check((await realpath(current)).toLowerCase() === current.toLowerCase(),
          "A hosted install directory was redirected.");
      }
      postCleanPair = makeClients(installs, "P");
      for (const peer of postCleanPair) check(!existsSync(join(peer.root, "Pulse.exe")) && !existsSync(join(peer.root, "Data")),
        "The hosted cleanup left a Pulse executable or data directory in the verified test installations.");
      return { oldExeAbsent: 2, oldDataAbsent: 2 };
    });
    if (startedClean) await acceptPair(postCleanPair, "10 post-clean ");
  } else {
    await acceptPair(makeClients(join(scratch, "clients")), "");
  }
  if (options["legacy-web"] && fixture) {
    await stage("9 baseline-created account, friendship and relay state reopened by exact release", () =>
      oldProfileRound(join(scratch, "legacy"), expectedWeb));
  }
  if (isPublic) {
    const recipientsOutside = [...publicRecipients].filter((recipient) => !publicAuthors.has(recipient)).length;
    report.relay = { ownProfileAuthors: publicAuthors.size, recipientsOutside, plainLeakCount,
      topicsSeenFromTwoAuthors: [...publicRoomTopics.values()].filter((publishers) => publishers.size >= 2).length,
      peerRelayCounts: clients.map((peer) => ({ label: peer.label, totals: Object.fromEntries(peer.stats) })) };
    await stage("public synthetic boundaries and acknowledgements", () => {
      check(!recipientsOutside && !plainLeakCount, "Observed a non-synthetic mail target or plaintext in outbound relay frames.");
      check(publicAuthors.size === 2 && clients.every((peer) => [...peer.stats.values()].some((counts) => counts.profilesAccepted)),
        "Each public profile must receive an acceptance reply on a real relay.");
      return { publicProfileAuthors: 2, privateDataExposuresObserved: 0 };
    });
  } else {
    report.relay = fixture.summary();
  }
} catch (error) {
  report.setupError = error instanceof CheckError ? error.message : error.name;
  console.error(report.setupError);
} finally {
  for (const peer of clients) await stop(peer);
  await fixture?.close();
  const actual = await realpath(scratch);
  check(dirname(actual).toLowerCase() === tmpRoot.toLowerCase() && basename(actual).startsWith("PulseExeQa-"),
    "Refusing to remove a directory outside the temporary test root.");
  try {
    await rm(actual, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    report.disposableProfilesRemoved = true;
  } catch { report.disposableProfilesRemoved = false; }
  if (postCleanPair) report.postCleanProfilesRemainInDisposableVm = true;
  report.rendererErrorTypes = Object.fromEntries(rendererErrors);
  report.finishedAt = new Date().toISOString();
  await mkdir(dirname(resolve(options.report)), { recursive: true });
  await writeFile(resolve(options.report), JSON.stringify(report, null, 2) + "\n");
}
if (!report.disposableProfilesRemoved || report.setupError ||
  Object.values(report.checks).some((result) => result.status === "FAIL")) process.exitCode = 1;
