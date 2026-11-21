import base64
import hashlib
import json
import os
from pathlib import Path
import random
import re
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
BASE_EXE = Path(os.environ.get("PULSE_BUILD_TEST_EXE", PROJECT / "baseline" / "Pulse.exe"))


def sections(data):
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    count = struct.unpack_from("<H", data, pe + 6)[0]
    optional_size = struct.unpack_from("<H", data, pe + 20)[0]
    table = pe + 24 + optional_size
    result = {}
    for index in range(count):
        name, _, _, size, start = struct.unpack_from("<8s4I", data, table + index * 40)
        result[name.rstrip(b"\0")] = (start, start + size)
    return result


class PackageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="pulse-package-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "source.exe"
        self.source.write_bytes(BASE_EXE.read_bytes())
        self.output = self.root / "staged.exe"
        self.web = self.root / "web"

    def unpack_web_fixture(self):
        reflected = self.root / "source.zip"
        self.reflect_resources(self.source, reflected)
        expected = {}
        with zipfile.ZipFile(reflected) as archive:
            for entry in archive.infolist():
                name = entry.orig_filename
                contents = archive.read(entry)
                expected[name] = contents
                path = self.web / name.replace("\\", "/")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(contents)
        return expected

    def build(self, output=None, preserve_host=True):
        arguments = [
            sys.executable, "-B", str(PROJECT / "build.py"),
            "--source", str(self.source),
            "--web-dir", str(self.web),
            "--output", str(output or self.output),
        ]
        if preserve_host:
            arguments.append("--preserve-host")
        return subprocess.run(
            arguments,
            capture_output=True,
            text=True,
            check=False,
        )

    def reflect_resources(self, executable, reflected_zip=None):
        # Each executable has the same assembly identity and needs its own
        # reflection-only context. Neither executable's entry point runs.
        resource_code = r"""
$ErrorActionPreference = 'Stop'
$assembly = [Reflection.Assembly]::ReflectionOnlyLoadFrom($env:PULSE_PACKAGE_EXE)
$values = @{}
foreach ($name in $assembly.GetManifestResourceNames()) {
    $stream = $assembly.GetManifestResourceStream($name)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $values[$name] = [Convert]::ToBase64String($sha.ComputeHash($stream)) }
        finally { $sha.Dispose() }
        if ($name -eq 'web.zip' -and $env:PULSE_PACKAGE_ARCHIVE) {
            $stream.Position = 0
            $file = [IO.File]::Create($env:PULSE_PACKAGE_ARCHIVE)
            try { $stream.CopyTo($file) }
            finally { $file.Dispose() }
        }
    } finally { $stream.Dispose() }
}
$fixedHash = $null
if ($values.ContainsKey('Pulse.Fixed.exe')) {
    $field = $assembly.GetType('PulseUpdater.Install').GetField('FixedHash', 'Static, NonPublic')
    $fixedHash = $field.GetRawConstantValue()
}
$nativeVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($env:PULSE_PACKAGE_EXE)
@{identity=$assembly.FullName; resources=$values; fixedHash=$fixedHash;
  fileVersion=$nativeVersion.FileVersion; productVersion=$nativeVersion.ProductVersion;
  originalFilename=$nativeVersion.OriginalFilename} | ConvertTo-Json -Compress
"""
        powershell = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", resource_code],
            env={
                **os.environ,
                "PULSE_PACKAGE_EXE": str(executable),
                "PULSE_PACKAGE_ARCHIVE": str(reflected_zip) if reflected_zip else "",
            },
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(powershell.returncode, 0, powershell.stderr)
        return json.loads(powershell.stdout)

    def test_larger_bundle_loads_and_preserves_other_resources(self):
        expected = self.unpack_web_fixture()
        previous_archive_size = (self.root / "source.zip").stat().st_size
        net_name = next(name for name in expected if name.endswith("net.js"))
        extra_source = random.Random(139).randbytes(96 * 1024).hex().encode("ascii")
        expected[net_name] += b"\n// Test fixture for a larger bundle.\n/*" + extra_source + b"*/\n"
        (self.web / "js/net.js").write_bytes(expected[net_name])
        extra_module = "js/network-time.js"
        expected[extra_module] = b"export const time = () => Date.now();\n"
        (self.web / extra_module).write_bytes(expected[extra_module])
        input_hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.output.write_bytes(b"previous build")

        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        original = self.source.read_bytes()
        output = self.output.read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(), input_hash)
        old_native_start, old_native_end = sections(original)[b".rsrc"]
        new_native_start, new_native_end = sections(output)[b".rsrc"]
        self.assertEqual(
            output[new_native_start:new_native_end],
            original[old_native_start:old_native_end],
        )

        reflected_zip = self.root / "reflected.zip"
        old_description = self.reflect_resources(self.source)
        new_description = self.reflect_resources(self.output, reflected_zip)
        self.assertEqual(old_description["identity"], new_description["identity"])
        old_hashes = old_description["resources"]
        new_hashes = new_description["resources"]
        self.assertNotEqual(old_hashes.pop("web.zip"), new_hashes.pop("web.zip"))
        self.assertEqual(old_hashes, new_hashes)
        self.assertGreater(reflected_zip.stat().st_size, previous_archive_size)
        with zipfile.ZipFile(reflected_zip) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(
                {entry.orig_filename.replace("\\", "/"): archive.read(entry) for entry in archive.infolist()},
                {name.replace("\\", "/"): contents for name, contents in expected.items()},
            )

    def test_rebuild_replaces_existing_section_and_can_drop_prior_additions(self):
        self.unpack_web_fixture()
        clean = self.root / "clean.exe"
        result = self.build(output=clean)
        self.assertEqual(result.returncode, 0, result.stderr)
        previous_only = self.web / "js/previous-build-only.js"
        previous_only.write_bytes(random.Random(241).randbytes(96 * 1024).hex().encode("ascii"))
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        grown = self.output.read_bytes()
        self.assertGreater(len(grown), clean.stat().st_size)
        previous_only.unlink()

        self.source = self.output
        rebuilt = self.root / "rebuilt.exe"
        result = self.build(output=rebuilt)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = rebuilt.read_bytes()
        self.assertEqual(self.output.read_bytes(), grown)
        self.assertEqual(output, clean.read_bytes())
        self.assertEqual(tuple(sections(output)), (b".text", b".rsrc", b".pweb"))
        self.assertEqual(sections(output)[b".pweb"][1], len(output))

    def test_refuses_modified_source_and_leaves_existing_output_intact(self):
        self.unpack_web_fixture()
        changed = bytearray(self.source.read_bytes())
        native_start, _ = sections(changed)[b".rsrc"]
        changed[native_start] ^= 1
        self.source.write_bytes(changed)
        self.output.write_bytes(b"previous build")

        result = self.build()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256", result.stderr)
        self.assertEqual(self.output.read_bytes(), b"previous build")

    def test_refuses_trailing_source_data(self):
        self.unpack_web_fixture()
        with self.source.open("ab") as stream:
            stream.write(b"extra data")
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("trailing", result.stderr)
        self.assertFalse(self.output.exists())

    def test_refuses_to_replace_the_source(self):
        self.unpack_web_fixture()
        original = self.source.read_bytes()

        result = self.build(output=self.source)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("different", result.stderr)
        self.assertEqual(self.source.read_bytes(), original)

    def test_missing_web_member_leaves_existing_output_intact(self):
        self.unpack_web_fixture()
        (self.web / "index.html").unlink()
        self.output.write_bytes(b"previous build")

        result = self.build()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("index.html", result.stderr)
        self.assertEqual(self.output.read_bytes(), b"previous build")

    def test_baseline_updater_payload_matches_baseline_pulse(self):
        baseline = PROJECT / "baseline"
        reflected = self.reflect_resources(baseline / "Pulse-Update-2.exe")
        payload_hash = hashlib.sha256((baseline / "Pulse.exe").read_bytes()).digest()
        self.assertEqual(base64.b64decode(reflected["resources"]["Pulse.Fixed.exe"]), payload_hash)
        self.assertEqual(reflected["fixedHash"], payload_hash.hex().upper())

    def test_repaired_host_is_reproducible_and_marks_the_active_bundle(self):
        self.unpack_web_fixture()
        first = self.build(preserve_host=False)
        self.assertEqual(first.returncode, 0, first.stderr)
        copy = self.root / "same-build.exe"
        second = self.build(output=copy, preserve_host=False)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.output.read_bytes(), copy.read_bytes())

        active = self.root / "active.zip"
        described = self.reflect_resources(self.output, active)
        original = self.reflect_resources(self.source)
        for name in ("identity", "fileVersion", "productVersion", "originalFilename"):
            self.assertEqual(described[name], original[name])
        described["resources"].pop("web.zip")
        original["resources"].pop("web.zip")
        self.assertEqual(described["resources"], original["resources"])

        with zipfile.ZipFile(active) as archive:
            html = archive.read("index.html").decode("utf-8")
            marker = re.search(r'<meta name="pulse-build-id" content="([0-9a-f]{16})">', html)
            self.assertIsNotNone(marker)
            build_id = marker.group(1)
            self.assertIn(build_id, first.stdout)
            system = re.search(r'<section[^>]+data-sec="system"[^>]*>(.*?)</section>', html, re.DOTALL)
            self.assertIsNotNone(system)
            self.assertIn(f' id="app-build-id">Сборка {build_id}', system.group(1))
            self.assertIn(' id="app-version"', html)

        with (self.web / "js/net.js").open("ab") as stream:
            stream.write(b"\n// New web content produces a new build id.\n")
        changed = self.build(output=copy, preserve_host=False)
        self.assertEqual(changed.returncode, 0, changed.stderr)
        self.assertNotIn(build_id, changed.stdout)


if __name__ == "__main__":
    unittest.main()
