"""Private application ports and shared local databases for the current Git worktree."""
import hashlib
import fcntl
import json
import os
from pathlib import Path
import secrets
import shlex
import socket
import subprocess


def configuration(root):
    root = root.resolve()
    state = root / '.dev'
    state.mkdir(mode=0o700, exist_ok=True)
    with (state / 'instance.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return create_configuration(root, state / 'instance.json')


def create_configuration(root, file):
    if file.exists():
        data = json.loads(file.read_text())
        if data['root'] != str(root):
            raise ValueError('Worktree moved: keep the old data and generate a new .dev/instance.json explicitly')
        return data
    sockets = []
    try:
        for _ in range(2):
            sock = socket.socket()
            sock.bind(('127.0.0.1', 0))
            sockets.append(sock)
        data = dict(root=str(root), project='yuanhub-' + hashlib.sha256(str(root).encode()).hexdigest()[:12],
                    ports=dict(zip(('frontend','backend'), [s.getsockname()[1] for s in sockets])),
                    jwt=secrets.token_urlsafe(48))
        with file.open('x') as stream:
            os.chmod(file, 0o600)
            json.dump(data, stream)
        return data
    finally:
        for sock in sockets:
            sock.close()


def exports(data):
    root = Path(data['root'])
    ports = data['ports']
    mongo = "mongodb://127.0.0.1:27017"
    query = '?directConnection=true'
    return {
        'YUANHUB_FRONTEND_PORT': str(ports['frontend']),
        'SERVER_PORT': str(ports['backend']),
        'MANAGEMENT_SERVER_PORT': str(ports['backend']),
        'SERVER_ADDRESS': '127.0.0.1',
        'YUANHUB_MONGO_PORT': '27017',
        'YUANHUB_REDIS_PORT': '6379',
        'YUANHUB_DEV_API_TARGET': f"http://127.0.0.1:{ports['backend']}",
        'SPRING_PROFILES_ACTIVE': 'local',
        'SPRING_DATA_MONGODB_URI': mongo + '/MaaBackend' + query,
        'SHARE_MONGO_HUB_URI': mongo + '/HubBackend' + query,
        'SPRING_DATA_REDIS_HOST': '127.0.0.1',
        'SPRING_DATA_REDIS_PORT': '6379',
        'SHARE_PUBLIC_BASE_URL': f"http://127.0.0.1:{ports['backend']}",
        'SHARE_CORS_ALLOWED_ORIGIN_PATTERNS': f"http://127.0.0.1:{ports['frontend']},http://localhost:{ports['frontend']}",
        'SHARE_JWT_SECRET': data['jwt'],
        'SHARE_AVATAR_DIR': str(root / 'backend/data/avatar'),
        'SHARE_MEDIA_DIR': str(root / '.dev/media'),
        'SHARE_PRIVATE_MEDIA_DIR': str(root / '.dev/private-media'),
        'SHARE_STAR_CAPTURE_DIR': str(root / '.dev/star-captures'),
        'DEBUG_EMAIL_NO_SEND': 'true',
        'VITE_API_BASE': '',
    }


if __name__ == '__main__':
    root = Path(subprocess.check_output(['git','rev-parse','--show-toplevel'], text=True).strip())
    os.umask(0o077)
    for key, value in exports(configuration(root)).items():
        print('export ' + key + '=' + shlex.quote(value))
