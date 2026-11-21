import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../web/js/chunk-ITVMY7Q3.js', import.meta.url), 'utf8');
const start = source.indexOf('_d = ({ settings:');
const end = source.indexOf(', ve =', start);
assert.ok(start >= 0 && end > start, 'Missing friend request code');

for (const accepted of [true, false]) {
  const decision = accepted ? 'accepted' : 'declined';
  test(`a friend request can be ${decision} by mail after the direct peer disconnects`, async () => {
    const friend = { pub: 'friend-key', dhPub: 'friend-dh', name: 'Friend' };
    const notifications = [];
    const mailReplies = [];
    const directReplies = [];
    const peers = new Set(['earlier-peer', 'latest-peer']);
    const actions = new Map();
    const inbox = {
      makeAction(name) {
        const action = {
          async send(payload, { target }) {
            if (name !== 'res') return;
            directReplies.push([target, payload.accepted]);
            if (!peers.has(target)) throw new Error('Peer disconnected');
          },
        };
        actions.set(name, action);
        return action;
      },
    };
    const store = new Map();
    const createFriends = runInNewContext(`var ${source.slice(start, end)}; _d`, {
      pe: {
        get: (key, fallback) => store.get(key) ?? fallback,
        set: (key, value) => store.set(key, value),
      },
      Ee: () => ({ pub: 'self-key', friendCode: 'self-code' }),
      Ss: async code => code.startsWith('inbox:') ? inbox : { makeAction: () => ({}) },
      Zt: async () => 'friend-code',
      yt: ({ name }) => ({ name }),
      Kn: async () => friend,
      nl: async () => 'shared-dm',
      networkNow: Date.now,
    });
    const friends = createFriends({ settings: {}, events: { onRequest: request => notifications.push(request.pub) } });
    await friends.start();
    await friends.requestFrom(friend, value => mailReplies.push(['earlier', value]));
    await friends.requestFrom(friend, value => mailReplies.push(['latest', value]));
    for (const peerId of peers) {
      actions.get('hi').onMessage(friend, { peerId });
      await actions.get('req').onMessage({}, { peerId });
    }
    peers.delete('latest-peer');
    inbox.onPeerLeave('latest-peer');

    assert.deepEqual(notifications, ['friend-key']);
    assert.equal(friends.incoming().length, 1);
    const reply = accepted ? friends.acceptRequest : friends.declineRequest;
    await reply(friend.pub);
    await reply(friend.pub);
    assert.deepEqual(mailReplies, [['latest', accepted]]);
    assert.deepEqual(directReplies, [['latest-peer', accepted]]);
    assert.equal(friends.incoming().length, 0);
    assert.equal(friends.isFriend(friend.pub), accepted);
  });
}
