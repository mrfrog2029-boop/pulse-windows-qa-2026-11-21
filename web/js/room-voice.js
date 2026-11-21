const protocol = "pulse-room-voice-v1";
const encoder = new TextEncoder();
const ecdsa = { name: "ECDSA", hash: "SHA-256" };
const publicKeyFormat = /^[A-Za-z0-9+/]{87}=$/;
const signatureFormat = /^[A-Za-z0-9+/]{86}==$/;
const nonceFormat = /^[0-9a-f]{32}$/;
const streamFormat = /^pulse_[0-9a-f]{32}$/;
// JSON escaping can grow an otherwise valid 4,000-character room message.
const maxWireBytes = 32 * 1024;
const maxPendingViews = 48;
const viewTimeoutMs = 45_000;

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const randomNonce = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unbase64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const boundedString = (value, max) => typeof value === "string" ? value.slice(0, max) : "";

function fingerprint(description) {
  const matches = description?.sdp?.matchAll(/^a=fingerprint:sha-256 ((?:[A-F0-9]{2}:){31}[A-F0-9]{2})\r?$/gim) ?? [];
  const values = new Set(Array.from(matches, match => match[1].toUpperCase()));
  return values.size === 1 ? values.values().next().value : null;
}

function voiceProfile(profile) {
  const color = boundedString(profile?.color, 7);
  return {
    name: boundedString(profile?.name, 64).trim() || "Без имени",
    color: /^#[a-f0-9]{6}$/i.test(color) ? color : "#7c5cff",
    bio: boundedString(profile?.bio, 300),
  };
}

function proofBytes(room, role, local, remote, challenge, pub, profile) {
  return encoder.encode(JSON.stringify([protocol, room, role, local, remote, challenge, pub, profile]));
}

function sameTransport(pc, media) {
  return !!pc.sctp?.transport && media?.transport === pc.sctp.transport;
}

function isText(message, pub) {
  return message?.kind === "text" && message.pub === pub &&
    typeof message.text === "string" && message.text.length <= 4000 && message.text.trim() &&
    typeof message.sig === "string" &&
    signatureFormat.test(message.sig);
}

/**
 * Starts one isolated SDK room. The caller still owns the processed microphone track.
 * Ready represents hosted discovery; onPeer follows the two DTLS-bound proofs.
 */
export function openRoomVoice({
  code, identity, profile, getStream, onPeer, onStream, onLeave, onText, onTerminal,
  allowAudioFor = () => true, forceTURN = false,
}) {
  const streamID = "pulse_" + randomNonce();
  const links = new Map();
  const sessions = new Map();
  const viewedStreams = new Map();
  const listeners = [];
  let pendingViews = 0;
  let closed = false;
  let closing;
  let room;
  let sdk;
  let published = false;
  let audio;
  let silentTrack;
  let localStream = getStream?.() ?? null;

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  }

  function current(link) {
    return !closed && links.get(link.uuid)?.[link.role] === link && link.channel?.readyState === "open" &&
      link.connection.dataChannel === link.channel &&
      fingerprint(link.pc.localDescription) === link.local && fingerprint(link.pc.remoteDescription) === link.remote;
  }

  function send(link, data) {
    const payload = { protocol, ...data };
    if (!current(link) || encoder.encode(JSON.stringify({ pipe: payload })).byteLength > maxWireBytes) return false;
    return sdk.sendData(payload, { uuid: link.uuid, type: link.role, preference: link.role, allowFallback: false });
  }

  function syncSender(link, sendMicrophone) {
    if (!link?.sender || !sameTransport(link.pc, link.sender)) return;
    const allowed = sendMicrophone && allowAudioFor(link.profile.pub);
    const mic = allowed ? localStream?.getAudioTracks().find(track => track.readyState === "live") : null;
    const track = mic ?? silentTrack;
    if (!track || link.desiredTrack === track) return;
    link.desiredTrack = track;
    link.sender.replaceTrack(track).catch(() => {
      if (link.desiredTrack === track) link.desiredTrack = null;
    });
  }

  function showAudio(session) {
    if (!current(session.viewer)) return;
    const { pc } = session.viewer;
    const receiver = pc.getReceivers().find(item => item.track.kind === "audio" &&
      item.track.readyState === "live" && sameTransport(pc, item));
    if (receiver && receiver.track !== session.track) {
      session.track = receiver.track;
      onStream?.(session.id, new MediaStream([receiver.track]));
    }
  }

  function refresh(uuid) {
    const { publisher, viewer } = links.get(uuid) ?? {};
    const previous = sessions.get(uuid);
    const paired = publisher?.profile && viewer?.profile &&
      publisher.profile.pub === viewer.profile.pub && current(publisher) && current(viewer);

    if (previous && (!paired || previous.publisher !== publisher || previous.viewer !== viewer)) {
      sessions.delete(uuid);
      syncSender(previous.publisher, false);
      onLeave?.(previous.id);
    }
    if (!paired) return;
    if (sessions.has(uuid)) {
      syncSender(publisher, true);
      showAudio(sessions.get(uuid));
      return;
    }
    const session = { id: "voice:" + uuid, publisher, viewer };
    sessions.set(uuid, session);
    completeView(viewedStreams.get(viewer.connection.streamID));
    syncSender(publisher, true);
    onPeer?.(session.id, viewer.profile, viewer.pc);
    showAudio(session);
  }

  async function receive(link, event) {
    if (!current(link) || typeof event.data !== "string" || event.data.length > maxWireBytes ||
        encoder.encode(event.data).byteLength > maxWireBytes) return;
    const data = JSON.parse(event.data)?.pipe;
    if (data?.protocol !== protocol) return;

    if (data.kind === "challenge") {
      if (typeof data.nonce !== "string" || !nonceFormat.test(data.nonce) ||
          (link.remoteNonce && link.remoteNonce !== data.nonce) ||
          Date.now() - link.lastProof < 500) return;
      link.remoteNonce = data.nonce;
      link.lastProof = Date.now();
      if (!link.proof) {
        const localProfile = voiceProfile(typeof profile === "function" ? profile() : profile);
        const payload = proofBytes(room, link.role, link.local, link.remote, data.nonce, identity.pub, localProfile);
        link.proof = crypto.subtle.sign(ecdsa, identity.pair.privateKey, payload).then(signature => ({
          kind: "proof", nonce: data.nonce, pub: identity.pub, profile: localProfile, sig: base64(signature),
        }));
      }
      send(link, await link.proof);
      return;
    }

    if (data.kind === "proof") {
      if (link.profile || link.verifying || data.nonce !== link.nonce || data.pub === identity.pub ||
          typeof data.pub !== "string" || typeof data.sig !== "string" ||
          !publicKeyFormat.test(data.pub) || !signatureFormat.test(data.sig)) return;
      link.verifying = true;
      try {
        const remoteProfile = voiceProfile(data.profile);
        const remoteRole = link.role === "viewer" ? "publisher" : "viewer";
        const payload = proofBytes(room, remoteRole, link.remote, link.local, link.nonce, data.pub, remoteProfile);
        const raw = unbase64(data.pub);
        if (base64(raw) !== data.pub) return;
        const key = await crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        if (await crypto.subtle.verify(ecdsa, key, unbase64(data.sig), payload) && current(link)) {
          link.profile = { ...remoteProfile, pub: data.pub };
          clearInterval(link.challengeTimer);
          refresh(link.uuid);
        }
      } finally {
        link.verifying = false;
      }
      return;
    }

    const session = sessions.get(link.uuid);
    if (data.kind === "text" && session?.viewer === link && current(session.publisher) &&
        isText(data.message, link.profile.pub)) {
      onText?.(data.message, session.id);
    }
  }

  function drop(link) {
    const roles = links.get(link.uuid);
    if (roles?.[link.role] !== link) return;
    delete roles[link.role];
    if (!roles.publisher && !roles.viewer) links.delete(link.uuid);
    clearInterval(link.challengeTimer);
    link.channel?.removeEventListener("message", link.messageListener);
    link.channel?.removeEventListener("close", link.closeListener);
    link.pc.removeEventListener("track", link.trackListener);
    link.pc.removeEventListener("signalingstatechange", link.descriptionListener);
    refresh(link.uuid);
  }

  function observeChannel(link) {
    const channel = link.connection.dataChannel;
    if (link.channel && link.channel !== channel) {
      replaceLink(link);
      return;
    }
    if (link.channel || channel?.readyState !== "open" || !link.pc.sctp?.transport) return;
    const local = fingerprint(link.pc.localDescription);
    const remote = fingerprint(link.pc.remoteDescription);
    if (!local || !remote) return;
    Object.assign(link, { channel, local, remote, nonce: randomNonce(), lastProof: 0 });
    if (link.role === "publisher") link.sender ??= link.pc.getSenders().find(sender =>
      sender.track === silentTrack && sameTransport(link.pc, sender));

    // The SDK's dataReceived event identifies a peer, which can own two PCs.
    // Listen on this exact SDK control channel to bind the proof to its own DTLS pair.
    link.messageListener = event => receive(link, event).catch(() => {});
    link.closeListener = () => replaceLink(link);
    channel.addEventListener("message", link.messageListener);
    channel.addEventListener("close", link.closeListener, { once: true });

    const expiresAt = Date.now() + 12000;
    const challenge = () => {
      if (Date.now() >= expiresAt || !current(link)) {
        drop(link);
      } else {
        send(link, { kind: "challenge", nonce: link.nonce });
      }
    };
    link.challengeTimer = setInterval(challenge, 800);
    challenge();
  }

  function replaceLink(link) {
    if (closed || links.get(link.uuid)?.[link.role] !== link) return;
    drop(link);
    // The SDK can open another control channel on the same connection without
    // emitting another peerConnected event. Keep the connection under observation.
    connected({ detail: { uuid: link.uuid, connection: link.connection } }, link.sender);
  }

  function connected({ detail: { uuid, connection } }, sender) {
    if (closed || typeof uuid !== "string" || !connection?.pc) return;
    const role = connection.type;
    if (role !== "publisher" && role !== "viewer") return;
    const existing = links.get(uuid)?.[role];
    if (existing?.connection === connection) {
      observeChannel(existing);
      return;
    }
    if (existing) drop(existing);
    const roles = links.get(uuid) ?? {};
    const link = { uuid, role, connection, pc: connection.pc, sender };
    roles[role] = link;
    links.set(uuid, roles);
    link.trackListener = () => refresh(uuid);
    link.descriptionListener = () => {
      if (link.channel && link.pc.signalingState === "stable" && !current(link)) replaceLink(link);
    };
    link.pc.addEventListener("track", link.trackListener);
    link.pc.addEventListener("signalingstatechange", link.descriptionListener);
    observeChannel(link);
  }

  function completeView(view) {
    if (!view || view.timer === null) return;
    clearTimeout(view.timer);
    view.timer = null;
    pendingViews--;
  }

  function forgetView(streamID) {
    const view = viewedStreams.get(streamID);
    if (!view) return;
    completeView(view);
    viewedStreams.delete(streamID);
    if (!closed) sdk.stopViewing(streamID);
  }

  function discover(stream) {
    const remote = typeof stream === "string" ? stream : stream?.streamID;
    if (closed || !published || typeof remote !== "string" ||
        !streamFormat.test(remote) || remote === streamID || viewedStreams.has(remote) ||
        pendingViews >= maxPendingViews) return;
    const view = { timer: setTimeout(() => forgetView(remote), viewTimeoutMs) };
    viewedStreams.set(remote, view);
    pendingViews++;
    sdk.view(remote, { audio: true, video: false, downloads: false }).catch(() => {
      if (viewedStreams.get(remote) === view) forgetView(remote);
    });
  }

  async function start() {
    if (typeof code !== "string" || !code || typeof identity?.pub !== "string" ||
        !publicKeyFormat.test(identity.pub) || !identity.pair?.privateKey) {
      throw new Error("Room voice requires an active Pulse identity and room code");
    }
    const [roomID, password] = await Promise.all([
      hash(protocol + "/room/" + code),
      hash(protocol + "/password/" + code),
    ]);
    if (closed) return;
    room = roomID;
    await import("../vendor/vdoninja-sdk-1.6.2/vdoninja-sdk.min.js");
    if (closed) return;
    sdk = new globalThis.VDONinjaSDK({
      salt: protocol, password, forceTURN, autoPingViewer: false,
      configuration: { bundlePolicy: "max-bundle" },
    });
    listen(sdk, "listing", ({ detail }) => {
      if (Array.isArray(detail.list)) detail.list.forEach(discover);
      else discover(detail);
    });
    listen(sdk, "videoaddedtoroom", ({ detail }) => discover(detail));
    listen(sdk, "peerConnected", connected);
    listen(sdk, "dataChannelOpen", ({ detail: { uuid, type } }) => {
      const link = links.get(uuid)?.[type];
      if (link) observeChannel(link);
    });
    listen(sdk, "peerDisconnected", ({ detail: { uuid, type, streamID } }) => {
      const roles = links.get(uuid);
      if (type === "viewer") forgetView(streamID ?? roles?.viewer?.connection.streamID);
      else if (!type) forgetView(roles?.viewer?.connection.streamID);
      if (roles?.[type]) drop(roles[type]);
      else if (!type && roles) {
        if (roles.publisher) drop(roles.publisher);
        if (roles.viewer) drop(roles.viewer);
      }
    });
    listen(sdk, "reconnectFailed", () => {
      if (!closed) {
        close().finally(() => onTerminal?.(new Error("Room voice signaling reconnect failed"))).catch(() => {});
      }
    });
    await sdk.connect();
    if (closed) return;
    await sdk.joinRoom({ room, password });
    if (closed) return;
    // Reserve the audio sender without sharing microphone data until both PCs
    // for the peer bind their authenticated fingerprints to the same account.
    audio = new AudioContext({ sampleRate: 48000 });
    const silentStream = audio.createMediaStreamDestination().stream;
    silentTrack = silentStream.getAudioTracks()[0];
    await sdk.publish(silentStream, { streamID });
    published = true;
    if (!closed) sdk.getStreams().forEach(discover);
  }

  function close() {
    if (closing) return closing;
    closed = true;
    closing = Promise.resolve().then(async () => {
      listeners.splice(0).forEach(remove => remove());
      for (const roles of links.values()) {
        if (roles.publisher) drop(roles.publisher);
        if (roles.viewer) drop(roles.viewer);
      }
      for (const view of viewedStreams.values()) completeView(view);
      viewedStreams.clear();
      silentTrack?.stop();
      await Promise.allSettled([sdk?.disconnect(), audio?.close()]);
    });
    return closing;
  }

  const ready = start().catch(async error => {
    if (closed) return;
    await close();
    throw error;
  });
  return {
    ready,
    updateStream(stream) {
      if (closed) return;
      localStream = stream;
      for (const { publisher, viewer } of sessions.values()) {
        syncSender(publisher, current(publisher) && current(viewer));
      }
    },
    async sendText(message) {
      if (closed || !isText(message, identity?.pub)) return false;
      let sent = false;
      for (const { publisher, viewer } of sessions.values()) {
        if (current(viewer) && send(publisher, { kind: "text", message })) sent = true;
      }
      return sent;
    },
    close,
  };
}

