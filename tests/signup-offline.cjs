const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright-core");

// A relay that permits reads but declines writes must not produce a cross-device login promise.
async function run() {
  const web = path.resolve(process.argv[2] || path.join(__dirname, "../web"));
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
    const page = await browser.newPage();
    const origin = "http://127.0.0.1:" + server.address().port;
    await page.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    let rejected = 0;
    await page.routeWebSocket("**/*", socket => socket.onMessage(raw => {
      const [op, value] = JSON.parse(raw);
      if (op === "REQ") socket.send(JSON.stringify(["EOSE", value]));
      if (op === "EVENT") {
        rejected++;
        socket.send(JSON.stringify(["OK", value.id, false, "error: test storage unavailable"]));
      }
    }));
    await page.goto(origin + "/index.html");
    await page.locator("#ob-name").fill("Локальная проверка");
    await page.locator("#ob-nick").fill("pulse_signup_test");
    for (const id of ["#ob-pw", "#ob-pw2"]) await page.locator(id).fill("Local-Test-Only-842!");
    await page.locator("#ob-terms-open").click();
    await page.locator("#terms-yes").click();
    await page.locator("#ob-create").click();
    await page.locator("#ob-done").waitFor({ state: "visible", timeout: 45_000 });
    assert.ok(rejected > 0, "the relay must have declined the requested write");
    const text = await page.locator("#ob-gen-sub").innerText();
    assert.match(text, /этом устройстве|на этом ПК|локально/i);
    assert.doesNotMatch(text, /можно войти на телефоне и любом ПК/i);
    await page.locator("#ob-go").click();
    await page.locator("#w-id").waitFor({ state: "visible" });
    assert.match(await page.locator("#w-id").innerText(), /id-[1-9A-HJ-NP-Za-km-z]{16,24}/);
    console.log("PASS: unacknowledged signup opens locally and offers a usable friend ID.");
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
