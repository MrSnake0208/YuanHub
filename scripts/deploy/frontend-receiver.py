"""Receive the runner archive on stdin, or activate an already prepared frontend."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile


def check_site(site):
    if not (site / 'index.html').is_file() or not any((site / 'assets').iterdir()):
        raise ValueError(f'Incomplete frontend: {site}')
    return hashlib.sha256((site / 'sw.js').read_bytes()).hexdigest()


def install(site, version, commit, api_base, digest):
    with tempfile.TemporaryDirectory(dir=site.parent, prefix='.incoming-') as incoming:
        archive = Path(incoming) / 'dist.tar.gz'
        received = hashlib.sha256()
        with archive.open('wb') as stream:
            for chunk in iter(lambda: sys.stdin.buffer.read(1024 * 1024), b''):
                stream.write(chunk)
                received.update(chunk)
        if received.hexdigest() != digest:
            raise ValueError('Frontend archive SHA-256 mismatch')
        stage = Path(incoming) / 'site'
        stage.mkdir(mode=0o755)
        with tarfile.open(archive, 'r:gz') as tar:
            for member in tar:
                path = Path(member.name)
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError(f'Invalid archive path: {path}')
                target = stage / path
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with tar.extractfile(member) as source, target.open('xb') as dest:
                        shutil.copyfileobj(source, dest)
                else:
                    raise ValueError(f'Unexpected archive entry: {path}')
        info = json.loads((stage / 'build-info.json').read_bytes())
        if info['frontendCommit'] != commit or info['productVersion'] != version:
            raise ValueError('Frontend build-info differs from the frozen candidate')
        meta = dict(version=version, tag='frontend/v' + version, commit=commit,
                    apiBase=api_base, swSha256=check_site(stage), archiveSha256=digest)
        (stage / 'deploy-meta.json').write_text(json.dumps(meta, separators=(',', ':')) + '\n')
        stage.rename(site)


def run():
    mode, directory, version, commit, api_base, *args = sys.argv[1:]
    root = Path(directory)
    if mode not in ('probe', 'prepare', 'release') or not root.is_absolute() or root == Path('/'):
        raise ValueError('Invalid deployment mode or root')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?', version) or not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Invalid release version or SHA')
    releases = root / 'releases'
    releases.mkdir(parents=True, exist_ok=True)
    site = releases / f'{version}-{commit}'
    legacy = releases / version
    current = root / 'current'
    if not site.exists() and (legacy / 'deploy-meta.json').is_file():
        old = json.loads((legacy / 'deploy-meta.json').read_bytes())
        if old.get('commit') == commit and old.get('version') == version:
            site = legacy

    if site.is_symlink():
        raise ValueError('Unexpected symlink at release directory')
    if site.exists():
        meta = json.loads((site / 'deploy-meta.json').read_bytes())
        sw = check_site(site)
        if (meta.get('commit') != commit or meta.get('version') != version or
                meta.get('apiBase', api_base if current.resolve() == site.resolve() else None) != api_base or
                meta.get('swSha256', sw if site == legacy else None) != sw):
            raise ValueError('Refusing to replace a mismatched frontend release')
        if mode == 'probe':
            print('ready')
    elif mode == 'probe':
        print('missing')
    elif mode == 'prepare':
        if current.is_symlink() and current.resolve() == site.resolve():
            raise ValueError('Refusing to install into the active release path')
        digest, = args
        install(site, version, commit, api_base, digest)
    else:
        raise ValueError('Prepared frontend missing; rerun --prepare')

    if mode == 'release':
        if os.path.lexists(current) and not current.is_symlink():
            raise ValueError('Refusing to replace non-symlink current')
        if current.is_symlink() and current.resolve() == site.resolve():
            return
        # Keep the previous symlink for the existing rollback procedure.
        switch = Path(tempfile.mkdtemp(prefix='.switch.', dir=root))
        if current.is_symlink():
            (switch / 'previous').symlink_to(os.readlink(current))
        (switch / 'current').symlink_to(site.relative_to(root))
        (switch / 'current').replace(current)


if __name__ == '__main__':
    os.umask(0o022)
    run()
