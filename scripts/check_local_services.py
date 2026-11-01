"""Read-only checks; never initialize, restart, or clear shared local services."""
import subprocess
import sys


def check():
    subprocess.run([
        'mongosh', 'mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=3000',
        '--quiet', '--eval',
        'const h=db.hello(); if(h.setName!=="rs0" || !h.isWritablePrimary) quit(1);',
    ], check=True, timeout=10, stdout=subprocess.DEVNULL)
    result = subprocess.run(['redis-cli', '-h', '127.0.0.1', '-p', '6379', 'ping'],
                            check=True, timeout=5, capture_output=True, text=True)
    if result.stdout.strip() != 'PONG':
        raise RuntimeError('Redis did not return PONG')


if __name__ == '__main__':
    try:
        check()
    except (OSError, subprocess.SubprocessError, RuntimeError) as error:
        sys.exit(f'本机数据库未就绪：需要 127.0.0.1:27017 的 rs0 可写主节点和 6379 Redis。未启动 Docker，也未修改已有服务。\n{error}')
