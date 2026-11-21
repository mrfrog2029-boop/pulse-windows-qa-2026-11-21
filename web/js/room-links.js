// A participant can reach the room by more than one route. Only an authenticated
// account key can merge a relay profile with an existing voice participant.
export class RoomLinks {
  constructor({ code, pool, identity, getProfile, getMicrophone, directKeys, onChange, onText, openChat, openVoice }) {
    Object.assign(this, { code, pool, identity, getProfile, getMicrophone, directKeys, onChange, onText, openChat, openVoice });
    this.sessions = { chat: new Map(), voice: new Map() };
    this.handles = {};
    this.opening = {};
    this.generation = { chat: 0, voice: 0 };
    this.closed = false;
  }

  members() {
    const members = new Map();
    const direct = this.directKeys();
    for (const [kind, sessions] of Object.entries(this.sessions)) {
      for (const link of sessions.values()) {
        const pub = link.profile.pub;
        if (direct.has(pub)) continue;
        let member = members.get(pub);
        if (!member) {
          member = { profile: link.profile, chat: false, voice: false, connection: null, stream: null };
          members.set(pub, member);
        }
        member[kind] = true;
        if (kind === 'voice') {
          member.connection = link.connection;
          member.stream = link.stream;
        }
      }
    }
    return members;
  }

  remember(kind, session, profile, connection = null) {
    if (this.closed || !profile?.pub || profile.pub === this.identity.pub) return;
    const old = this.sessions[kind].get(session);
    this.sessions[kind].set(session, { profile, connection, stream: old?.profile.pub === profile.pub ? old.stream : null });
    this.onChange();
    if (kind === 'voice') this.syncMicrophone();
  }

  forget(kind, session) {
    if (this.closed || !this.sessions[kind].delete(session)) return;
    this.onChange();
    if (kind === 'voice') this.syncMicrophone();
  }

  receive(kind, message, session) {
    const link = this.sessions[kind].get(session);
    if (!this.closed && link && message?.kind === 'text' && message.pub === link.profile.pub)
      this.onText(message, link.profile.pub);
  }

  startChat() {
    return this.start('chat', () => this.openChat({
      code: this.code, pool: this.pool, identity: this.identity, profile: this.getProfile(),
      onPeer: (profile, session) => this.remember('chat', session, profile),
      onLeave: session => this.forget('chat', session),
      onText: (message, session) => this.receive('chat', message, session)
    }));
  }

  startVoice() {
    const generation = this.generation.voice;
    const active = () => !this.closed && this.generation.voice === generation;
    return this.start('voice', () => this.openVoice({
      code: this.code, identity: this.identity, profile: this.getProfile, getStream: () => this.microphone(),
      allowAudioFor: pub => active() && !this.directKeys().has(pub),
      onTerminal: () => { if (active()) this.stopVoice(); },
      onPeer: (session, profile, connection) => { if (active()) this.remember('voice', session, profile, connection); },
      onLeave: session => { if (active()) this.forget('voice', session); },
      onStream: (session, stream) => {
        const link = this.sessions.voice.get(session);
        if (active() && link && link.stream !== stream) { link.stream = stream; this.onChange(); }
      },
      onText: (message, session) => { if (active()) this.receive('voice', message, session); }
    }));
  }

  start(kind, create) {
    if (this.closed) return Promise.resolve();
    if (this.opening[kind]) return this.opening[kind];
    const generation = this.generation[kind];
    this.opening[kind] = Promise.resolve().then(create).then(async handle => {
      if (this.closed || this.generation[kind] !== generation) { await handle.close(); return; }
      this.handles[kind] = handle;
      if (kind === 'voice') this.syncMicrophone();
      await handle.ready;
    }).catch(async error => {
      if (this.closed || this.generation[kind] !== generation) return;
      const handle = this.handles[kind];
      delete this.opening[kind];
      delete this.handles[kind];
      if (handle) await handle.close();
      if (!this.closed) throw error;
    });
    return this.opening[kind];
  }

  stopVoice() {
    this.generation.voice++;
    const handle = this.handles.voice;
    delete this.handles.voice;
    delete this.opening.voice;
    delete this.lastMicrophone;
    this.sessions.voice.clear();
    if (handle) Promise.resolve(handle.close()).catch(() => {});
    if (!this.closed) this.onChange();
  }

  microphone() {
    const direct = this.directKeys();
    const voice = [...this.sessions.voice.values()];
    return this.closed || (voice.length && voice.every(link => direct.has(link.profile.pub))) ? null : this.getMicrophone();
  }

  syncMicrophone(force = false) {
    if (!this.handles.voice || this.closed) return;
    const mic = this.microphone();
    const direct = [...this.directKeys()].sort().join('|');
    if (force || this.lastMicrophone !== mic || this.lastDirect !== direct) {
      this.lastMicrophone = mic;
      this.lastDirect = direct;
      Promise.resolve(this.handles.voice.updateStream(mic)).catch(() => {});
    }
  }

  async sendText(message) {
    if (this.closed || message?.kind !== 'text' || message.pub !== this.identity.pub) return false;
    const members = [...this.members().values()];
    if (!members.length) return false;
    const send = async kind => {
      try { return Boolean(await this.handles[kind]?.sendText(message)); }
      catch { return false; }
    };
    // Each route can reach a different subset. Signed message IDs deduplicate
    // copies on recipients that can hear both routes.
    const [spoken, written] = await Promise.all([
      members.some(member => member.voice) && send('voice'),
      members.some(member => member.chat) && send('chat')
    ]);
    return Boolean(spoken || written);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.sessions.chat.clear();
    this.sessions.voice.clear();
    for (const handle of Object.values(this.handles)) Promise.resolve(handle.close()).catch(() => {});
    this.handles = {};
  }
}
