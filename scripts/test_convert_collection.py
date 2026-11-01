import contextlib
from datetime import datetime
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from xml.sax.saxutils import escape
from zipfile import ZipFile

from convert_collection import convert, main, parse_date, read_workbook


def row(**overrides):
    return {"游戏": "代号鸢", "一级分类": "招募", "二级分类": "限定", "名称": "测试卡池",
            "开始时间": "2026-10-01", "结束时间": "2026-10-20", "密探UP": "孙权、孙尚香", **overrides}


def workbook(path, data, date1904=False):
    headers = list(data[0])
    namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    records = []
    for index, values in enumerate([headers] + [list(item.values()) for item in data], 1):
        cells = "".join(f'<c r="{chr(65 + column)}{index}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
                        for column, value in enumerate(values))
        records.append(f'<row r="{index}">{cells}</row>')
    with ZipFile(path, "w") as archive:
        archive.writestr("xl/workbook.xml", f'<workbook xmlns="{namespace}" '
                         'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                         f'<workbookPr date1904="{int(date1904)}"/>'
                         '<sheets><sheet name="汇总" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" '
                         'Target="/xl/worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{namespace}">'
                         f'<sheetData>{"".join(records)}</sheetData></worksheet>')


class CollectionTests(unittest.TestCase):
    def test_excel_dates_preserve_minutes_and_epoch(self):
        self.assertEqual(parse_date("45328.208333333299"), datetime(2024, 2, 6, 5))
        self.assertEqual(parse_date("45358.207638888904"), datetime(2024, 3, 7, 4, 59))
        self.assertEqual(parse_date("1.5", True), datetime(1904, 1, 2, 12))
        self.assertEqual(parse_date("2026/10/01 05:00"), datetime(2026, 10, 1, 5))
        with self.assertRaises(ValueError):
            parse_date("2026-02-30")

    def test_pool_identity_and_up_placeholders(self):
        pools, _, _ = convert([(2, row())])
        other, _, _ = convert([(50, row(结束时间="2026-10-21", 密探UP="孙尚香、孙权"))])
        self.assertEqual(pools[0]["pool_id"], other[0]["pool_id"])
        self.assertEqual([agent["name"] for agent in pools[0]["up_agents"]], ["孙权", "孙尚香"])
        self.assertIsNone(pools[0]["up_agents"][0]["operator_id"])
        self.assertEqual(pools[0]["up_status"], "partial")
        next_period, _, _ = convert([(2, row(开始时间="2026-10-02"))])
        self.assertNotEqual(pools[0]["pool_id"], next_period[0]["pool_id"])

    def test_choice_scope_is_not_an_agent(self):
        pools, _, warnings = convert([(2, row(二级分类="自选", 密探UP="历史范围池"))])
        self.assertEqual(pools[0]["up_agents"], [])
        self.assertEqual(pools[0]["up_status"], "selection")
        self.assertIn("历史范围池", pools[0]["source_note"])
        self.assertTrue(warnings)

    def test_permanent_pool_keeps_unknown_start_and_no_end_with_stable_identity(self):
        pools, _, _ = convert([(2, row(名称="绣衣天下", 二级分类="常驻", 开始时间="", 结束时间="", 密探UP=""))])
        known, _, warnings = convert([(7, row(名称="绣衣天下", 二级分类="常驻", 开始时间="2024-01-01", 结束时间="2026-01-01", 密探UP=""))])
        self.assertIsNone(pools[0]["start_date"])
        self.assertIsNone(pools[0]["end_date"])
        self.assertIsNone(known[0]["end_date"])
        self.assertEqual(pools[0]["pool_id"], known[0]["pool_id"])
        self.assertEqual(pools[0]["pool_type"], "permanent")
        self.assertTrue(warnings)

    def test_cave_classification_times_and_notes(self):
        source = row(一级分类="心纸营建", 二级分类="神秘洞窟", 开始时间="2026-10-01",
                     结束时间="2026-10-20 04:59", 洞窟备注="左", 男主="孙策")
        _, activities, _ = convert([(2, source)])
        activity = activities[0]
        self.assertEqual(activity["subtype"], "FURNITURE")
        self.assertEqual(activity["subtype_detail"], "MYSTERIOUS_CAVE")
        self.assertEqual((activity["start_time"], activity["end_time"]), ("00:00", "04:59"))
        self.assertIn("洞窟备注：左", activity["description"])
        self.assertIn("男主：孙策", activity["description"])

    def test_missing_date_is_reported_and_unknown_type_fails(self):
        pools, activities, warnings = convert([(226, row(结束时间=""))])
        self.assertEqual((pools, activities), ([], []))
        self.assertIn("226", warnings[0])
        self.assertIn("结束时间", warnings[0])
        with self.assertRaisesRegex(ValueError, "第 7 行.*未知"):
            convert([(7, row(二级分类="新分类"))])
        with self.assertRaisesRegex(ValueError, "结束时间早于"):
            convert([(2, row(结束时间="2026-09-30"))])

    def test_activity_without_end_date_is_kept_until_completed(self):
        source = row(一级分类="活动", 二级分类="活动", 开始时间="2026-10-01 05:00", 结束时间="")
        pools, activities, warnings = convert([(226, source)])
        self.assertEqual(pools, [])
        self.assertEqual(len(activities), 1)
        self.assertIsNone(activities[0]["end_date"])
        self.assertIsNone(activities[0]["end_time"])
        self.assertEqual(activities[0]["start_time"], "05:00")
        self.assertIn("持续进行", warnings[0])
        _, missing, warnings = convert([(227, {**source, "开始时间": ""})])
        self.assertEqual(missing, [])
        self.assertIn("开始时间", warnings[0])

    def test_duplicate_is_skipped_but_conflict_fails(self):
        pools, _, warnings = convert([(2, row()), (3, row())])
        self.assertEqual(len(pools), 1)
        self.assertIn("重复", warnings[0])
        with self.assertRaisesRegex(ValueError, "不同内容"):
            convert([(2, row()), (3, row(密探UP="孙权"))])

    def test_cli_reads_xlsx_and_splits_without_losing_items(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "新表格.xlsx"
            data = [row()]
            data += [row(一级分类="活动", 二级分类="地宫", 名称=f"活动{index}") for index in range(201)]
            workbook(source, data)
            rows, date1904 = read_workbook(source)
            self.assertEqual(len(rows), 202)
            self.assertFalse(date1904)
            with patch("sys.argv", ["convert_collection.py", str(source), "--split-activities"]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(), 0)
            output = Path(directory) / "新表格-json"
            summary = json.loads((output / "活动.json").read_text(encoding="utf-8"))
            batches = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(output.glob("活动-分批-*.json"))]
            self.assertEqual([len(batch["items"]) for batch in batches], [200, 1])
            self.assertEqual([item for batch in batches for item in batch["items"]], summary["items"])
            pools = json.loads((output / "卡池.json").read_text(encoding="utf-8"))["pools"]
            self.assertEqual(len(pools), 3)
            permanent = [pool for pool in pools if pool["pool_type"] == "permanent"]
            self.assertEqual({pool["game"] for pool in permanent}, {"代号鸢", "如鸢"})
            self.assertTrue(all(pool["name"] == "绣衣天下" and pool["start_date"] is None and pool["end_date"] is None for pool in permanent))

    def test_cli_does_not_duplicate_permanent_pool_already_in_workbook(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "常驻.xlsx"
            workbook(source, [row(名称="绣衣天下", 二级分类="常驻", 开始时间="", 结束时间="", 密探UP="")])
            original = source.read_bytes()
            with patch("sys.argv", ["convert_collection.py", str(source)]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(), 0)
            output = Path(directory) / "常驻-json" / "卡池.json"
            pools = json.loads(output.read_text(encoding="utf-8"))["pools"]
            self.assertEqual(len(pools), 2)
            self.assertEqual(len({pool["pool_id"] for pool in pools}), 2)
            self.assertEqual(source.read_bytes(), original)

    def test_invalid_input_does_not_overwrite_previous_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "表格.xlsx"
            output = Path(directory) / "表格-json"
            output.mkdir()
            previous = output / "卡池.json"
            previous.write_text("previous", encoding="utf-8")
            workbook(source, [row(二级分类="未知")])
            with patch("sys.argv", ["convert_collection.py", str(source)]), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(), 1)
            self.assertEqual(previous.read_text(encoding="utf-8"), "previous")


if __name__ == "__main__":
    unittest.main()
