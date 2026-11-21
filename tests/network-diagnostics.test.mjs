import test from 'node:test';
import assert from 'node:assert/strict';
import { traceNetwork, traceRoom, networkReport } from '../web/js/network-diagnostics.js';

test('two clients can correlate a publication and receipt without exporting any payload', async () => {
  const event = 'abcd'.repeat(16);
  traceNetwork('publish', { kind: 30078, accepted: 1, content: 'Private text', token: 'secret' }, event);
  traceNetwork('presence', { online: 1 }, event);
  await traceRoom('room.join', 'pulse-23456789ABCDabcd23456789');
  await traceRoom('room.confirmed', 'pulse-23456789ABCDabcd23456789', 2);
  const url = 'wss://example.test/relay?access=secret';
  const report = await networkReport([url], ['wss://example.test/relay?access=other']);
  assert.equal(report.directory[0], report.rooms[0]);
  const [pub, presence, join, confirmed] = report.events.slice(-4);
  assert.equal(pub.ref, presence.ref);
  assert.equal(join.ref, confirmed.ref);
  assert.equal(confirmed.members, 2);
  assert.notEqual(join.attempt, confirmed.attempt);
  assert.doesNotMatch(JSON.stringify(report), /23456789|Private text|access|example\.test|secret|abcdabcdabcdabcd/);
});

test('memory and exported fields remain bounded even during a reconnect loop', async () => {
  for (let i = 0; i < 400; i++) traceNetwork('query', { received: i, eose: 1, ignored: 'do not log' });
  traceNetwork('untrusted incoming text', {}, 'bad');
  const report = await networkReport([], []);
  assert.equal(report.events.length, 160);
  assert.equal(report.events.at(-1).received, 399);
  assert.equal(report.events.at(-1).ref, undefined);
  assert.equal(report.events.at(-1).ignored, undefined);
});
