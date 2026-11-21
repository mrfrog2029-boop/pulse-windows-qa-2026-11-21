import assert from "node:assert/strict";
import { test } from "node:test";
import { identityFingerprint, machineFingerprint, peerRecord, vmEvidence } from "./exe-remote-pair.mjs";

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

test("machine evidence compares unique identifiers from the same provider field", () => {
  const raw = "7ba98698-39aa-4458-a151-6e4a4a4d8e2c";
  const a = machineFingerprint(runId, "azureVmId", raw);
  const b = machineFingerprint(runId, "azureVmId", "e3d10aad-3184-4b40-b3e2-f5baca7a12d0");
  const otherSource = machineFingerprint(runId, "smbiosUuid", raw);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(machineFingerprint(runId, "azureVmId", raw.toUpperCase()), a);
  assert.notEqual(machineFingerprint("another-run-id", "azureVmId", raw), a);
  for (const invalid of ["", "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff"]) {
    assert.equal(machineFingerprint(runId, "azureVmId", invalid), null);
  }
  assert.equal(vmEvidence({ azureVmId: a }, { smbiosUuid: otherSource }), null);
  assert.deepEqual(vmEvidence({ azureVmId: a }, { azureVmId: a }), { source: "azureVmId", distinct: false });
  assert.deepEqual(vmEvidence({ azureVmId: a }, { azureVmId: b }), { source: "azureVmId", distinct: true });
  assert.deepEqual(vmEvidence({ smbiosUuid: otherSource }, { smbiosUuid: b }), { source: "smbiosUuid", distinct: true });
});
