const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright-core");

const web = path.resolve(process.argv[2] || path.join(__dirname, "../web"));
const nick = "onboarding_test";
const password = "Synthetic-Account-5519!";
const address = event => event.tags.find(([key]) => key === "d")?.[1];

async function fillSignup(page) {
  await page.locator("#ob-name").fill("Test Account");
  await page.locator("#ob-nick").fill(nick);
  for (const id of ["#ob-pw", "#ob-pw2"]) await page.locator(id).fill(password);
  await page.locator("#ob-terms-open").click();
  await page.locator("#terms-yes").click();
  await page.locator("#ob-create").click();
  await page.locator("#ob-done").waitFor({ state: "visible", timeout: 45_000 });
}

async function checkRegistration(browser, origin, acceptsProfile) {
  const page = await browser.newPage();
  const records = [];
  try {
    await page.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    await page.routeWebSocket("**/*", socket => socket.onMessage(raw => {
      const [op, value] = JSON.parse(raw);
      if (op === "REQ") socket.send(JSON.stringify(["EOSE", value]));
      if (op === "EVENT") {
        const accepted = address(value) !== "pulse-profile" || acceptsProfile;
        if (accepted) records.push(value);
        socket.send(JSON.stringify(["OK", value.id, accepted, accepted ? "" : "blocked: fixture rejects profile"]));
      }
    }));
    await page.goto(origin + "/index.html");
    await fillSignup(page);
    assert.ok(records.some(event => address(event) === "pulse-acct"));
    assert.equal(await page.locator("#onboarding").isVisible(), true);

    const sharedContact = await page.locator("#ob-id").innerText();
    const net = await import("../web/js/net.js");
    if (acceptsProfile) {
      assert.equal(sharedContact.trim(), "@" + nick);
      const profile = await net.lookupNick({ query: async () => records }, nick);
      assert.equal(profile?.name, "Test Account", "a second client can resolve this account before it enters the app");
    } else {
      assert.match(sharedContact, /id-[1-9A-HJ-NP-Za-km-z]{16,24}/);
      assert.match(await page.locator("#ob-gen-sub").innerText(), /каталог|карточк/i);
      const contact = await net.lookupFriendCode({ query: async () => records }, sharedContact.trim());
      assert.equal(contact?.name, "Test Account", "the fallback ID is discoverable while the profile write is rejected");
    }
  } finally {
    await page.context().close();
  }
}

async function partialDirectory(page, origin, { vaultOnFirstRelay = false, vaults } = {}) {
  const net = await import("../web/js/net.js");
  const owner = net.vaultEvent(net.newSecret(), nick, "signed but unreadable vault fixture", 60);
  const records = [];
  let reveal = Boolean(vaults);
  await page.addInitScript(() => {
    localStorage.setItem("pulse:networkRelays", JSON.stringify(["wss://first.test", "wss://second.test"]));
  });
  await page.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  await page.routeWebSocket("**/*", socket => socket.onMessage(raw => {
    const [op, value, ...filters] = JSON.parse(raw);
    const second = new URL(socket.url()).hostname === "second.test";
    if (op === "REQ") {
      if (second && !reveal) return socket.send(JSON.stringify(["CLOSED", value, "restricted: fixture cannot read"]));
      if (filters.some(filter => filter["#n"]?.includes(nick) && filter["#t"]?.includes("pulse-acct"))) {
        const available = vaults ? vaults[Number(second)] : (second ? reveal : vaultOnFirstRelay) ? [owner] : [];
        for (const event of available) socket.send(JSON.stringify(["EVENT", value, event]));
      }
      socket.send(JSON.stringify(["EOSE", value]));
    }
    if (op === "EVENT") {
      records.push(value);
      socket.send(JSON.stringify(["OK", value.id, true, ""]));
    }
  }));
  await page.goto(origin + "/index.html");
  return { records, revealOwner() { reveal = true; } };
}

async function checkHiddenOwner(browser, origin) {
  const page = await browser.newPage();
  try {
    const directory = await partialDirectory(page, origin);
    await fillSignup(page);
    assert.match(await page.locator("#ob-id").innerText(), /id-[1-9A-HJ-NP-Za-km-z]{16,24}/);
    assert.ok(directory.records.some(event => address(event)?.startsWith("pulse-contact:")));
    assert.equal(directory.records.some(event => ["pulse-profile", "pulse-acct"].includes(address(event))), false);
    directory.revealOwner();
    await page.locator("#ob-go").click();
    await page.locator("#nick-modal").waitFor({ state: "visible", timeout: 15_000 });
    assert.match(await page.locator("#nk-state").innerText(), /занят/i);
    assert.equal(directory.records.some(event => ["pulse-profile", "pulse-acct"].includes(address(event))), false);
  } finally {
    await page.context().close();
  }
}

async function submitRemoteLogin(page) {
  await page.locator("[data-remote]:visible").first().click();
  await page.locator("#rl-nick").fill(nick);
  await page.locator("#rl-pw").fill(password);
  await page.locator("#rl-btn").click();
  await page.waitForFunction(() => document.getElementById("rl-error").textContent
    || !document.getElementById("shell").classList.contains("hidden"), undefined, { timeout: 15_000 });
}

async function checkPartialVault(browser, origin) {
  const page = await browser.newPage();
  try {
    await partialDirectory(page, origin, { vaultOnFirstRelay: true });
    await submitRemoteLogin(page);
    assert.match(await page.locator("#rl-error").innerText(), /не удалось провер|каталог|релеи/i);
  } finally {
    await page.context().close();
  }
}

async function vaultFixtures() {
  const net = await import("../web/js/net.js");
  const { z: generateIdentity } = await import("../web/js/chunk-7GRP2DEX.js");
  const keys = { ...await generateIdentity(), nostr: net.newSecret() };
  const payload = name => ({ keys, nick, card: { name, color: "#7c5cff" } });
  const older = await net.sealVault(password, payload("Older Vault"));
  const newer = await net.sealVault(password, payload("Newer Vault"));
  const now = Date.now;
  let first;
  try {
    const olderTimestamp = now() - 30_000;
    Date.now = () => olderTimestamp;
    first = net.vaultEvent(keys.nostr, nick, older, 60);
  } finally {
    Date.now = now;
  }
  const latest = net.vaultEvent(keys.nostr, nick, newer, 60);
  const foreignAuthor = net.vaultEvent(net.newSecret(), nick, newer, 60);
  return { first, latest, foreignAuthor };
}

async function checkVaultVersion(browser, origin, fixtures) {
  const page = await browser.newPage();
  try {
    await partialDirectory(page, origin, { vaults: [[fixtures.first], [fixtures.latest]] });
    await submitRemoteLogin(page);
    await page.locator("#w-name").waitFor({ state: "visible", timeout: 15_000 });
    assert.equal(await page.locator("#w-name").innerText(), "Newer Vault");
  } finally {
    await page.context().close();
  }
}

async function checkVaultAuthor(browser, origin, fixtures) {
  const page = await browser.newPage();
  try {
    await partialDirectory(page, origin, { vaults: [[fixtures.foreignAuthor], []] });
    await submitRemoteLogin(page);
    assert.equal(await page.locator("#shell").isVisible(), false);
    assert.match(await page.locator("#rl-error").innerText(), /пароль|копи/i);
  } finally {
    await page.context().close();
  }
}

async function run() {
  const server = http.createServer(async (req, res) => {
    const file = path.resolve(web, "." + new URL(req.url, "http://localhost").pathname);
    if (!file.startsWith(web + path.sep)) return res.writeHead(404).end();
    try {
      const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
      res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.PULSE_BROWSER_CHANNEL || "msedge",
      headless: true,
      args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    await checkRegistration(browser, origin, true);
    await checkRegistration(browser, origin, false);
    const partial = await Promise.allSettled([checkHiddenOwner(browser, origin), checkPartialVault(browser, origin)]);
    const failures = partial.filter(result => result.status === "rejected").map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, "Partial directory regression");
    const fixtures = await vaultFixtures();
    const versions = await Promise.allSettled([checkVaultVersion(browser, origin, fixtures), checkVaultAuthor(browser, origin, fixtures)]);
    const vaultFailures = versions.filter(result => result.status === "rejected").map(result => result.reason);
    if (vaultFailures.length) throw new AggregateError(vaultFailures, "Remote vault regression");
    console.log("PASS: signup shares confirmed contact information, keeps uncertain nicknames pending, and handles partial vault reads and signed vault versions.");
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
