import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomLinks } from '../web/js/room-links.js';

function fixture() {
  const hooks = {}, direct = new Set(), delivered = [], sent = [], mics = [], closed = [];
  const make = name => async options => {
    hooks[name] = options;
    return {
      sendText: async message => { sent.push([name, message]); return true; },
      updateStream: stream => { mics.push(stream); },
      close: () => { closed.push(name); }
    };
  };
  const mic = {}, profile = { pub: 'bob', name: 'Bob', dhPub: 'bob-dh', color: '#552233' };
  const members = new RoomLinks({
    code: 'code', identity: { pub: 'alice' }, getProfile: () => ({}), pool: {}, getMicrophone: () => mic,
    directKeys: () => direct, onChange() {}, onText: message => delivered.push(message),
    openChat: make('chat'), openVoice: make('voice')
  });
  return { members, profile, hooks, direct, delivered, sent, mics, closed, mic };
}

test('one account on text, reserve voice and direct RTC is counted once and recovers when a path goes away', async () => {
  const { members, profile, hooks, direct, mic, mics } = fixture();
  await members.startChat();
  hooks.chat.onPeer(profile, 'tab');
  assert.equal(members.members().get('bob').profile.name, 'Bob');
  await members.startVoice();
  const conn = {};
  hooks.voice.onPeer('voice', profile, conn);
  assert.equal(members.members().size, 1);
  assert.equal(members.members().get('bob').connection, conn);
  assert.equal(hooks.voice.getStream(), mic);
  direct.add('bob');
  members.syncMicrophone();
  assert.equal(members.members().size, 0);
  assert.equal(mics.at(-1), null);
  direct.delete('bob');
  members.syncMicrophone();
  assert.equal(mics.at(-1), mic);
  hooks.voice.onLeave('voice');
  assert.equal(members.members().get('bob').connection, null);
  hooks.chat.onLeave('tab');
  assert.equal(members.members().size, 0);
});

test('room text binds to the authenticated sender and uses a working route without direct ICE', async () => {
  const { members, profile, hooks, delivered, sent } = fixture();
  await members.startChat();
  hooks.chat.onPeer(profile, 'remote');
  const message = { kind: 'text', pub: 'bob', text: 'Pulse' };
  hooks.chat.onText({ ...message, pub: 'other' }, 'remote');
  hooks.chat.onText(message, 'absent');
  hooks.chat.onText(message, 'remote');
  assert.deepEqual(delivered, [message]);
  assert.equal(await members.sendText({ kind: 'text', pub: 'alice' }), true);
  assert.deepEqual(sent.map(item => item[0]), ['chat']);
  await members.startVoice();
  hooks.voice.onPeer('audio', profile, {});
  assert.equal(await members.sendText({kind:'text',pub:'alice'}), true);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.slice(-2).map(([path]) => path).sort(), ['chat', 'voice']);
  members.close();
  hooks.chat.onText(message, 'remote');
  assert.deepEqual(delivered, [message]);
});

test('a terminal reserve disconnect can be reopened and old callbacks cannot re-add a participant', async () => {
  const { members, profile, hooks } = fixture();
  await members.startVoice();
  const first = hooks.voice;
  first.onPeer('first', profile, {});
  first.onTerminal();
  assert.equal(members.members().size, 0);
  await members.startVoice();
  assert.notEqual(first, hooks.voice);
  first.onPeer('stale', profile, {});
  assert.equal(members.members().size, 0);
  hooks.voice.onPeer('second', profile, {});
  assert.equal(members.members().size, 1);
  members.close();
});

test('leaving while a reserve connection opens closes it and discards late callbacks', async () => {
  const wait = Promise.withResolvers(), { members, profile } = fixture();
  let closeCount = 0, callbacks;
  members.openVoice = options => { callbacks = options; return wait.promise; };
  const opening = members.startVoice();
  await Promise.resolve();
  members.close();
  callbacks.onPeer('late', profile, {});
  wait.resolve({ close() { closeCount++; } });
  await opening;
  assert.equal(closeCount, 1);
  assert.equal(members.members().size, 0);
});
