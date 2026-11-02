#!/usr/bin/env python3
"""Owned synthetic data on shared local Mongo/Redis; never restarts services."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
MONGO = "mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=3000"


class Refused(RuntimeError):
    pass


def run(args, *, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True)
    if result.returncode:
        raise Refused(f"{Path(args[0]).name} 操作失败；检查本机服务/工具是否可用（输出已隐藏以保护凭据）")
    return result.stdout.strip()


def no_tunnel():
    processes = run(["ps", "-axo", "comm="]).splitlines()
    if any(Path(p.strip()).name == "cloudflared" for p in processes):
        raise Refused("发现 cloudflared；Agent 环境禁止与 tunnel 同时使用，请先自行停止 tunnel")


def private_dir(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)


def save(path, value):
    temporary = path.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, indent=2)
    temporary.chmod(0o600)
    temporary.replace(path)


def load(path):
    if not path.is_file() or path.stat().st_mode & 0o777 != 0o600:
        raise Refused("缺少 0600 manifest；先运行 setup，勿使用已有开发数据库")
    if path.parent.stat().st_mode & 0o777 != 0o700:
        raise Refused("Agent 配置目录必须为 0700")
    return json.loads(path.read_text())


def mongo(script):
    return run(["mongosh", MONGO, "--quiet", "--eval", script])


def redis(*args):
    return run(["redis-cli", "-h", "127.0.0.1", "-p", "6379", "-n", "15", "-t", "3", "--raw", *args])


def check_manifest(data):
    instance = data.get("instance", "")
    if not re.fullmatch(r"[a-f0-9]{32}", instance) or data.get("ports") != {"mongo": 27017, "redis": 6379} or data.get("containers"):
        raise Refused("需要共享本机服务的新 manifest；旧容器配置不自动迁移或删除")
    expected = properties(data, Path(data["properties"]["share.agent-test.manifest"]).parent)
    for key in ("spring.data.mongodb.uri", "share.mongo.hub-uri", "spring.data.redis.url"):
        if data["properties"].get(key) != expected[key]:
            raise Refused("测试连接必须使用本实例随机库和本机 Redis DB 15")
    states = data.get("resources")
    if states is not None and (not isinstance(states, dict) or set(states) != {"maa", "hub", "redis"} or
                               any(state not in {"creating", "ready", "deleting", "deleted"} for state in states.values())):
        raise Refused("manifest 资源状态无效")
    return instance


def verify(data):
    no_tunnel()
    instance = check_manifest(data)
    if any(data.get("resources", {}).get(name, "ready") != "ready" for name in ("maa", "hub", "redis")):
        raise Refused("测试资源未完整准备；请 cleanup --yes 后重新 setup")
    for suffix in ("maa", "hub"):
        mongo(f"if (!db.getSiblingDB('yuanhub_agent_{instance}_{suffix}').agent_test_ownership.findOne({{_id:'{instance}'}})) quit(1)")
    if redis("GET", f"yuanhub_agent:{instance}:agent-test:ownership") != instance:
        raise Refused("Redis 测试命名空间归属标记不匹配")


def properties(data, directory):
    instance = data["instance"]
    mongo = f"mongodb://127.0.0.1:{data['ports']['mongo']}/yuanhub_agent_{instance}"
    return {
        "share.agent-test.enabled": "true",
        "share.agent-test.manifest": str(directory / "manifest.json"),
        "server.address": "127.0.0.1", "server.port": "8080", "management.server.port": "8080",
        "server.forward-headers-strategy": "none",
        "spring.data.mongodb.uri": mongo + "_maa?replicaSet=rs0&directConnection=true",
        "share.mongo.hub-uri": mongo + "_hub?replicaSet=rs0&directConnection=true",
        "spring.data.redis.url": f"redis://127.0.0.1:{data['ports']['redis']}/15",
        "debug.email.no-send": "true", "share.jwt.secret": secrets.token_urlsafe(48),
        "share.jwt.expire": "10",
        "share.beta.local-test-mode": "true", "share.beta.campaign-id": f"yuanhub-beta-local-agent-{instance}",
        "share.info.product-version": f"agent-{instance}",
        "share.info.public-base-url": "http://127.0.0.1:8080",
        "share.cors.allowed-origin-patterns": "http://127.0.0.1:5173",
        "share.avatar.dir": str(directory / "avatar"), "share.media.dir": str(directory / "media"),
        "share.media.private-dir": str(directory / "private-media"),
        "logging.file.name": str(directory / "backend.log"),
    }


def setup(path, namespace):
    # shortcut: same-namespace setup/init/reset are serial; add a lock if parallel writers are needed.
    no_tunnel()
    if path.exists():
        verify(load(path))
        print("专属测试数据与配置已存在，未新增或覆盖数据。")
        return
    run(["python3", str(ROOT / "scripts/check_local_services.py")])
    private_dir(path.parent.parent)
    private_dir(path.parent)
    instance = uuid.uuid4().hex
    data = {"instance": instance, "ports": {"mongo": 27017, "redis": 6379}, "users": {},
            "resources": {name: "creating" for name in ("maa", "hub", "redis")}}
    data["properties"] = properties(data, path.parent)
    # Persist ownership before writes, so failed setup can be inspected safely.
    save(path, data)
    for suffix in ("maa", "hub"):
        mongo(f"db.getSiblingDB('yuanhub_agent_{instance}_{suffix}').agent_test_ownership.insertOne({{_id:'{instance}'}})")
        data["resources"][suffix] = "ready"
        save(path, data)
    if redis("SET", f"yuanhub_agent:{instance}:agent-test:ownership", instance, "NX") != "OK":
        raise Refused("Redis 测试命名空间已存在；拒绝覆盖")
    data["resources"]["redis"] = "ready"
    save(path, data)
    for role in ("user", "admin"):
        data["users"][role] = {"email": f"agent-{role}-{namespace}@example.test", "name": f"agent-{role}-{namespace}",
                               "password": secrets.token_urlsafe(24)}
    data["properties"] = properties(data, path.parent)
    save(path, data)
    verify(data)
    print("共享本机 Mongo/Redis 中的专属测试数据已准备；随机凭据仅保存在受保护 manifest。下一步：start")


def request(origin, route):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(origin + route, timeout=5) as response:
        if response.url != origin + route:
            raise Refused("禁止重定向到其他服务")
        return json.load(response)


def target(data, directory):
    verify(data)
    ready = load(directory / "ready.json")
    if ready.get("instance") != data["instance"]:
        raise Refused("后端未完成本实例的安全初始化；检查受保护 backend.log")
    for origin in ("http://127.0.0.1:8080", "http://127.0.0.1:5173"):
        if request(origin, "/version").get("data", {}).get("product_version") != f"agent-{data['instance']}":
            raise Refused("现有服务或前端代理不属于本 Agent 隔离实例；拒绝登录/写入")


def listening(port):
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) == 0


def validate_launch(config):
    path = Path(config["share.agent-test.manifest"]).resolve()
    if not path.is_relative_to((ROOT / ".agent-test").resolve()):
        raise Refused("Agent manifest 必须位于本工作树 .agent-test")
    data = load(path)
    if config != data["properties"] or config.get("share.agent-test.enabled") != "true":
        raise Refused("启动参数必须与受保护 manifest 完全一致")
    verify(data)


def start(data, directory):
    verify(data)
    if listening(8080) or listening(5173):
        target(data, directory)
        print("已复用当前 Agent 隔离服务。")
        return
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(
        ("SPRING_", "SHARE_", "YUANHUB_", "VITE_", "SERVER_", "MANAGEMENT_", "LOGGING_", "DEBUG_", "__VITE_"))
        and k not in {"JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "JAVA_OPTS", "GRADLE_OPTS"}}
    env.update(SPRING_PROFILES_ACTIVE="local,agent-test", SPRING_APPLICATION_JSON=json.dumps(data["properties"]),
               YUANHUB_AGENT_TEST="true", YUANHUB_DEV_API_TARGET="http://127.0.0.1:8080")
    (directory / "ready.json").unlink(missing_ok=True)
    os.chdir(ROOT)
    os.execve(ROOT / "dev.sh", [str(ROOT / "dev.sh")], env)


def cleanup(data, path):
    no_tunnel()
    if listening(8080) or listening(5173):
        raise Refused("清理前请自行停止开发服务；工具不会终止现有进程")
    instance = check_manifest(data)
    states = data.setdefault("resources", {name: "ready" for name in ("maa", "hub", "redis")})
    # A missing marker is safe only after this instance recorded creation or deletion in progress.
    for suffix in ("maa", "hub"):
        if states[suffix] == "deleted":
            continue
        marker = mongo(f"db.getSiblingDB('yuanhub_agent_{instance}_{suffix}').agent_test_ownership.findOne({{_id:'{instance}'}}) ? 'owned' : 'absent'")
        if marker != "owned" and (marker != "absent" or states[suffix] == "ready"):
            raise Refused("Mongo 测试库归属标记不匹配")
    owner_key = f"yuanhub_agent:{instance}:agent-test:ownership"
    redis_owned = False
    if states["redis"] != "deleted":
        marker = redis("GET", owner_key)
        if marker != instance and (marker or states["redis"] == "ready"):
            raise Refused("Redis 测试命名空间归属标记不匹配")
        redis_owned = marker == instance
    for suffix in ("maa", "hub"):
        if states[suffix] == "deleted":
            continue
        states[suffix] = "deleting"
        save(path, data)
        mongo(f"const d=db.getSiblingDB('yuanhub_agent_{instance}_{suffix}'); if (d.agent_test_ownership.findOne({{_id:'{instance}'}})) d.dropDatabase()")
        states[suffix] = "deleted"
        save(path, data)
    prefix = f"yuanhub_agent:{instance}:"
    if states["redis"] != "deleted":
        states["redis"] = "deleting"
        save(path, data)
        if redis_owned:
            keys = redis("--scan", "--pattern", prefix + "*").splitlines()
            if any(not key.startswith(prefix) for key in keys):
                raise Refused("Redis 返回了命名空间外的键；拒绝删除")
            for key in keys:
                if key != owner_key:
                    redis("DEL", key)
            redis("DEL", owner_key)
        states["redis"] = "deleted"
        save(path, data)
    import shutil
    shutil.rmtree(path.parent)
    print("仅本实例测试数据库、Redis 键、凭据与浏览器状态已清理。")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["setup", "start", "init", "login", "check", "e2e", "reset", "cleanup", "cli"])
    parser.add_argument("role", choices=["user", "admin"], nargs="?", default="user")
    parser.add_argument("--namespace", default="default")
    parser.add_argument("--session", default="default")
    parser.add_argument("--yes", action="store_true", help="显式确认 reset/cleanup")
    args, cli_args = parser.parse_known_args()
    if cli_args and args.command != "cli":
        parser.error("未知参数")
    if not re.fullmatch(r"[a-z0-9-]{1,10}", args.namespace) or not re.fullmatch(r"[a-z0-9-]{1,24}", args.session):
        raise Refused("namespace 仅限 1–10 位小写字母/数字/-；session 最多 24 位")
    path = ROOT / ".agent-test" / args.namespace / "manifest.json"
    if args.command == "setup":
        setup(path, args.namespace)
        return
    data = load(path)
    if args.command == "start":
        start(data, path.parent)
    elif args.command == "cleanup":
        if not args.yes:
            raise Refused("cleanup 会删除此专属实例的合成数据与凭据；加 --yes 明确执行")
        cleanup(data, path)
    else:
        target(data, path.parent)
        if args.command == "reset" and not args.yes:
            raise Refused("reset 仅删除所选身份的 Agent 双游戏子账号；加 --yes 明确执行")
        env = dict(os.environ, AGENT_TEST_MANIFEST=str(path), AGENT_TEST_ROLE=args.role, AGENT_TEST_SESSION=args.session)
        result = subprocess.run(["node", str(Path(__file__).with_name("browser.mjs")), args.command, *cli_args], cwd=ROOT, env=env)
        if result.returncode:
            raise Refused("浏览器操作失败；按上述脱敏诊断修复后重试")


if __name__ == "__main__":
    try:
        main()
    except (Refused, OSError, ValueError, KeyError, urllib.error.URLError):
        # Never print exception payloads that might contain server responses or secrets.
        error = sys.exc_info()[1]
        print(f"拒绝执行：{error if isinstance(error, Refused) else '依赖/配置/服务不可用；检查本机服务、setup 和 start（现有服务不会重启）'}", file=sys.stderr)
        sys.exit(1)
