import { createHash, X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const digest = (value, encoding = "hex") => createHash("sha256").update(value).digest(encoding);
const hexKey = /^[a-f0-9]{64}$/;
const tag = (event, key) => event.tags.find(([name]) => name === key)?.[1];
const ephemeral = (kind) => kind >= 20000 && kind < 30000;
const addressable = (kind) => kind >= 30000 && kind < 40000;
const replaceable = (kind) => kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
const time = () => Math.floor(Date.now() / 1000);

function eventId(event) {
  return digest(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]));
}

function validEvent(event) {
  return event && hexKey.test(event.pubkey) && hexKey.test(event.id) &&
    /^[a-f0-9]{128}$/.test(event.sig) && Number.isSafeInteger(event.created_at) &&
    Number.isInteger(event.kind) && event.kind >= 0 && event.kind <= 65535 &&
    typeof event.content === "string" && Array.isArray(event.tags) &&
    event.tags.every((entry) => Array.isArray(entry) && entry.every((cell) => typeof cell === "string")) &&
    eventId(event) === event.id;
}

function matches(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since != null && event.created_at < filter.since) return false;
  if (filter.until != null && event.created_at > filter.until) return false;
  return Object.entries(filter).every(([key, values]) => !/^#[a-z]$/i.test(key) ||
    event.tags.some(([name, value]) => name === key[1] && values.includes(value)));
}

function tlsMaterial(openssl) {
  const pem = execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
    "-keyout", "-", "-out", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  const key = pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0];
  const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
  if (!key || !cert) throw new Error("OpenSSL did not return a disposable test certificate.");
  const publicKey = new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" });
  return { key, cert, pin: digest(publicKey, "base64") };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

export async function startRelayFixture(openssl, { WebSocketServer, WebSocket }, assetRoot) {
  const { key, cert, pin } = tlsMaterial(openssl);
  const server = createServer({ key, cert }, async (request, response) => {
    if (assetRoot) {
      try {
        const path = decodeURIComponent(new URL(request.url, "https://localhost").pathname);
        const file = resolve(assetRoot, "." + (path === "/" ? "/index.html" : path));
        if (!file.startsWith(assetRoot + sep)) return response.writeHead(403).end();
        const contents = await readFile(file);
        const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" };
        return response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream",
          "Cache-Control": "no-store" }).end(contents);
      } catch {}
    }
    return response.writeHead(404).end();
  });
  const denyProxy = createHttpServer((request, response) => response.writeHead(502).end());
  denyProxy.on("connect", (request, socket) => socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
  await listen(denyProxy);
  let available = true;
  let directoryFailure = false;
  const relay = new WebSocketServer({ server, path: "/relay", maxPayload: 4 * 1024 * 1024,
    verifyClient: () => available });
  const stored = new Map();
  const subscriptions = new Map();
  const roomTopics = new Map();
  const stats = { connections: 0, requests: 0, exactQueries: 0, exactEmpty: 0, exactUnavailable: 0, profiles: 0,
    heartbeats: 0, offlineEvents: 0, explicitOfflineAddress: 0, mail: 0, roomFrames: 0, signaling: 0,
    badFrame: 0, disconnects: 0 };
  const authors = new Set();
  let foreignMail = 0;
  relay.on("connection", (socket) => {
    stats.connections++;
    const filters = new Map();
    const send = (frame) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(frame));
    subscriptions.set(socket, { filters, send });
    socket.on("error", () => {});
    socket.on("close", () => subscriptions.delete(socket));
    socket.on("message", (bytes) => {
      try {
        const [type, id, ...query] = JSON.parse(String(bytes));
        if (type === "REQ") {
          stats.requests++;
          if (typeof id !== "string" || id.length > 64 || !query.length) throw new TypeError("REQ");
          const exact = query.some((filter) => filter["#n"]?.length && filter["#t"]?.includes("pulse-user"));
          if (exact) stats.exactQueries++;
          if (exact && directoryFailure) {
            filters.delete(id);
            stats.exactUnavailable++;
            send(["CLOSED", id, "restricted: directory unavailable in test"]);
            return;
          }
          filters.set(id, query);
          const history = [...stored.values()].filter((event) => +tag(event, "expiration") > time() ||
            !tag(event, "expiration")).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
          const results = new Map();
          for (const filter of query) {
            for (const event of history.filter((candidate) => matches(candidate, filter)).slice(0, filter.limit))
              results.set(event.id, event);
          }
          if (exact && !results.size) stats.exactEmpty++;
          for (const event of results.values()) send(["EVENT", id, event]);
          send(["EOSE", id]);
          return;
        }
        if (type === "CLOSE") {
          filters.delete(id);
          return;
        }
        if (type !== "EVENT") throw new TypeError("Message type");
        const event = id;
        if (!validEvent(event) || event.created_at > time() + 75 ||
          (tag(event, "expiration") && +tag(event, "expiration") <= time())) {
          stats.badFrame++;
          if (hexKey.test(event?.id)) send(["OK", event.id, false, "invalid: event did not pass fixture checks"]);
          return;
        }
        if (!ephemeral(event.kind)) {
          const key = addressable(event.kind) ? `${event.kind}/${event.pubkey}/${tag(event, "d") ?? ""}` :
            replaceable(event.kind) ? `${event.kind}/${event.pubkey}` : event.id;
          const old = stored.get(key);
          if (old && (old.created_at > event.created_at ||
            (old.created_at === event.created_at && old.id <= event.id))) {
            send(["OK", event.id, true, "duplicate: newer or identical event already stored"]);
            return;
          }
          stored.set(key, event);
          if (event.kind === 30078 && tag(event, "d") === "pulse-profile") {
            authors.add(event.pubkey);
            stats.profiles++;
          }
          if (event.kind === 30078 && tag(event, "d") === "pulse-presence" && !event.content) stats.heartbeats++;
          if (event.kind === 30078 && event.content === "offline") stats.offlineEvents++;
          if (event.kind === 30078 && tag(event, "d") === "pulse-presence-offline") stats.explicitOfflineAddress++;
          if (event.kind === 4454) {
            stats.mail++;
            if (!authors.has(tag(event, "p"))) foreignMail++;
          }
        } else if (event.kind === 29943) {
          stats.roomFrames++;
          const topic = tag(event, "t");
          if (!roomTopics.has(topic)) roomTopics.set(topic, new Set());
          roomTopics.get(topic).add(event.pubkey);
        } else {
          stats.signaling++;
        }
        send(["OK", event.id, true, ""]);
        for (const subscriber of subscriptions.values()) {
          for (const [sub, parts] of subscriber.filters) {
            if (parts.some((filter) => matches(event, filter))) subscriber.send(["EVENT", sub, event]);
          }
        }
      } catch {
        stats.badFrame++;
      }
    });
  });

  try {
    await listen(server);
  } catch (error) {
    denyProxy.close();
    throw error;
  }
  const base = `https://127.0.0.1:${server.address().port}`;
  return {
    base,
    url: base.replace("https:", "wss:") + "/relay",
    pin,
    proxy: `http://127.0.0.1:${denyProxy.address().port}`,
    setDirectoryFailure(value) { directoryFailure = value; },
    setAvailable(value) {
      available = value;
      if (!available) {
        for (const client of relay.clients) client.terminate();
        stats.disconnects++;
      }
    },
    activeConnections: () => relay.clients.size,
    matchedRoomTopic(code) { return (roomTopics.get(digest("pulse-room-relay-topic-v1:" + code))?.size ?? 0) >= 2; },
    summary: () => ({ ...stats, authors: authors.size, foreignMail,
      topicsSeenFromTwoAuthors: [...roomTopics.values()].filter((publishers) => publishers.size >= 2).length }),
    async close() {
      for (const client of relay.clients) client.terminate();
      await new Promise((resolve) => relay.close(resolve));
      await Promise.all([server, denyProxy].map((service) => new Promise((resolve) => service.close(resolve))));
    },
  };
}
