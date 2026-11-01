#!/usr/bin/env python3
"""将 YuanHub 信息收集 XLSX 转换为卡池、活动 JSON（仅使用 Python 标准库）。"""

import argparse
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = ("游戏", "一级分类", "二级分类", "名称", "开始时间", "结束时间")
POOL_TYPES = {"限定": "limited", "复刻": "rerun", "照影": "zhaoying", "自选": "choice", "常驻": "permanent"}
ACTIVITY_TYPES = {
    ("活动", "活动"): (None, None),
    ("活动", "大型活动"): ("LARGE_EVENT", None),
    ("活动", "中型活动"): ("MEDIUM_EVENT", None),
    ("活动", "地宫"): ("UNDERGROUND", None),
    ("活动", "泰山府"): ("TAISHAN_FU", None),
    ("心纸营建", "历险"): ("FURNITURE", None),
    ("心纸营建", "神秘洞窟"): ("FURNITURE", "MYSTERIOUS_CAVE"),
}
EMPTY = {"", "/", "-", "—"}


def read_workbook(path):
    """读取汇总页；只有一个工作表时允许改名。不依赖 Excel 样式识别日期。"""
    with ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = workbook.findall("s:sheets/s:sheet", NS)
        sheet = next((s for s in sheets if s.get("name") == "汇总"), None)
        if sheet is None:
            if len(sheets) != 1:
                raise ValueError("多个工作表时必须有名为“汇总”的工作表")
            sheet = sheets[0]
        sheet_id = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in relations if r.get("Id") == sheet_id)
        sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(t.text or "" for t in item.findall(".//s:t", NS))
                       for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        rows = []
        for row in ET.fromstring(archive.read(sheet_path)).findall("s:sheetData/s:row", NS):
            values = {}
            for cell in row.findall("s:c", NS):
                column = re.sub(r"\d", "", cell.get("r"))
                value = cell.findtext("s:v", "", NS)
                if cell.get("t") == "s":
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                values[column] = value.strip()
            if any(values.values()):
                rows.append((int(row.get("r")), values))
        if not rows:
            raise ValueError("工作表为空")
        columns = {value: column for column, value in rows[0][1].items()}
        missing = set(HEADERS) - columns.keys()
        if missing:
            raise ValueError("缺少表头：" + "、".join(sorted(missing)))
        properties = workbook.find("s:workbookPr", NS)
        date1904 = properties is not None and properties.get("date1904") in {"1", "true"}
        return [(number, {key: cells.get(column, "") for key, column in columns.items()})
                for number, cells in rows[1:]], date1904


def parse_date(value, date1904=False):
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        serial = float(value)
        if not date1904 and serial < 61:
            raise ValueError("不支持 1900-03-01 之前的 Excel 日期")
        epoch = datetime(1904, 1, 1) if date1904 else datetime(1899, 12, 30)
        # Excel 的浮点误差会让 05:00 变成 04:59:59.999，先按分钟取整。
        return epoch + timedelta(minutes=round(serial * 1440))
    value = value.replace("/", "-").replace("年", "-").replace("月", "-").replace("日", "")
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            result = datetime.strptime(value, fmt)
            if result.second:
                raise ValueError("日期时间只支持分钟精度")
            return result
        except ValueError:
            continue
    raise ValueError(f"无法识别日期时间：{value!r}，请填写 Excel 日期或 YYYY-MM-DD HH:mm")


def convert(rows, date1904=False):
    pools, activities, warnings = [], [], []
    seen_pools, seen_activities = {}, {}
    for number, row in rows:
        location = f"第 {number} 行（{row.get('名称', '')}）"
        try:
            game, name = row["游戏"], row["名称"]
            primary, secondary = row["一级分类"], row["二级分类"]
            if game not in {"代号鸢", "如鸢"}:
                raise ValueError("游戏仅支持代号鸢、如鸢")
            if not name or len(name.encode("utf-16-le")) // 2 > (128 if primary == "招募" else 120):
                raise ValueError("名称为空或超出导入长度限制")
            if primary == "招募":
                if secondary not in POOL_TYPES:
                    raise ValueError(f"未知卡池分类：{secondary}")
            elif (primary, secondary) not in ACTIVITY_TYPES:
                raise ValueError(f"未知活动分类：{primary} / {secondary}")
            permanent = primary == "招募" and secondary == "常驻"
            required_dates = () if permanent else ("开始时间", "结束时间") if primary == "招募" else ("开始时间",)
            missing_dates = [key for key in required_dates if row[key] in EMPTY]
            if missing_dates:
                warnings.append(f"{location}：缺少{'、'.join(missing_dates)}，已跳过")
                continue
            start = None if permanent and row["开始时间"] in EMPTY else parse_date(row["开始时间"], date1904)
            end = None if permanent or row["结束时间"] in EMPTY else parse_date(row["结束时间"], date1904)
            if start is not None and end is not None and end < start:
                raise ValueError("结束时间早于开始时间")
            if primary == "招募":
                # 不包含行号、结束时间、UP，追加/排序及补充资料不会改变卡池身份。
                identity = json.dumps([game, name, "permanent" if permanent else start.date().isoformat()], ensure_ascii=False)
                pool_id = "xlsx-" + hashlib.sha256(identity.encode()).hexdigest()[:24]
                up = row.get("密探UP", "")
                scope = "范围" in up
                names = [] if up in EMPTY or scope else list(dict.fromkeys(
                    item.strip() for item in re.split(r"[、,，;；\n]+", up) if item.strip()))
                if len(names) > 120 or any(len(item.encode("utf-16-le")) // 2 > 128 for item in names):
                    raise ValueError("UP 名单超出导入限制")
                pool = {
                    "pool_id": pool_id, "game": game, "name": name,
                    "pool_type": POOL_TYPES[secondary],
                    "start_date": start.date().isoformat() if start else None, "end_date": end.date().isoformat() if end else None,
                    "enabled": True,
                    "up_agents": [{"id": f"{pool_id}:up:{index}", "name": agent,
                                   "operator_id": None, "active": True}
                                  for index, agent in enumerate(names, 1)],
                    "up_status": "selection" if secondary == "自选" else "partial" if names else "unknown",
                    "source_note": "密探UP：" + up if up not in EMPTY else "",
                }
                if scope:
                    warnings.append(f"{location}：UP 范围描述保留在 source_note，未生成密探占位")
                if permanent and row["结束时间"] not in EMPTY:
                    warnings.append(f"{location}：常驻池按无限期处理，未使用表格结束时间")
                if start and (start.time() != datetime.min.time() or (end and end.time() != datetime.min.time())):
                    warnings.append(f"{location}：卡池接口只支持日期，具体时刻保留在 source_note")
                    end_label = end.strftime("%Y-%m-%d %H:%M") if end else "无限期"
                    pool["source_note"] += f"\n原始档期：{start:%Y-%m-%d %H:%M} — {end_label}"
                item, key, seen, output = pool, pool_id, seen_pools, pools
            else:
                subtype, detail = ACTIVITY_TYPES[(primary, secondary)]
                notes = [f"原始分类：{primary} / {secondary}"]
                for field in ("洞窟备注", "男主"):
                    if row.get(field, "") not in EMPTY:
                        notes.append(f"{field}：{row[field]}")
                description = "\n".join(notes)
                if len(description.encode("utf-16-le")) // 2 > 1000:
                    raise ValueError("活动备注超过 1000 字")
                activity = {
                    "game": game, "title": name, "category": "ACTIVITY",
                    "start_date": start.date().isoformat(), "end_date": end.date().isoformat() if end else None,
                    "start_time": None, "end_time": None, "time_zone": "Asia/Shanghai",
                    "description": description, "enabled": True,
                }
                if start.time() != datetime.min.time() or (end is not None and end.time() != datetime.min.time()):
                    activity.update(start_time=start.strftime("%H:%M"), end_time=end.strftime("%H:%M") if end else None)
                if end is None:
                    warnings.append(f"{location}：结束时间未填写，已按持续进行保留")
                if subtype:
                    activity["subtype"] = subtype
                if detail:
                    activity["subtype_detail"] = detail
                item = activity
                key = (game, name, start, end)
                seen, output = seen_activities, activities
            if key in seen:
                if seen[key] != item:
                    raise ValueError("同一条目存在不同内容，请合并后再转换")
                warnings.append(f"{location}：与前面的记录重复，已跳过")
            else:
                seen[key] = item
                output.append(item)
        except ValueError as error:
            raise ValueError(f"{location}：{error}") from error
    pools.sort(key=lambda p: (p["game"], p["start_date"] or "", p["name"]))
    activities.sort(key=lambda a: (a["game"], a["start_date"], a["title"]))
    if len(pools) > 1000:
        raise ValueError("卡池超过单次导入上限 1000 条，请拆分源表")
    return pools, activities, warnings


def json_text(document):
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", nargs="?", type=Path, default=ROOT / "YuanHub信息收集表.xlsx")
    parser.add_argument("--output-dir", type=Path, help="输出目录，默认位于表格旁的 <表格名>-json")
    parser.add_argument("--split-activities", action="store_true", help="额外导出每批最多 200 条的活动文件")
    args = parser.parse_args()
    try:
        rows, date1904 = read_workbook(args.xlsx)
        for game in ("代号鸢", "如鸢"):
            if not any(row["游戏"] == game and row["一级分类"] == "招募" and row["名称"] == "绣衣天下" for _, row in rows):
                rows.append((0, {"游戏": game, "一级分类": "招募", "二级分类": "常驻", "名称": "绣衣天下",
                                 "开始时间": "", "结束时间": "", "密探UP": ""}))
        pools, activities, warnings = convert(rows, date1904)
        documents = {"卡池.json": {"pools": pools}, "活动.json": {"schema_version": 1, "items": activities}}
        if args.split_activities:
            for index in range(0, len(activities), 200):
                documents[f"活动-分批-{index // 200 + 1:03}.json"] = {
                    "schema_version": 1, "items": activities[index:index + 200]}
        encoded = {name: json_text(document) for name, document in documents.items()}
        for name, text in encoded.items():
            if name.startswith("活动-分批-") and len(text.encode()) > 1024 * 1024:
                raise ValueError(f"{name} 超过导入上限 1 MiB，请缩短备注或拆分源表")
        output = args.output_dir or args.xlsx.parent / (args.xlsx.stem + "-json")
        output.mkdir(parents=True, exist_ok=True)
        for name, text in encoded.items():
            (output / name).write_text(text, encoding="utf-8")
        print(f"已输出：{output.resolve()}\n卡池 {len(pools)} 条；活动 {len(activities)} 条。")
        for warning in warnings:
            print("提示：" + warning)
        if not 1 <= len(activities) <= 200 or len(encoded["活动.json"].encode()) > 1024 * 1024:
            print("注意：活动汇总不能直接整批导入，请使用 --split-activities 导出分批文件。")
        if not pools:
            print("注意：卡池汇总为空，无需导入。")
        if args.split_activities:
            print(f"已额外导出 {(len(activities) + 199) // 200} 个活动分批文件；请只导入本次生成的批次。")
        return 0
    except (ValueError, OSError, BadZipFile, ET.ParseError, KeyError, IndexError, StopIteration, OverflowError) as error:
        print(f"转换失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
