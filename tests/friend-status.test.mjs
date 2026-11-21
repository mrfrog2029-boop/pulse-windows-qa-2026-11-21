import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const renderer = readFileSync(new URL('../web/js/chunk-ITVMY7Q3.js', import.meta.url), 'utf8');
const start = renderer.indexOf('_d = ({ settings:');
const end = renderer.indexOf(', ve =', start);
assert.ok(start >= 0 && end > start);

function openFriends() {
  let now = 1_800_000_000_000;
  const contact = { pub: 'friend', name: 'Friend', dhPub: 'exchange', code: 'id-x', npub: 'a'.repeat(64), npubAt: now - 9000 };
  const store = new Map([['friends', [contact]]]);
  const make = runInNewContext(`var ${renderer.slice(start, end)}; _d`, {
    pe: { get: (key, fallback) => store.get(key) ?? fallback, set: (key, value) => store.set(key, value) },
    networkNow: () => now, yt: profile => ({ name: profile.name, npub: profile.npub }),
  });
  return { friends: make({ settings: {}, events: {} }), contact, now, advance: ms => { now += ms; } };
}

test('an explicit fresh offline packet is never interpreted as an online heartbeat', () => {
  const { friends, contact, now } = openFriends();
  friends.setPresence(contact.pub, now, false, 'a'.repeat(64));
  assert.equal(friends.isOnline(contact.pub), false);
});

test('a readable directory cannot prove an unobserved friend is offline', () => {
  const body = renderer.slice(renderer.indexOf('function describeFriendStatus('), renderer.indexOf('var br ='));
  const format = runInNewContext(body + '; describeFriendStatus', {
    W: { isOnline: () => false, getPresence: () => 'unknown' },
    Qt: { getPool: () => ({ readableCount: () => 1 }) },
  });
  assert.match(format({ pub: 'friend' }), /статус неизвестен/i);
});

test('a signed logout supersedes an older heartbeat and only confirms offline while it is fresh', () => {
  const { friends, contact, now, advance } = openFriends();
  assert.equal(friends.isOnline(contact.pub), false);
  assert.equal(friends.getPresence(contact.pub), 'unknown');
  friends.setPresence(contact.pub, now - 2000, true, 'a'.repeat(64));
  assert.equal(friends.getPresence(contact.pub), 'online');
  friends.setPresence(contact.pub, now, false, 'c'.repeat(64));
  assert.equal(friends.isOnline(contact.pub), false);
  assert.equal(friends.getPresence(contact.pub), 'offline');
  friends.setPresence(contact.pub, now - 1000, true, 'b'.repeat(64));
  assert.equal(friends.getPresence(contact.pub), 'offline');
  advance(120_001);
  assert.equal(friends.getPresence(contact.pub), 'unknown');
  friends.setPresence(contact.pub, now + 121_000, true, 'd'.repeat(64));
  assert.equal(friends.getPresence(contact.pub), 'online');
});

test('replaceable events with the same second resolve to the lowest event id regardless of arrival order', () => {
  for (const order of [[true, false], [false, true]]) {
    const { friends, contact, now } = openFriends();
    for (const online of order) friends.setPresence(contact.pub, now, online, (online ? 'e' : '2').repeat(64));
    assert.equal(friends.getPresence(contact.pub), 'offline');
  }
});

test('future, expired, and unrecognised peer records cannot create current presence', () => {
  const { friends, contact, now } = openFriends();
  friends.setPresence(contact.pub, now + 3600_000, true, 'b'.repeat(64));
  friends.setPresence(contact.pub, now - 3600_000, true, 'a'.repeat(64));
  friends.setPresence('stranger', now, true, 'c'.repeat(64));
  assert.equal(friends.getPresence(contact.pub), 'unknown');
  assert.equal(friends.getPresence('stranger'), 'unknown');
});

test('snapshot preserves the accepted relay identity revision across another device or a restore', () => {
  const a = openFriends(), b = openFriends();
  const snapshot = a.friends.snapshot();
  assert.equal(snapshot.friends[0].npubAt, a.contact.npubAt);
  const newer = { ...snapshot.friends[0], pub: 'restored', name: 'Restored' };
  b.friends.merge({ friends: [newer] });
  assert.equal(b.friends.get('restored').npubAt, a.contact.npubAt);
});
