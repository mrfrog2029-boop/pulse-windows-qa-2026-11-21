import assert from "node:assert/strict";
import { test } from "node:test";
import { openRoomVoice } from "../web/js/room-voice.js";

test("voice caps pending views and releases a failed SDK instance", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saved = { VDONinjaSDK: globalThis.VDONinjaSDK, AudioContext: globalThis.AudioContext };
  const requested = [];
  const stopped = [];
  const terminal = [];
  let sdk;
  let disconnected = false;
  let stoppedTrack = false;
  const stream = ordinal => "pulse_" + ordinal.toString(16).padStart(32, "0");
  globalThis.VDONinjaSDK = class extends EventTarget {
    constructor() {
      super();
      sdk = this;
    }
    async connect() {}
    async joinRoom() {}
    async publish() {}
    async view(id) { requested.push(id); }
    stopViewing(id) { stopped.push(id); }
    getStreams() { return Array.from({ length: 50 }, (_, index) => stream(index)); }
    async disconnect() { disconnected = true; }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  };
  globalThis.AudioContext = class {
    createMediaStreamDestination() {
      return { stream: { getAudioTracks: () => [{ stop() { stoppedTrack = true; } }] } };
    }
    async close() {}
  };
  t.after(() => Object.assign(globalThis, saved));

  const voice = openRoomVoice({
    code: "test room", identity: { pub: Buffer.alloc(65).toString("base64"), pair: { privateKey: {} } },
    onTerminal: () => terminal.push(disconnected && stoppedTrack),
  });
  t.after(() => voice.close());
  await voice.ready;
  assert.equal(requested.length, 48);
  sdk.emit("peerDisconnected", { uuid: "departed", type: "viewer", streamID: stream(3) });
  assert.deepEqual(stopped, [stream(3)]);
  sdk.emit("videoaddedtoroom", { streamID: stream(49) });
  assert.equal(requested.at(-1), stream(49));

  t.mock.timers.tick(45_000);
  assert.equal(stopped.length, 49);
  assert.equal(requested.length, 49, "Time limits stop stale views without retrying them");

  sdk.emit("reconnectFailed");
  await voice.close();
  await Promise.resolve();
  sdk.emit("reconnectFailed");
  assert.deepEqual(terminal, [true], "Exactly one terminal notification follows teardown");
});

test("voice reauthenticates a replacement control channel on the same peer connection", async t => {
  const globals = { VDONinjaSDK: globalThis.VDONinjaSDK, AudioContext: globalThis.AudioContext, MediaStream: globalThis.MediaStream };
  const instances = [];
  class Stream {
    constructor(tracks) { this.tracks = tracks; }
    getAudioTracks() { return this.tracks; }
  }
  class Channel extends EventTarget {
    readyState = "open";
    close() {
      this.readyState = "closed";
      this.dispatchEvent(new Event("close"));
    }
  }
  globalThis.VDONinjaSDK = class extends EventTarget {
    connections = {};
    constructor() { super(); instances.push(this); }
    async connect() {}
    async joinRoom() {}
    async publish(stream) { this.silent = stream.getAudioTracks()[0]; }
    getStreams() { return []; }
    async disconnect() {}
    sendData(payload, { type }) {
      const channel = this.connections[type].other.dataChannel;
      queueMicrotask(() => channel.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ pipe: payload }) })));
      return true;
    }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  };
  globalThis.AudioContext = class {
    createMediaStreamDestination() { return { stream: new Stream([{ stop() {} }]) }; }
    async close() {}
  };
  globalThis.MediaStream = Stream;
  t.after(() => Object.assign(globalThis, globals));

  const peers = await Promise.all(["Alice", "Boris"].map(async name => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64");
    const mic = { kind: "audio", readyState: "live" };
    const members = new Map();
    return { name, pair, pub, mic, members };
  }));
  for (const peer of peers) {
    peer.voice = openRoomVoice({
      code: "pulse-23456789ABCDabcd23456789",
      identity: { pub: peer.pub, pair: peer.pair },
      profile: { name: peer.name },
      getStream: () => new Stream([peer.mic]),
      onPeer: (id, profile) => peer.members.set(id, profile),
      onLeave: id => peer.members.delete(id),
    });
    t.after(() => peer.voice.close());
  }
  await Promise.all(peers.map(peer => peer.voice.ready));

  const [alice, boris] = instances;
  const dtls = bytes => ({ sdp: "a=fingerprint:sha-256 " + Array.from({ length: 32 }, () => bytes).join(":") });
  const aFingerprint = dtls("AB"), bFingerprint = dtls("CD");
  const link = (sdk, uuid, type, localDescription, remoteDescription) => {
    const pc = new EventTarget();
    const transport = {};
    const sender = {
      transport, track: sdk.silent,
      async replaceTrack(track) { this.track = track; },
    };
    Object.assign(pc, {
      localDescription, remoteDescription, sctp: { transport },
      getSenders: () => type === "publisher" ? [sender] : [],
      getReceivers: () => [],
    });
    return sdk.connections[type] = { sdk, uuid, type, pc, sender, dataChannel: new Channel() };
  };
  const aPublisher = link(alice, "boris", "publisher", aFingerprint, bFingerprint);
  const bViewer = link(boris, "alice", "viewer", bFingerprint, aFingerprint);
  const bPublisher = link(boris, "alice", "publisher", bFingerprint, aFingerprint);
  const aViewer = link(alice, "boris", "viewer", aFingerprint, bFingerprint);
  const attach = (publisher, viewer) => {
    publisher.other = viewer;
    viewer.other = publisher;
    for (const connection of [publisher, viewer]) {
      connection.sdk.emit("peerConnected", { uuid: connection.uuid, connection });
    }
  };
  const waitFor = async condition => {
    const deadline = Date.now() + 3000;
    while (!condition()) {
      assert.ok(Date.now() < deadline, "Timed out waiting for the reserve voice peer");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  attach(aPublisher, bViewer);
  attach(bPublisher, aViewer);
  await waitFor(() => peers.every(peer => peer.members.size === 1));
  assert.equal(aPublisher.sender.track, peers[0].mic);
  assert.equal(bPublisher.sender.track, peers[1].mic);

  for (const connection of [aPublisher, bViewer]) connection.dataChannel.close();
  assert.ok(peers.every(peer => peer.members.size === 0));
  assert.equal(aPublisher.sender.track, alice.silent);
  assert.equal(bPublisher.sender.track, boris.silent);
  for (const connection of [aPublisher, bViewer]) connection.dataChannel = new Channel();
  for (const { sdk, uuid, type } of [aPublisher, bViewer]) sdk.emit("dataChannelOpen", { uuid, type });
  await waitFor(() => peers.every(peer => peer.members.size === 1));
  assert.equal(aPublisher.sender.track, peers[0].mic);
  assert.equal(bPublisher.sender.track, peers[1].mic);
});

