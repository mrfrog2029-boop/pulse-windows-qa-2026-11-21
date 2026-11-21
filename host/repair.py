"""Apply the Windows shell changes to the validated Pulse 1.4.0 host."""

import copy
import hashlib
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import uuid
import zipfile


PORTABLE_SOURCE = Path(__file__).with_name("PortableMode.cs")
SYSTEM_SETTINGS_HEADING = "<h2>Система</h2>"


def replace_once(value, old, new):
    if value.count(old) != 1:
        raise ValueError(f"Expected one host build anchor: {old!r}")
    return value.replace(old, new, 1)


def tool(name, default):
    path = Path(os.environ.get(f"PULSE_{name.upper()}", default))
    if not path.is_file():
        raise FileNotFoundError(f"{name} was not found at {path}. Set PULSE_{name.upper()} to the SDK tool path.")
    return path.resolve()


def run(command, directory):
    result = subprocess.run(command, cwd=directory, capture_output=True, text=True, errors="replace", check=False)
    if result.returncode:
        details = (result.stdout + "\n" + result.stderr).strip()
        raise RuntimeError(f"{Path(command[0]).name} exited with {result.returncode}\n{details}")


def alter_method(il, name, modify):
    end = il.index(f"  }} // end of method {name}\n")
    start = il.rindex("\n  .method ", 0, end)
    return il[:start] + modify(il[start:end]) + il[end:]


def guard_method(method):
    return replace_once(method, "    IL_0000:  ", """    call bool Pulse.PortableMode::get_Active()
    brfalse IL_0000
    ret
    IL_0000:  """)


def patch_entry_point(method):
    method = replace_once(method, '    IL_0034:  ldstr      "exepcstudio.Pulse"', """    IL_0034:  ldarg.0
    call bool Pulse.PortableMode::Requested(string[])
    brfalse LEGACY_APP_ID
    call string Pulse.Program::get_ExePath()
    call bool Pulse.PortableMode::CanReadConfig(string)
    brfalse INVALID_PORTABLE_CONFIG
    br IL_0082
    INVALID_PORTABLE_CONFIG: ldc.i4.2
    ret
    LEGACY_APP_ID: ldstr "exepcstudio.Pulse"
""".rstrip())
    method = replace_once(method, "    IL_008b:  newobj", """    IL_008b:  ldarg.0
    call bool Pulse.PortableMode::Requested(string[])
    brtrue INVALID_PORTABLE_CONFIG
    newobj""")
    method = replace_once(method, "    IL_00a5:  ldc.i4.1", """    IL_00a5:  ldarg.0
    ldloc.0
    ldstr "portable"
    ldnull
    callvirt instance string Pulse.Config::Get(string, string)
    ldloc.0
    ldstr "data"
    ldnull
    callvirt instance string Pulse.Config::Get(string, string)
    call string Pulse.Program::get_ExePath()
    call bool Pulse.PortableMode::Configure(string[], string, string, string)
    brfalse INVALID_PORTABLE_CONFIG
    call bool Pulse.PortableMode::get_Active()
    brfalse CREATE_INSTANCE_OBJECTS
    ldloc.0
    call string Pulse.PortableMode::get_DataDirectory()
    callvirt instance void Pulse.Config::set_DataDir(string)
    ldloc.0
    ldstr "tray"
    ldstr "0"
    callvirt instance void Pulse.Config::Set(string, string)
    CREATE_INSTANCE_OBJECTS: ldc.i4.1""")

    for resource in ("instance", "show"):
        name = 'ldstr      "Local\\\\exepcstudio.Pulse.' + resource + '"'
        method = replace_once(method, name, name + "\n    call string Pulse.PortableMode::ObjectName(string)")
    return method


def patch_shell(il):
    il = alter_method(il, "Program::Main", patch_entry_point)
    il = alter_method(il, "Setup::SetAutostart", guard_method)
    il = alter_method(il, "MainForm::Notify", guard_method)
    il = alter_method(il, "MainForm::SetHotkeys", guard_method)
    il = alter_method(il, "MainForm::CreateTray", lambda method: replace_once(method, "    IL_001e:  ldc.i4.1", """    IL_001e:  call bool Pulse.PortableMode::get_Active()
    ldc.i4.0
    ceq"""))
    il = alter_method(il, "MainForm::HandleBridge", lambda method: replace_once(method, "    IL_0294:  ldloc.s    V_8", """    IL_0294:  call bool Pulse.PortableMode::get_Active()
    brtrue IL_03f6
    ldloc.s V_8"""))

    def replace_uninstall(method):
        start = method.index("\n  {\n")
        return method[:start] + "\n  {\n    .maxstack 0\n    call void Pulse.PortableMode::ShowCleanupMessage()\n    ret\n"

    il = alter_method(il, "Setup::Uninstall", replace_uninstall)
    return replace_once(il, r"\r\nCache-Control: no-cache\r\nX-Content-Type-Options:",
                        r"\r\nCache-Control: no-store\r\nX-Content-Type-Options:")


def stamp_archive(source, build_id):
    destination = source.with_name("stamped.zip")
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination, "w") as archive:
        for entry in original.infolist():
            data = original.read(entry)
            if entry.orig_filename == "index.html":
                html = data.decode("utf-8")
                html = replace_once(html, "<head>", f'<head>\n  <meta name="pulse-build-id" content="{build_id}">')
                html = replace_once(html, SYSTEM_SETTINGS_HEADING, f'{SYSTEM_SETTINGS_HEADING}\n'
                                    f'        <p class="muted small" id="app-build-id">Сборка {build_id}</p>')
                data = html.encode("utf-8")
            output_entry = copy.copy(entry)
            output_entry.filename = entry.orig_filename
            archive.writestr(output_entry, data, compresslevel=9)

    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() or build_id.encode("ascii") not in archive.read("index.html"):
            raise ValueError("Stamped web bundle did not pass verification")
    destination.replace(source)


def make_pe_deterministic(executable):
    data = bytearray(executable.read_bytes())

    def u16(offset):
        return struct.unpack_from("<H", data, offset)[0]

    def u32(offset):
        return struct.unpack_from("<I", data, offset)[0]

    coff = u32(0x3C) + 4
    optional = coff + 20
    section_table = optional + u16(coff + 16)

    def map_rva(rva):
        for index in range(u16(coff + 2)):
            section = section_table + 40 * index
            virtual, size, raw = struct.unpack_from("<III", data, section + 12)
            if virtual <= rva < virtual + size:
                return raw + rva - virtual
        raise ValueError(f"Unmapped PE address 0x{rva:x}")

    clr = map_rva(u32(optional + 112 + 14 * 8))
    metadata = map_rva(u32(clr + 8))
    if data[metadata:metadata + 4] != b"BSJB":
        raise ValueError("Assembled host is missing CLR metadata")

    cursor = metadata + 16 + u32(metadata + 12)
    stream_count = u16(cursor + 2)
    cursor += 4
    for _ in range(stream_count):
        offset, size = struct.unpack_from("<II", data, cursor)
        name_end = data.index(0, cursor + 8)
        name = data[cursor + 8:name_end]
        cursor = name_end + (4 - (name_end - metadata) % 4)
        if name == b"#GUID":
            if size != 16:
                raise ValueError("Expected the assembled host to have exactly one module GUID")
            guid = metadata + offset
            data[coff + 4:coff + 8] = bytes(4)
            data[guid:guid + 16] = bytes(16)
            module_id = uuid.UUID(bytes=hashlib.sha256(data).digest()[:16], version=5)
            data[guid:guid + 16] = module_id.bytes_le
            return data
    raise ValueError("Assembled host is missing its module GUID")


def repair_executable(executable):
    framework = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET/Framework64/v4.0.30319"
    sdk = Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
    sdk /= "Microsoft SDKs/Windows/v10.0A/bin/NETFX 4.8 Tools/x64"
    ildasm = tool("ildasm", sdk / "ildasm.exe")
    ilasm = tool("ilasm", framework / "ilasm.exe")
    csc = tool("csc", framework / "csc.exe")

    digest = hashlib.sha256(executable)
    digest.update(Path(__file__).read_bytes())
    digest.update(PORTABLE_SOURCE.read_bytes())
    build_id = digest.hexdigest()[:16]

    with tempfile.TemporaryDirectory(prefix="pulse-host-build-") as directory:
        root = Path(directory)
        (root / "Input.exe").write_bytes(executable)
        run([ildasm, "/nobar", "/utf8", "/out=Input.il", "Input.exe"], root)
        run([csc, "/nologo", "/noconfig", "/target:library", "/optimize+", "/codepage:65001",
             f"/reference:{framework / 'System.dll'}", f"/reference:{framework / 'System.Windows.Forms.dll'}",
             "/out:Portable.dll", PORTABLE_SOURCE], root)
        run([ildasm, "/nobar", "/utf8", "/out=Portable.il", "Portable.dll"], root)

        helper = (root / "Portable.il").read_text(encoding="utf-8-sig")
        class_start = helper.rindex("\n.class ", 0, helper.index("Pulse.PortableMode\n"))
        class_end = helper.index("} // end of class Pulse.PortableMode\n") + 1
        shell = (root / "Input.il").read_text(encoding="utf-8-sig")
        repaired = patch_shell(shell) + helper[class_start:class_end] + "\n"
        (root / "Repaired.il").write_text(repaired, encoding="utf-8-sig")
        stamp_archive(root / "web.zip", build_id)
        run([ilasm, "Repaired.il", "/nologo", "/quiet", "/x64", "/pe64", "/exe",
             "/resource=Input.res", "/output=Pulse.exe"], root)
        return make_pe_deterministic(root / "Pulse.exe"), build_id
