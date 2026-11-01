#!/usr/bin/env python3
"""Resolve queued portrait names through the public catalog, publish, then archive."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unicodedata
import urllib.request

sys.dont_write_bytecode = True
import normalize as n

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
IMAGE_EXTENSIONS = {".png", ".webp", ".jpg", ".jpeg"}


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


@contextmanager
def update_lock(path):
    with path.open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("另一个立绘更新任务正在运行") from None
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


@contextmanager
def working_directory(path):
    previous = Path.cwd()
    try:
        os.chdir(path)
        yield
    finally:
        os.chdir(previous)


def filename_key(value):
    text = unicodedata.normalize("NFKD", str(value).casefold()).replace("u\u0308", "v")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return "".join(c for c in text if c.isalnum())


def source_name(path):
    stem = unicodedata.normalize("NFKC", path.stem).strip()
    stem = re.sub(r"^\d+px[-_\s]*", "", stem, flags=re.I)
    stem = re.sub(r"^hero[-_\s]+", "", stem, flags=re.I)
    return re.sub(r"[-_\s]*(?:立绘|全身图|全身|半身图|半身)$", "", stem).strip()


def catalog_rows(document):
    if not isinstance(document, dict):
        raise ValueError("目录必须为公共接口 JSON 对象")
    if "status_code" in document:
        if document["status_code"] != 200:
            raise ValueError("公共目录接口返回失败状态")
        document = document.get("data")
    rows = document.get("operators") if isinstance(document, dict) else None
    if not isinstance(rows, list) or not rows:
        raise ValueError("公共目录没有 operators 列表；不使用旧库存目录猜测 ID")
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("公共目录项必须是对象")
        key = row.get("id", "")
        if not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z0-9_-]+", key):
            raise ValueError("公共目录包含无效 ID")
        if key in seen or not isinstance(row.get("name"), str) or not row["name"].strip():
            raise ValueError("公共目录有重复 ID 或空名称")
        seen.add(key)
    return rows


class Catalog:
    def __init__(self, document):
        self.rows = {r["id"]: r for r in catalog_rows(document)}
        self.exact, self.aliases = {}, {}
        for key, row in self.rows.items():
            self.exact.setdefault(filename_key(row["name"]), set()).add(key)
            values = [key]
            match = re.fullmatch(r"char_\d+_(.+)", key)
            if match:
                values.append(match[1])
            aliases = row.get("alias", "")
            if isinstance(aliases, str):
                values.extend(re.findall(r"[\w·]+", aliases, flags=re.UNICODE))
            elif isinstance(aliases, list):
                values.extend(a for a in aliases if isinstance(a, str))
            for value in values:
                self.aliases.setdefault(filename_key(value), set()).add(key)

    def resolve(self, path, override):
        explicit = override.get("operator_id")
        if explicit is not None:
            if explicit not in self.rows:
                raise ValueError(f"sidecar operator_id 不在当前公共目录中：{explicit}")
            return self.rows[explicit]
        value = source_name(path)
        if value in self.rows:
            return self.rows[value]
        if re.fullmatch(r"char_\d+_.+", value):
            raise ValueError(f"文件中的完整 ID 已不存在：{value}；请核对名称或当前 ID")
        key = filename_key(value)
        matches = self.exact.get(key) or self.aliases.get(key, set())
        if len(matches) != 1:
            detail = "、".join(f"{self.rows[k]['name']} ({k})" for k in sorted(matches))
            raise ValueError(f"名称有歧义：{detail}" if matches else f"公共目录中未找到：{value}")
        return self.rows[next(iter(matches))]


def api_url(settings, explicit=None):
    if explicit or settings.get("catalog_url"):
        return explicit or settings["catalog_url"]
    # Read only VITE_API_BASE, never execute dotenv or load authentication secrets.
    base = ""
    for filename in (".env", ".env.local", ".env.development", ".env.development.local"):
        path = REPO/filename
        if path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                match = re.match(r"^\s*(?:export\s+)?VITE_API_BASE\s*=\s*(.*?)\s*$", line)
                if match:
                    base = match[1].strip().strip("\"'")
    base = os.environ.get("VITE_API_BASE", base).strip()
    if not base or "$" in base:
        raise ValueError("请配置 VITE_API_BASE 或传入 --catalog-url / --catalog-json")
    return base.rstrip("/") + "/v1/operator/catalog"


def load_catalog(settings, args):
    if args.catalog_json:
        return n.read_json(args.catalog_json), "provided_public_catalog_json"
    url = api_url(settings, args.catalog_url)
    if not url.startswith(("https://", "http://")):
        raise ValueError("catalog_url 必须是 HTTP(S) 公共目录地址")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler(
        None if settings["use_environment_proxy"] else {}))
    with opener.open(url, timeout=settings["catalog_timeout_seconds"]) as response:
        document = json.load(response)
    catalog_rows(document)
    return document, url


def queue(source, catalog):
    jobs, issues = [], []
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            issues.append({"source": path.relative_to(source).as_posix(), "error": "不处理符号链接"})
            continue
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            if path.name.endswith(".json") and path.with_suffix("").suffix.lower() in IMAGE_EXTENSIONS and path.with_suffix("").is_file():
                continue
            issues.append({"source": path.relative_to(source).as_posix(), "error": "不支持的文件或没有配套原图的 sidecar"})
            continue
        relative = path.relative_to(source).as_posix()
        sidecar = path.with_name(path.name + ".json")
        try:
            if sidecar.is_symlink():
                raise ValueError("sidecar 不能是符号链接")
            override = n.read_json(sidecar) if sidecar.exists() else {}
            if not isinstance(override, dict):
                raise ValueError("sidecar 必须是 JSON 对象")
            row = catalog.resolve(path, override)
            jobs.append({"source": relative, "id": row["id"], "name": row["name"],
                         "override": override, "source_sha256": n.sha256(path),
                         "sidecar_sha256": n.sha256(sidecar) if sidecar.exists() else None})
        except (ValueError, OSError, TypeError) as exc:
            issues.append({"source": relative, "error": str(exc)})
    duplicates = {j["id"] for j in jobs if sum(x["id"] == j["id"] for x in jobs) > 1}
    for job in jobs:
        if job["id"] in duplicates:
            issues.append({"source": job["source"], "error": f"多个文件对应 {job['id']}，请只保留一个"})
    return [j for j in jobs if j["id"] not in duplicates], issues


def unchanged(source, job):
    path = source/job["source"]
    sidecar = path.with_name(path.name + ".json")
    return (path.is_file() and not path.is_symlink() and n.sha256(path) == job["source_sha256"] and
            not sidecar.is_symlink() and
            (n.sha256(sidecar) if sidecar.exists() else None) == job["sidecar_sha256"])


def bytes_or_none(path):
    return path.read_bytes() if path.exists() else None


def publish(source, output, index_path, metadata_path, public_prefix, archive, staged, jobs, records):
    """Back up and publish the successful set; remove originals only after commit."""
    index_before, metadata_before = bytes_or_none(index_path), bytes_or_none(metadata_path)
    index = json.loads(index_before) if index_before else {}
    metadata = json.loads(metadata_before) if metadata_before else {}
    if not isinstance(index, dict) or not isinstance(metadata, dict):
        raise ValueError("立绘索引和 metadata 必须是 JSON 对象")
    backups, published, retained = {}, [], []
    for job in jobs:
        if not unchanged(source, job):
            raise ValueError(f"处理期间输入已变化，未发布：{job['source']}")
        relative, filename = job["source"], job["id"] + ".webp"
        archived = archive/"originals"/relative
        archived.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source/relative, archived)
        if n.sha256(archived) != job["source_sha256"]:
            raise ValueError("归档原图校验失败")
        if job["sidecar_sha256"]:
            shutil.copy2(source/(relative + ".json"), Path(str(archived) + ".json"))
            if n.sha256(Path(str(archived) + ".json")) != job["sidecar_sha256"]:
                raise ValueError("归档 sidecar 校验失败")
        destination = output/filename
        if destination.is_symlink():
            raise ValueError(f"目标文件不能是符号链接：{filename}")
        backups[destination] = bytes_or_none(destination)
        if backups[destination] is not None:
            atomic_write(archive/"previous"/filename, backups[destination])
        record = {**records[filename], "operator_id": job["id"], "operator_name": job["name"],
                  "archive": (Path(archive.name)/"originals"/relative).as_posix()}
        metadata[filename] = record
        index[job["id"]] = public_prefix.rstrip("/") + "/" + filename
    backups[index_path], backups[metadata_path] = index_before, metadata_before
    for filename, content in (("portrait-index.json", index_before), ("metadata.json", metadata_before)):
        if content is not None:
            atomic_write(archive/"previous"/filename, content)
    if any(bytes_or_none(path) != content for path, content in backups.items()):
        raise ValueError("目标文件或索引被其他进程修改，未发布本批次")
    if any(not unchanged(source, job) for job in jobs):
        raise ValueError("处理期间输入已变化，未发布本批次")
    try:
        for job in jobs:
            filename = job["id"] + ".webp"
            path = staged/"images"/filename
            if n.sha256(path) != records[filename]["output_sha256"]:
                raise ValueError("待发布 WebP 校验失败")
            published.append(output/filename)
            atomic_write(output/filename, path.read_bytes())
        for path, content in ((index_path, json_bytes(dict(sorted(index.items())))),
                              (metadata_path, json_bytes(dict(sorted(metadata.items()))))):
            published.append(path)
            atomic_write(path, content)
    except Exception:
        for path in reversed(published):
            if backups[path] is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, backups[path])
        raise
    # An interruption here leaves a recoverable duplicate, never an unarchived original.
    for job in jobs:
        if unchanged(source, job):
            try:
                (source/job["source"]).unlink()
                if job["sidecar_sha256"]:
                    (source/(job["source"] + ".json")).unlink()
            except OSError:
                retained.append(job["source"])
        else:
            retained.append(job["source"])
    return retained


def run(args):
    config = n.read_json(args.config)
    base = args.config.resolve().parent
    settings = config["update"]
    paths = {key: (base/settings[key]).resolve() for key in
             ("source_dir", "archive_dir", "output_dir", "portrait_index", "metadata_path")}
    source, archive_root, output = [paths[k] for k in ("source_dir", "archive_dir", "output_dir")]
    for a, b in ((source, archive_root), (source, output), (archive_root, output)):
        if a.is_relative_to(b) or b.is_relative_to(a):
            raise ValueError("source、archive、output 目录不能相互包含")
    if paths["portrait_index"] == paths["metadata_path"]:
        raise ValueError("索引与 metadata 必须分开")
    for key in ("portrait_index", "metadata_path"):
        if (base/settings[key]).is_symlink() or paths[key].is_relative_to(source):
            raise ValueError("索引和 metadata 不能是符号链接或位于待处理目录中")
    if config["output"]["format"] != "webp":
        raise ValueError("更新正式资源仅支持 WebP")
    n.validate(config)
    source.mkdir(parents=True, exist_ok=True)
    with update_lock(base/".update.lock"):
        if not any(source.iterdir()):
            print("source-update 为空，无需处理。")
            return 0
        document, catalog_source = load_catalog(settings, args)
        jobs, issues = queue(source, Catalog(document))
        if args.check:
            for job in jobs:
                print(f"{job['source']} -> {job['id']}.webp ({job['name']})")
            for issue in issues:
                print(f"保留 {issue['source']}: {issue['error']}")
            return 2 if issues else 0
        archive = archive_root/datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        archive.mkdir(parents=True)
        report = {"catalog_source": catalog_source, "published": [], "issues": issues, "retained": []}
        n.write_json(archive/"catalog.json", document)
        n.write_json(archive/"config-resolved.json", config)
        try:
            if jobs:
                with tempfile.TemporaryDirectory(prefix=".update-", dir=base) as tmp:
                    work = Path(tmp)
                    inputs = work/"input"
                    inputs.mkdir()
                    for job in jobs:
                        target = inputs/job["source"]
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source/job["source"], target)
                        if n.sha256(target) != job["source_sha256"]:
                            raise ValueError("复制时源图变化，请重试")
                    manifest = {j["id"] + ".webp": j["source"] for j in jobs}
                    n.write_json(work/"manifest.json", manifest)
                    overrides = {"images": {j["source"]: j["override"] for j in jobs}, "references": {}}
                    batch_args = SimpleNamespace(input=inputs, output=work/"result", manifest=work/"manifest.json",
                                                 only=None, debug=args.debug)
                    # Some ONNX builds persist auxiliary files in cwd; keep them temporary too.
                    with working_directory(work):
                        detector = n.Detector(base/"models/anime-face-v1.4-s.onnx", config["detector"])
                        calibration = n.calibrate(config, base, detector, overrides)
                        n.batch(batch_args, config, detector, overrides, calibration)
                    records = n.read_json(work/"result/metadata.json")
                    good = []
                    for job in jobs:
                        r = records[job["id"] + ".webp"]
                        if r["status"] in ("ok", "warning"):
                            r["output"] = settings["public_prefix"].rstrip("/") + "/" + job["id"] + ".webp"
                            good.append(job)
                        else:
                            issues.append({"source": job["source"], "error": r.get("error", r["warnings"])})
                    n.write_json(archive/"metadata.json", records)
                    for filename in ("calibration.json", "summary.json"):
                        shutil.copy2(work/"result"/filename, archive/filename)
                    n.write_json(archive/"manifest.json", manifest)
                    if args.debug:
                        shutil.copytree(work/"result/debug", archive/"debug")
                        for path in (work/"result").glob("*sheet-*.jpg"):
                            shutil.copy2(path, archive/path.name)
                    if good:
                        report["retained"] = publish(source, output, paths["portrait_index"], paths["metadata_path"],
                            settings["public_prefix"], archive, work/"result", good, records)
                        report["published"] = [{"id": j["id"], "name": j["name"], "source": j["source"],
                            "warnings": records[j["id"] + ".webp"]["warnings"]} for j in good]
            for directory in sorted(source.rglob("*"), key=lambda p: len(p.parts), reverse=True):
                if directory.is_dir() and not directory.is_symlink() and not any(directory.iterdir()):
                    directory.rmdir()
            report["remaining_files"] = [p.relative_to(source).as_posix() for p in source.rglob("*") if p.is_file() or p.is_symlink()]
        except Exception as exc:
            report["error"] = str(exc)
            raise
        finally:
            n.write_json(archive/"report.json", report)
        print(f"已发布 {len(report['published'])} 张；原图与记录：{archive}")
        for item in report["published"]:
            if item["warnings"]:
                print(f"提示 {item['name']}: {', '.join(item['warnings'])}")
        for issue in issues:
            print(f"保留 {issue['source']}: {issue['error']}")
        if report["remaining_files"]:
            print("source-update 尚有未处理文件，请查看 report.json。")
        return 2 if issues or report["remaining_files"] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=HERE/"config.json")
    parser.add_argument("--catalog-url", help="公共 /v1/operator/catalog 的完整 URL")
    parser.add_argument("--catalog-json", type=Path, help="明确指定公共接口导出的 JSON，供离线处理")
    parser.add_argument("--check", action="store_true", help="只检查名称匹配，不生成或移动文件")
    parser.add_argument("--debug", action="store_true", help="在本批归档内保留标注和 contact sheet")
    return run(parser.parse_args())


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
