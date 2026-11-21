"""Package the exact tested release, build inputs, or source distribution."""

import argparse
import hashlib
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STAMP = (2026, 11, 21, 0, 0, 0)
RELEASE = ('Pulse.exe', 'Pulse-Cleanup.exe')


def build_inputs():
    inputs = {'build.py', 'Build.ps1', 'baseline/Pulse.exe', 'baseline/Pulse-Update-2.exe',
              'release/SHA256SUMS.txt', *(f'release/{name}' for name in RELEASE)}
    for directory, extensions in (
        ('web', None), ('host', {'.cs', '.py'}), ('cleanup', {'.cs', '.ps1', '.manifest'}),
        ('tests', {'.mjs', '.cjs', '.ps1', '.cs', '.py', '.md'}),
    ):
        for file in (ROOT / directory).rglob('*'):
            if file.is_file() and (extensions is None or file.suffix in extensions):
                inputs.add(file.relative_to(ROOT).as_posix())
    return inputs


def package(kind, output):
    sums = {}
    for line in (ROOT / 'release/SHA256SUMS.txt').read_text().splitlines():
        digest, name = line.split('  ', 1)
        sums[name] = digest
    if set(sums) != set(RELEASE):
        raise ValueError('Release manifest must cover the two executable files.')
    for name, expected in sums.items():
        if hashlib.sha256((ROOT / 'release' / name).read_bytes()).hexdigest() != expected.lower():
            raise ValueError(f'SHA-256 mismatch for {name}')

    if kind == 'release':
        entries = {name: (ROOT / 'release' / name).read_bytes() for name in (*RELEASE, 'SHA256SUMS.txt')}
        guide = (ROOT / 'README.md').read_text(encoding='utf-8-sig').split('\n## Сборка\n', 1)[0]
        entries['README.txt'] = guide.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8-sig')
    else:
        paths = build_inputs()
        if kind == 'source':
            paths.update(('README.md', '.gitattributes'))
            for pattern in ('ci/*', 'ci/pair-action/*.cjs', 'ci/pair-action/*.mjs', 'ci/pair-action/*.json', 'ci/pair-action/*.yml',
                            '.github/workflows/*.yml', 'evidence/*.md', 'evidence/*.json'):
                paths.update(p.relative_to(ROOT).as_posix() for p in ROOT.glob(pattern) if p.is_file())
        entries = {name: (ROOT / name).read_bytes() for name in paths}
        if kind == 'source':
            for report in (ROOT / 'evidence').glob('*.md'):
                links = re.findall(r'\]\(\.\./(test-runs/[^)]+)\)', report.read_text(encoding='utf-8-sig'))
                for link in links:
                    path = (ROOT / link).resolve()
                    if not path.is_relative_to(ROOT / 'test-runs') or path.suffix not in ('.json', '.txt'):
                        raise ValueError('Unexpected linked evidence path.')
                    if path.is_file() and link not in entries:
                        data = path.read_bytes()
                        if path.suffix == '.txt':
                            trace = data.decode('utf-8-sig').replace(str(path.parent), '<synthetic fixture>')
                            data = trace.encode('utf-8')
                        entries[link] = data

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w') as archive:
        for name in sorted(entries):
            record = zipfile.ZipInfo(name, STAMP)
            record.create_system = 3
            record.external_attr = 0o100644 << 16
            archive.writestr(record, entries[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    with zipfile.ZipFile(output) as archive:
        if set(archive.namelist()) != set(entries) or any(archive.read(k) != v for k, v in entries.items()):
            raise ValueError('Archive verification failed.')
    print(f'{hashlib.sha256(output.read_bytes()).hexdigest().upper()}  {output.name}  ({len(entries)} files)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=('release', 'runner', 'source'))
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    package(args.kind, args.output)
