import assert from "node:assert/strict";
import { test } from "node:test";
import { identityFingerprint, peerRecord } from "./exe-remote-pair.mjs";

const runId = "1ab4e98ca972354fd3";
const profile = {
  npub: "1".repeat(64),
  pub: "public-signing-key",
  dhPub: "public-exchange-key",
  code: "id-123456789ABCDEFG",
  nick: `pulseb_${runId}`,
  name: `Pulse QA B ${runId}`,
};

test("the public identity fingerprint binds the exact three public keys and directory identity", () => {
  const wanted = identityFingerprint(profile);
  assert.match(wanted, /^[a-f0-9]{64}$/);
  assert.equal(identityFingerprint({ ...profile, bio: "ignored mutable status" }), wanted);
  for (const field of ["npub", "pub", "dhPub", "code", "nick", "name"]) {
    assert.notEqual(identityFingerprint({ ...profile, [field]: `${profile[field]}2` }), wanted, field);
  }
});

test("only the current peer's public fingerprint is accepted for rendezvous", () => {
  const own = "a".repeat(64);
  const record = { schema: 1, runId, role: "B", identityFingerprint: identityFingerprint(profile) };
  assert.equal(peerRecord(record, runId, "A", own), record.identityFingerprint);
  for (const invalid of [
    { ...record, runId: "past-run" }, { ...record, role: "A" },
    { ...record, identityFingerprint: own }, { ...record, password: "unexpected data" },
    { ...record, identityFingerprint: "not-a-fingerprint" },
  ]) assert.throws(() => peerRecord(invalid, runId, "A", own), /peer fingerprint/i);
});
