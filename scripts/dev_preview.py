"""Orca-owned preview: one launcher per tree, frontend listens on all interfaces."""
import fcntl
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

from worktree_env import configuration

ROOT = Path(__file__).resolve().parents[1]


def check_ports(ports):
    for index, port in enumerate(ports):
        with socket.socket() as sock:
            try:
                sock.bind(('0.0.0.0' if index == 0 else '127.0.0.1', port))
            except OSError as error:
                raise RuntimeError(f'端口 {port} 已占用；请复用已有服务，不会终止占用者。') from error


def ready(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def main():
    os.umask(0o077)
    data = configuration(ROOT)
    front, back = data['ports']['frontend'], data['ports']['backend']
    with (ROOT / '.dev/preview.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('本工作树的开发预览已在运行；请查看已有「开发预览」终端。', flush=True)
            return
        check_ports([front, back])
        children = []

        def start(command, **kwargs):
            child = subprocess.Popen(command, cwd=ROOT, start_new_session=True, **kwargs)
            children.append(child)
            return child

        def interrupted(signum, frame):
            raise KeyboardInterrupt

        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, interrupted)
        try:
            if not (ROOT / 'frontend/node_modules').is_dir():
                print('正在为本工作树安装前端依赖…', flush=True)
                installer = start(['npm', 'ci', '--prefix', str(ROOT / 'frontend'),
                                   '--cache', str(ROOT / '.dev/npm-cache'), '--no-audit', '--no-fund'])
                if installer.wait() != 0:
                    raise RuntimeError('前端依赖安装失败。')
            frontend = start(['bash', './dev.sh', 'frontend'])
            deadline = time.monotonic() + 30
            while not ready(f'http://127.0.0.1:{front}'):
                if frontend.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('前端未就绪，请查看上方日志。')
                time.sleep(1)
            print(f'\n前端已就绪（后端准备中）：http://<本机 Tailscale IPv4>:{front}/inventory\n', flush=True)
            backend_env = dict(os.environ, GRADLE_USER_HOME=str(ROOT / '.gradle-user-home'))
            backend = start(['bash', './dev.sh', 'backend'], env=backend_env)
            backend_ready = False
            backend_failed = False
            while frontend.poll() is None:
                if not backend_failed and backend.poll() is not None:
                    backend_failed = True
                    print('后端启动失败，前端预览保留；登录和保存不可用。修复上方错误后可在本树运行 ./dev.sh backend。', flush=True)
                if not backend_ready and not backend_failed and ready(f'http://127.0.0.1:{back}/ready'):
                    backend_ready = True
                    print(f'\n前后端均已就绪：http://<本机 Tailscale IPv4>:{front}/inventory\n', flush=True)
                time.sleep(2)
            raise RuntimeError('前端已退出，请查看上方日志。')
        finally:
            for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                signal.signal(sig, signal.SIG_IGN)
            running = [child for child in children if child.poll() is None]
            for child in running:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            for child in running:
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    child.wait()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('预览已停止；本机 MongoDB / Redis 及其数据保持不变。')
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
