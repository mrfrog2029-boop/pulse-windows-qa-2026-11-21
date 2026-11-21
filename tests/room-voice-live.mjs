import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    live: { type: "boolean" },
    "invalid-proof": { type: "boolean" },
    deps: { type: "string" },
    browser: { type: "string" },
  },
});
assert(options.live, "Pass --live to use VDO.Ninja with an isolated test room.");
const tests = dirname(fileURLToPath(import.meta.url));
const root = resolve(tests, "..", "web");
const load = createRequire(join(resolve(options.deps ?? process.env.PULSE_E2E_DEPS ?? tests), "package.json"));
const { chromium } = load("playwright-core");
const executablePath = options.browser ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
].find(existsSync);
const nickname = ["Voice QA one", "Voice QA two"];
const code = "pulse-" + randomBytes(18).toString("hex");
const texts = [randomBytes(8).toString("hex"), String.fromCharCode(1).repeat(3984) + randomBytes(8).toString("hex")];
const launchArgs = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browsers = [];
const pages = [];
const unexpectedSignaling = [];

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://127.0.0.1");
  if (pathname === "/") {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self' wss: https://turnservers.vdo.ninja; media-src 'self' blob: mediastream:",
    }).end("<title>Room voice transport test</title>");
    return;
  }
  const path = resolve(root, "." + pathname);
  if (!path.startsWith(root + sep) || extname(path) !== ".js") {
    res.writeHead(404).end();
    return;
  }
  try {
    const source = await readFile(path);
    res.writeHead(200, { "Content-Type": "text/javascript" }).end(source);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

try {
  for (const [index, name] of nickname.entries()) {
    const browser = await chromium.launch({ executablePath, args: launchArgs, headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ permissions: ["microphone"] });
    const page = await context.newPage();
    pages.push(page);
    await page.addInitScript(invalidateProof => {
      const NativeConnection = window.RTCPeerConnection;
      window.voiceConnections = [];
      window.RTCPeerConnection = class extends NativeConnection {
        constructor(...args) {
          super(...args);
          window.voiceConnections.push(this);
        }
      };
      if (invalidateProof) {
        const sign = crypto.subtle.sign.bind(crypto.subtle);
        crypto.subtle.sign = (algorithm, key, bytes) => {
          const proof = new TextDecoder().decode(bytes);
          if (proof.startsWith('["pulse-room-voice-v1",') && JSON.parse(proof)[2] === "publisher") {
            return sign(algorithm, key, new TextEncoder().encode("invalid test proof"));
          }
          return sign(algorithm, key, bytes);
        };
      }
    }, Boolean(options["invalid-proof"] && index === 1));
    page.on("websocket", socket => {
      socket.on("framesent", ({ payload }) => {
        if (nickname.some(value => String(payload).includes(value)) ||
            texts.some(value => String(payload).includes(value.slice(-16)))) {
          unexpectedSignaling.push("application content in signaling");
        }
      });
    });
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.evaluate(async ({ name, code }) => {
      const { openRoomVoice } = await import("/js/room-voice.js");
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
      const pub = btoa(String.fromCharCode(...new Uint8Array(raw)));
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const observed = { peers: [], departed: [], streams: [], texts: [], mutedPub: null };
      const voice = openRoomVoice({
        code, identity: { pub, pair }, profile: () => ({ name, color: "#7700cc" }),
        getStream: () => mic, forceTURN: true,
        allowAudioFor: pub => pub !== observed.mutedPub,
        onPeer(session, profile, connection) { observed.peers.push({ session, profile, connection }); },
        onStream(session, stream) { observed.streams.push({ session, stream }); },
        onLeave(session) { observed.departed.push(session); },
        onText(message, session) { observed.texts.push({ session, message }); },
      });
      window.voiceQA = { voice, pub, mic, observed, pair };
      await voice.ready;
    }, { name, code });
  }
  if (options["invalid-proof"]) {
    const [verifier, peer] = pages;
    await peer.waitForFunction(() => window.voiceQA.observed.peers.length === 1, null, { timeout: 35000 });
    await verifier.waitForFunction(() => window.voiceConnections.filter(connection =>
      connection.connectionState === "connected").length === 2, null, { timeout: 10000 });
    assert.deepEqual(await verifier.evaluate(() => {
      const { mic, observed } = window.voiceQA;
      const track = mic.getAudioTracks()[0];
      return {
        peers: observed.peers.length, streams: observed.streams.length,
        sentMicrophone: window.voiceConnections.some(connection =>
          connection.getSenders().some(sender => sender.track === track)),
      };
    }), { peers: 0, streams: 0, sentMicrophone: false });
    console.log("Invalid proof on one connected DTLS leg left the microphone private");
  } else {
    const publicKeys = await Promise.all(pages.map(page => page.evaluate(() => window.voiceQA.pub)));
    await Promise.all(pages.map((page, index) => page.waitForFunction(
      ({ pub, name }) => {
        const { peers, streams } = window.voiceQA.observed;
        return peers.length === 1 && peers[0].profile.pub === pub && peers[0].profile.name === name &&
          streams.some(({ session, stream }) => session === peers[0].session && stream.getAudioTracks().length === 1);
      }, { pub: publicKeys[1 - index], name: nickname[1 - index] }, { timeout: 35000 },
    )));

    const wireMessages = await Promise.all(pages.map((page, index) => page.evaluate(async text => {
      const { pub, pair } = window.voiceQA;
      const bytes = new TextEncoder().encode(text);
      const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, bytes);
      return { kind: "text", text, pub, sig: btoa(String.fromCharCode(...new Uint8Array(signature))) };
    }, texts[index])));
    assert.deepEqual(await Promise.all(pages.map((page, index) =>
      page.evaluate(message => window.voiceQA.voice.sendText(message), wireMessages[index]))), [true, true]);
    assert.deepEqual(await Promise.all(pages.map((page, index) => page.evaluate(
      message => window.voiceQA.voice.sendText(message), wireMessages[1 - index]))), [false, false],
    "A peer cannot send as another account");

    await Promise.all(pages.map((page, index) => page.waitForFunction(
      ({ message }) => {
        const { peers, texts } = window.voiceQA.observed;
        return texts.length === 1 && texts[0].session === peers[0].session &&
          JSON.stringify(texts[0].message) === JSON.stringify(message);
      }, { message: wireMessages[1 - index] }, { timeout: 10000 },
    )));

    async function readAudioStats(page) {
      return page.evaluate(async () => {
        const { connection } = window.voiceQA.observed.peers[0];
        const stats = await connection.getStats();
        const all = [...stats.values()];
        const selected = all.find(item => item.type === "transport" && item.selectedCandidatePairId);
        const pair = stats.get(selected?.selectedCandidatePairId);
        return {
          local: stats.get(pair?.localCandidateId)?.candidateType,
          remote: stats.get(pair?.remoteCandidateId)?.candidateType,
          packets: all.filter(item => item.type === "inbound-rtp" && item.kind === "audio")
            .reduce((count, item) => count + item.packetsReceived, 0),
        };
      });
    }
    const initial = await Promise.all(pages.map(readAudioStats));
    await new Promise(resolve => setTimeout(resolve, 1800));
    const audio = await Promise.all(pages.map(readAudioStats));
    for (const [index, stream] of audio.entries()) {
      assert.equal(stream.local, "relay");
      assert.equal(stream.remote, "relay");
      assert.ok(stream.packets > initial[index].packets + 10, "Fake microphone sent additional packets");
    }
    assert.deepEqual(unexpectedSignaling, []);

    async function sendingMicrophone() {
      const track = window.voiceQA.mic.getAudioTracks()[0];
      return window.voiceConnections.some(connection => connection.getSenders().some(sender => sender.track === track));
    }
    await pages[0].waitForFunction(sendingMicrophone);
    await pages[0].evaluate(() => window.voiceQA.voice.updateStream(null));
    await pages[0].waitForFunction(async isSending => {
      const track = window.voiceQA.mic.getAudioTracks()[0];
      return isSending === window.voiceConnections.some(connection =>
        connection.getSenders().some(sender => sender.track === track));
    }, false);
    await pages[0].evaluate(() => window.voiceQA.voice.updateStream(window.voiceQA.mic));
    await pages[0].waitForFunction(sendingMicrophone);

    await pages[0].evaluate(pub => {
      window.voiceQA.observed.mutedPub = pub;
      window.voiceQA.voice.updateStream(window.voiceQA.mic);
    }, publicKeys[1]);
    await pages[0].waitForFunction(() => {
      const track = window.voiceQA.mic.getAudioTracks()[0];
      return !window.voiceConnections.some(connection =>
        connection.getSenders().some(sender => sender.track === track));
    }, null, { timeout: 3000 });
    await pages[1].waitForFunction(sendingMicrophone);

    await pages[0].evaluate(() => window.voiceQA.voice.close());
    await pages[1].waitForFunction(() => window.voiceQA.observed.departed.length === 1, null, { timeout: 15000 });
    console.log("Two authenticated voice peers exchanged signed text and relayed microphone RTP", audio);
  }
} finally {
  await Promise.allSettled(pages.map(page => page.evaluate(async () => {
    window.voiceQA?.mic.getTracks().forEach(track => track.stop());
    await window.voiceQA?.voice.close();
  })));
  await Promise.allSettled(browsers.map(browser => browser.close()));
  server.close();
}

