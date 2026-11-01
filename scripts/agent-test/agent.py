#!/usr/bin/env python3
"""Owned local sandbox; never adopts existing Mongo/Redis or restarts services."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
LABEL = "yuanhub.agent.instance"


class Refused(RuntimeError):
    pass


def run(args, *, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True)
    if result.returncode:
        raise Refused(f"{Path(args[0]).name} 操作失败；检查 Docker/工具是否可用（输出已隐藏以保护凭据）")
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


def inspect_owned(data, role):
    container = data["containers"][role]
    details = json.loads(run(["docker", "inspect", container]))[0]
    labels = details["Config"].get("Labels") or {}
    if details["Id"] != container or labels.get(LABEL) != data["instance"] or labels.get("yuanhub.agent.role") != role:
        raise Refused("Docker 容器归属不匹配；拒绝连接或删除")
    if not details["State"]["Running"] or details["HostConfig"]["NetworkMode"] == "host":
        raise Refused("专属容器未运行或网络不安全；不要接入现有数据库")
    if any(m["Type"] != "tmpfs" for m in details.get("Mounts", [])):
        raise Refused("专属容器不得挂载已有数据 volume/bind")
    port = "27017/tcp" if role == "mongo" else "6379/tcp"
    bindings = details["NetworkSettings"]["Ports"]
    actual = bindings.get(port)
    expected_port = data["ports"].get(role)
    if not actual or len(actual) != 1 or actual[0]["HostIp"] != "127.0.0.1" or (
        expected_port is not None and actual[0]["HostPort"] != str(expected_port)
    ) or any(v for k, v in bindings.items() if k != port):
        raise Refused("数据库发布地址与专属 loopback 端口不符")
    return container


def verify(data):
    no_tunnel()
    if not data.get("properties") or set(data["containers"]) != {"mongo", "redis"}:
        raise Refused("setup 尚未完成；运行 cleanup --yes 清理本次专属容器后重新 setup")
    for role in ("mongo", "redis"):
        inspect_owned(data, role)


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
        "spring.data.redis.url": f"redis://127.0.0.1:{data['ports']['redis']}/0",
        "debug.email.no-send": "true", "share.jwt.secret": secrets.token_urlsafe(48),
        "share.jwt.expire": "10",
        "share.beta.local-test-mode": "true", "share.beta.campaign-id": f"yuanhub-beta-local-agent-{instance}",
        "share.info.product-version": f"agent-{instance}",
        "share.info.public-base-url": "http://127.0.0.1:8080",
        "share.cors.allowed-origin-patterns": "http://127.0.0.1:5173",
        "share.avatar.dir": str(directory / "avatar"), "share.media.dir": str(directory / "media"),
        "share.media.private-dir": str(directory / "private-media"),
        "share.star-capture.dir": str(directory / "captures"), "logging.file.name": str(directory / "backend.log"),
    }


def setup(path, namespace):
    # shortcut: same-namespace setup/init/reset are serial; add a lock if parallel writers are needed.
    no_tunnel()
    if path.exists():
        verify(load(path))
        print("专属容器与配置已存在，未新增或覆盖数据。")
        return
    run(["docker", "info", "--format", "{{.ServerVersion}}"])
    private_dir(path.parent.parent)
    private_dir(path.parent)
    instance = uuid.uuid4().hex
    data = {"instance": instance, "containers": {}, "ports": {}, "users": {}}
    # Persist each owned container so a failed setup remains safely cleanable.
    save(path, data)
    for role, image, port, command, mounts in (
        ("mongo", "mongo:7.0", 27017, ["mongod", "--replSet", "rs0", "--bind_ip_all"], ["/data/db", "/data/configdb"]),
        ("redis", "redis:7.2-alpine", 6379, ["redis-server", "--save", "", "--appendonly", "no"], ["/data"]),
    ):
        args = ["docker", "run", "-d", "--rm", "--label", f"{LABEL}={instance}", "--label", f"yuanhub.agent.role={role}",
                "--publish", f"127.0.0.1::{port}"]
        for mount in mounts:
            args += ["--tmpfs", mount]
        container = run(args + [image] + command)
        data["containers"][role] = container
        save(path, data)
        binding = json.loads(run(["docker", "inspect", container]))[0]["NetworkSettings"]["Ports"][f"{port}/tcp"][0]
        data["ports"][role] = int(binding["HostPort"])
        save(path, data)
    mongo = data["containers"]["mongo"]
    for attempt in range(40):
        try:
            run(["docker", "exec", mongo, "mongosh", "--quiet", "--eval", "db.adminCommand({ping:1})"])
            break
        except Refused:
            if attempt == 39:
                raise
            time.sleep(0.5)
    run(["docker", "exec", mongo, "mongosh", "--quiet", "--eval",
         "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"])
    for attempt in range(40):
        try:
            run(["docker", "exec", mongo, "mongosh", "--quiet", "--eval",
                 "if (!db.hello().isWritablePrimary) quit(1)"])
            break
        except Refused:
            if attempt == 39:
                raise
            time.sleep(0.5)
    for suffix in ("maa", "hub"):
        run(["docker", "exec", mongo, "mongosh", "--quiet", "--eval",
             f"db.getSiblingDB('yuanhub_agent_{instance}_{suffix}').agent_test_ownership.insertOne({{_id:'{instance}'}})"])
    run(["docker", "exec", data["containers"]["redis"], "redis-cli", "SET", "agent-test:ownership", instance])
    for role in ("user", "admin"):
        data["users"][role] = {"email": f"agent-{role}-{namespace}@example.test", "name": f"agent-{role}-{namespace}",
                               "password": secrets.token_urlsafe(24)}
    data["properties"] = properties(data, path.parent)
    save(path, data)
    verify(data)
    print("专属 Mongo replica set / Redis 已准备；随机凭据仅保存在受保护 manifest。下一步：start")


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
    for role in data["containers"]:
        inspect_owned(data, role)
    for container in data["containers"].values():
        run(["docker", "rm", "-f", container])
    # Credentials/state live only here. No database drops, external volumes or shared data.
    import shutil
    shutil.rmtree(path.parent)
    print("仅本实例容器、凭据与浏览器状态已清理。")


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
        print(f"拒绝执行：{error if isinstance(error, Refused) else '依赖/配置/服务不可用；检查 Docker、setup 和 start（现有服务不会重启）'}", file=sys.stderr)
        sys.exit(1)
