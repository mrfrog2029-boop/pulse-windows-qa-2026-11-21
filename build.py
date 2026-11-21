"""Build the repaired x64 Pulse 1.4.0 executable from an original or previously repackaged host."""

import argparse
import copy
import hashlib
import io
import os
from pathlib import Path
import struct
import tempfile
import zipfile

from host.repair import repair_executable


SOURCE_SHA256 = "aa697b9b6e50f7f2ceb17c4753220c3c59b2ad374e51dc459303f219c584abeb"
# SHA-256 over the original PE bytes with the fields edited by this packager omitted.
HOST_SHA256 = "fec7daba44b825a07ad93811a60d726911247041aa3a9bb02e1117b9f9fff8ea"
BASE_CLR_RESOURCES_RVA = 61384
# Offset columns of the two ManifestResource metadata rows in this specific build.
WEB_RESOURCE_ROW = 26580
ICON_RESOURCE_ROW = 26592

PE_SECTION = struct.Struct("<8s6I2HI")
PE32_PLUS = 0x20B
PE_SIZE_OF_HEADERS = 60
PE_SIZE_OF_IMAGE = 56
PE_SIZE_OF_INITIALIZED_DATA = 8
PE_DATA_DIRECTORIES = 112
PE_CLR_DIRECTORY = 14
CLR_RESOURCES_DIRECTORY = 24
INITIALIZED_READ_ONLY = 0x40000040


def read_u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def align_up(value, alignment):
    return (value + alignment - 1) // alignment * alignment


def host_hash(data, end, changed_fields):
    digest = hashlib.sha256()
    offset = 0
    for start, length in sorted(changed_fields):
        digest.update(data[offset:start])
        offset = start + length
    digest.update(data[offset:end])
    return digest.hexdigest()


def rebuild_archive(original_archive, web_dir):
    with zipfile.ZipFile(io.BytesIO(original_archive)) as source:
        original_entries = {entry.orig_filename.replace("\\", "/"): entry for entry in source.infolist()}
    files = {
        path.relative_to(web_dir).as_posix(): path
        for path in web_dir.rglob("*")
        if path.is_file()
    }
    missing = sorted(original_entries.keys() - files.keys())
    if missing:
        raise ValueError(f"Missing web bundle members in {web_dir}: {', '.join(missing)}")

    output = io.BytesIO()
    expected_files = {}
    web_root = web_dir.resolve()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in sorted(files.items()):
            if not path.resolve().is_relative_to(web_root) or "\\" in name:
                raise ValueError(f"Web bundle member is outside the web folder or has an invalid name: {path}")
            contents = path.read_bytes()
            original = original_entries.get(name)
            if original is None:
                replacement = zipfile.ZipInfo(name)
                replacement.compress_type = zipfile.ZIP_DEFLATED
            else:
                # ZipInfo normalizes backslashes on Windows. Preserve their
                # exact spelling for entries from the original archive.
                replacement = copy.copy(original)
                replacement.filename = original.orig_filename
            archive.writestr(replacement, contents, compresslevel=9)
            expected_files[replacement.filename] = contents

    result = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(result)) as archive:
        if archive.testzip() is not None:
            raise ValueError("Rebuilt web archive failed its CRC check")
        entries = archive.infolist()
        if [entry.orig_filename for entry in entries] != list(expected_files) or any(
            archive.read(entry) != expected_files[entry.orig_filename] for entry in entries
        ):
            raise ValueError("Rebuilt web archive differs from its inputs")
    return result


def rebuild_executable(original, web_dir):
    pe = read_u32(original, 0x3C)
    if original[:2] != b"MZ" or original[pe : pe + 4] != b"PE\0\0":
        raise ValueError("Source has an unexpected PE signature")
    coff = pe + 4
    machine, section_count = struct.unpack_from("<HH", original, coff)
    optional_size = struct.unpack_from("<H", original, coff + 16)[0]
    optional = coff + 20
    if machine != 0x8664 or section_count not in (2, 3) or struct.unpack_from("<H", original, optional)[0] != PE32_PLUS:
        raise ValueError("Source has an unexpected PE section layout")

    table = optional + optional_size
    text = PE_SECTION.unpack_from(original, table)
    native_resources = PE_SECTION.unpack_from(original, table + PE_SECTION.size)
    if text[0] != b".text\0\0\0" or native_resources[0] != b".rsrc\0\0\0":
        raise ValueError("Source has unexpected PE section names")
    _, _, text_rva, text_raw_size, text_raw, *_ = text
    _, native_virtual_size, native_rva, native_size, native_raw, *_ = native_resources
    section_header = table + 2 * PE_SECTION.size
    header_end = section_header + PE_SECTION.size
    if header_end > min(text_raw, read_u32(original, optional + PE_SIZE_OF_HEADERS)):
        raise ValueError("Source lacks space for the web resource section header")

    section_alignment, file_alignment = struct.unpack_from("<II", original, optional + 32)
    if not 0 < file_alignment <= section_alignment:
        raise ValueError("Source has invalid PE section alignment")
    section_raw = align_up(native_raw + native_size, file_alignment)
    section_rva = align_up(native_rva + max(native_virtual_size, native_size), section_alignment)
    clr_directory = optional + PE_DATA_DIRECTORIES + PE_CLR_DIRECTORY * 8
    clr = text_raw + read_u32(original, clr_directory) - text_rva
    clr_resources = clr + CLR_RESOURCES_DIRECTORY
    base_bundle_raw = text_raw + BASE_CLR_RESOURCES_RVA - text_rva
    text_end = text_raw + text_raw_size
    if not text_raw <= clr < base_bundle_raw < text_end <= native_raw < section_raw <= len(original):
        raise ValueError("Source has an unexpected CLR resource layout")

    if section_count == 2:
        if len(original) != section_raw or any(original[section_header:header_end]):
            raise ValueError("Original source has trailing data or an unexpected section header")
        if hashlib.sha256(original).hexdigest() != SOURCE_SHA256:
            raise ValueError("Source SHA-256 does not match the original Pulse 1.4.0")
    else:
        changed_fields = (
            (coff + 2, 2),
            (optional + PE_SIZE_OF_INITIALIZED_DATA, 4),
            (optional + PE_SIZE_OF_IMAGE, 4),
            (section_header, PE_SECTION.size),
            (clr_resources, 8),
            (ICON_RESOURCE_ROW, 4),
        )
        if host_hash(original, section_raw, changed_fields) != HOST_SHA256:
            raise ValueError("Source SHA-256 does not match the preserved Pulse 1.4.0 host")

    # The original archive still resides in .text. Its entry names and
    # metadata stay authoritative across builds with different added files.
    bundle = original[base_bundle_raw:text_end]
    web_start = read_u32(original, WEB_RESOURCE_ROW)
    web_end = web_start + 4 + read_u32(bundle, web_start)
    icon_start = align_up(web_end, 8)
    icon_end = icon_start + 4 + read_u32(bundle, icon_start)
    if not 0 < web_start < web_end <= icon_start < icon_end <= len(bundle):
        raise ValueError("Source has unexpected web or icon resource bounds")

    if section_count == 3:
        patch = PE_SECTION.unpack_from(original, section_header)
        patch_size, patch_raw_size = patch[1], patch[3]
        if patch != (
            b".pweb\0\0\0", patch_size, section_rva, align_up(patch_size, file_alignment),
            section_raw, 0, 0, 0, 0, INITIALIZED_READ_ONLY,
        ) or patch_size <= web_start:
            raise ValueError("Source has an unexpected patched section layout")
        if len(original) != section_raw + patch_raw_size:
            raise ValueError("Patched source has trailing data or a truncated section")
        if (
            struct.unpack_from("<II", original, clr_resources) != (section_rva, patch_size)
            or read_u32(original, optional + PE_SIZE_OF_INITIALIZED_DATA) != native_size + patch_raw_size
            or read_u32(original, optional + PE_SIZE_OF_IMAGE) != align_up(section_rva + patch_size, section_alignment)
        ):
            raise ValueError("Source has inconsistent patched PE resource sizes")
        patched_bundle = original[section_raw : section_raw + patch_size]
        patched_web_end = web_start + 4 + read_u32(patched_bundle, web_start)
        patched_icon = read_u32(original, ICON_RESOURCE_ROW)
        if (
            patched_icon != align_up(patched_web_end, 8)
            or patched_bundle[:web_start] != bundle[:web_start]
            or patched_bundle[patched_icon:] != bundle[icon_start:icon_end]
        ):
            raise ValueError("Source has unexpected patched web or managed resource bounds")

    archive = rebuild_archive(bundle[web_start + 4 : web_end], web_dir)
    # One contiguous CLR resource directory must cover all embedded resources.
    # Rebuild the final section without moving the code or Win32 resources.
    rebuilt_bundle = bytearray(bundle[:web_start])
    rebuilt_bundle.extend(struct.pack("<I", len(archive)))
    rebuilt_bundle.extend(archive)
    new_icon_start = align_up(len(rebuilt_bundle), 8)
    rebuilt_bundle.extend(bytes(new_icon_start - len(rebuilt_bundle)))
    rebuilt_bundle.extend(bundle[icon_start:icon_end])

    section_size = align_up(len(rebuilt_bundle), file_alignment)
    result = bytearray(original[:section_raw])
    result.extend(rebuilt_bundle)
    result.extend(bytes(section_size - len(rebuilt_bundle)))

    struct.pack_into("<H", result, coff + 2, 3)
    PE_SECTION.pack_into(
        result, section_header, b".pweb", len(rebuilt_bundle), section_rva,
        section_size, section_raw, 0, 0, 0, 0, INITIALIZED_READ_ONLY,
    )
    struct.pack_into("<I", result, optional + PE_SIZE_OF_INITIALIZED_DATA, native_size + section_size)
    image_size = align_up(section_rva + len(rebuilt_bundle), section_alignment)
    struct.pack_into("<I", result, optional + PE_SIZE_OF_IMAGE, image_size)
    struct.pack_into("<II", result, clr_resources, section_rva, len(rebuilt_bundle))
    struct.pack_into("<I", result, ICON_RESOURCE_ROW, new_icon_start)

    if (
        result[native_raw : native_raw + native_size] != original[native_raw : native_raw + native_size]
        or result[section_raw : section_raw + web_start] != bundle[:web_start]
        or result[section_raw + new_icon_start : section_raw + len(rebuilt_bundle)] != bundle[icon_start:icon_end]
    ):
        raise ValueError("Packaging changed a preserved native or managed resource")
    return result


def write_atomically(destination, data):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=destination.parent, prefix=f".{destination.name}.", suffix=".tmp", delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(data)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, destination)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="original or previously repackaged x64 Pulse 1.4.0 executable")
    parser.add_argument("--web-dir", type=Path, required=True, help="complete web directory, including the original bundle paths")
    parser.add_argument("--output", type=Path, required=True, help="path for the rebuilt executable")
    parser.add_argument("--preserve-host", action="store_true",
                        help="repackage only the web resources for comparison with the unmodified host")
    arguments = parser.parse_args()
    source = arguments.source
    output = arguments.output
    try:
        if source.resolve() == output.resolve() or (output.exists() and source.samefile(output)):
            raise ValueError("Source and output must be different files")
        executable = rebuild_executable(source.read_bytes(), arguments.web_dir)
        build_id = None
        if not arguments.preserve_host:
            executable, build_id = repair_executable(executable)
        write_atomically(output, executable)
    except (OSError, ValueError, RuntimeError, struct.error, zipfile.BadZipFile) as error:
        parser.exit(1, f"{parser.prog}: {error}\n")
    print(f"Built {output.resolve()} ({len(executable):,} bytes)")
    if build_id:
        print(f"Build {build_id}. SHA-256: {hashlib.sha256(executable).hexdigest()}")


if __name__ == "__main__":
    main()
