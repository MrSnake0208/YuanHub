#!/usr/bin/env python3
"""Offline XLSX -> catalog JSON. Never contacts a service or writes source workbooks."""
import argparse
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_workbook(path):
    with ZipFile(path) as archive:
        strings = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        sheets = ET.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS)
        result = {}
        for index, sheet in enumerate(sheets, 1):
            rows = []
            for row in ET.fromstring(archive.read(f'xl/worksheets/sheet{index}.xml')).findall('s:sheetData/s:row', NS):
                cells = {}
                for cell in row:
                    column = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                    value = cell.find('s:v', NS)
                    cells[column] = (''.join(cell.find('s:is', NS).itertext()) if cell.get('t') == 'inlineStr' else
                                     strings[int(value.text)] if cell.get('t') == 's' else value.text if value is not None else '')
                rows.append(cells)
            if rows:
                result[sheet.attrib['name']] = [{heading: row.get(column, '') for column, heading in rows[0].items()} for row in rows[1:]]
        return result


def convert(game, source, dictionary, targets=None, aliases=None):
    sheets = read_workbook(source)
    rows = sheets['成就总表']
    assert len({r['成就ID'] for r in rows}) == len(rows), '重复原始身份'
    hidden = {r['成就ID']: r for r in sheets['隐藏成就']}
    assert set(hidden) == {r['成就ID'] for r in rows if r['隐藏'] == '隐藏'}
    names = {item['name']: item for item in dictionary if game in item['games']}
    assert len(names) == sum(game in item['games'] for item in dictionary), '奖励名称不唯一'
    groups = list(dict.fromkeys(r['所属分组'] for r in rows))
    categories = [dict(category_id=f'import_category_{i}', name=name, sort=i, enabled=True) for i, name in enumerate(groups)]
    entries, seen_sort = [], set()
    for row in rows:
        assert row['隐藏'] in ('', '隐藏') and row['达成条件(中文)'] and row['成就名称']
        if row['成就ID'] in hidden:
            assert all(hidden[row['成就ID']][k] == row[k] for k in ['成就名称', '所属分组', '达成条件(中文)'])
        sort = int(row['排序'])
        assert (row['所属分组'], sort) not in seen_sort
        seen_sort.add((row['所属分组'], sort))
        rewards = []
        for slot in (1, 2):
            raw = row[f'奖励{slot}物品']
            name, quantity = (aliases or {}).get(raw, raw), row[f'奖励{slot}数量']
            assert bool(name) == bool(quantity)
            if name:
                number = int(quantity)
                assert 0 < number <= 9007199254740991 and name in names
                rewards.append(dict(item_key=names[name]['item_key'], name=name, quantity=number))
        assert sum(r['quantity'] for r in rewards) <= 9007199254740991
        assert len({r['item_key'] for r in rewards}) == len(rewards)
        linked = (targets or {}).get(row['成就名称'], {})
        target = linked.get('target')
        assert target is None or type(target) is int and 0 < target <= 1000000000000
        metric = linked.get('linked_metric')
        assert metric is None or metric == 'yuan_bond_variants' and target is not None
        entries.append(dict(game=game, category_id=categories[groups.index(row['所属分组'])]['category_id'],
                            name=row['成就名称'], condition=row['达成条件(中文)'], sort=sort,
                            is_hidden=row['隐藏'] == '隐藏', rewards=rewards, target=target, linked_metric=metric))
    return dict(format='yuanhub-achievement-catalog', schema_version=1, catalog=dict(
        game=game, data_status='partial' if entries else 'empty', coverage='', categories=categories, entries=entries,
        retired_ids=[], reward_items=dictionary, point_tracks=[], reward_filter_keys=[]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', required=True, choices=['代号鸢', '如鸢'])
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--dictionary', required=True, type=Path)
    parser.add_argument('--targets', type=Path)
    parser.add_argument('--reward-aliases', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(ROOT):
        parser.error('真实资料输出必须位于仓库外私有目录')
    read = lambda path: json.loads(path.read_text()) if path else None
    dictionary = read(args.dictionary)
    if isinstance(dictionary, dict):
        dictionary = dictionary['reward_items']
    result = convert(args.game, args.source, dictionary, read(args.targets), read(args.reward_aliases))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"已转换 {len(result['catalog']['entries'])} 条；仅写入指定私有文件")


if __name__ == '__main__':
    main()
