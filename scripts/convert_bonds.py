#!/usr/bin/env python3
"""Convert authorized bond data locally; never downloads or publishes data."""
import argparse
import json
import re
import uuid
from pathlib import Path

ACTIONS = dict(zip(['纵火', '传谣', '下毒', '卧底', '搜集', '灭火', '净水', '营救'],
                   ['arson', 'rumor', 'poison', 'undercover', 'gather', 'extinguish', 'purify', 'rescue']))
WEATHERS = dict(zip(['晴天', '雨天', '大雾', '狂风', '小雪', '大雪', '飓风', '雷鸣'],
                    ['sunny', 'rain', 'fog', 'wind', 'light_snow', 'heavy_snow', 'hurricane', 'thunder']))
GAMES = ('代号鸢', '如鸢')


def read_rows(text):
    """Read rawData string literals without executing third-party JavaScript."""
    match = re.search(r'const\s+rawData\s*=\s*\[([\s\S]*?)\];', text)
    if not match:
        raise ValueError('未找到固定格式 rawData')
    body = re.sub(r'//[^\n]*', '', match[1])
    return [json.loads(value) for value in re.findall(r'"(?:[^"\\]|\\.)*"', body)]


def identity(entry):
    return entry['game'], tuple(sorted(entry['members'])), entry['action'], entry['weather']


def validate(entry):
    if set(entry) != {'bond_id', 'game', 'members', 'action', 'weather', 'effect', 'status'}:
        raise ValueError('羁绊必须恰有七字段')
    if not re.fullmatch(r'bond_[0-9a-f]{32}', entry['bond_id']):
        raise ValueError('bond_id 必须为内部 UUID')
    if entry['game'] not in GAMES or len(entry['members']) not in (2, 3) or len(set(entry['members'])) != len(entry['members']):
        raise ValueError('游戏或成员非法')
    if entry['action'] not in ACTIONS.values() or entry['weather'] not in WEATHERS.values():
        raise ValueError('行动或天气非法')
    if entry['effect'] not in ('positive', 'negative') or entry['status'] not in ('active', 'retired', 'invalid'):
        raise ValueError('效果或状态非法')


def convert(rows, operators, existing=()):
    by_name = {}
    for op in operators:
        if op['name'] in by_name:
            raise ValueError('密探同名有歧义：' + op['name'])
        by_name[op['name']] = op
    old, ids = {}, set()
    for entry in existing:
        validate(entry)
        key = identity(entry)
        if key in old or entry['bond_id'] in ids:
            raise ValueError('已有目录身份或ID重复')
        old[key] = entry
        ids.add(entry['bond_id'])
    entries, pending, seen = [], [], {}
    for index, row in enumerate(rows):
        parts = row.split('|')
        if len(parts) not in (4, 5):
            raise ValueError(f'第{index + 1}行格式非法')
        names, action, weather, effect = parts[:4]
        tag = parts[4] if len(parts) == 5 else 'both'
        if action not in ACTIONS or effect not in ('+', '-') or tag not in ('', 'both', 'no_ry', 'no_dyy'):
            raise ValueError(f'第{index + 1}行枚举非法')
        members = names.split(',')
        if len(members) not in (2, 3) or len(set(members)) != len(members) or any(n not in by_name for n in members):
            raise ValueError(f'第{index + 1}行成员非法、未知或重复')
        weather_names = weather.split(',') if weather else list(WEATHERS)
        if any(w not in WEATHERS for w in weather_names) or len(set(weather_names)) != len(weather_names):
            raise ValueError(f'第{index + 1}行天气非法或重复')
        for game in GAMES:
            if (game == '如鸢' and tag == 'no_ry') or (game == '代号鸢' and tag == 'no_dyy'):
                continue
            unavailable = [n for n in members if game not in by_name[n]['games']]
            for w in weather_names:
                entry = dict(bond_id='', game=game, members=sorted(by_name[n]['id'] for n in members),
                             action=ACTIONS[action], weather=WEATHERS[w], effect='positive' if effect == '+' else 'negative', status='active')
                key = identity(entry)
                if key in seen:
                    if seen[key]['effect'] != entry['effect']:
                        raise ValueError(f'第{index + 1}行同一身份效果冲突')
                    continue
                previous = old.get(key)
                entry['bond_id'] = previous['bond_id'] if previous else 'bond_' + uuid.uuid4().hex
                # Explicitly retain historical invalid/retired decisions on reruns.
                if previous:
                    entry['status'] = previous['status']
                validate(entry)
                seen[key] = entry
                if unavailable:
                    pending.append(dict(row=index + 1, unavailable=unavailable, entry=entry))
                else:
                    entries.append(entry)
    for key, entry in old.items():
        if key not in seen:
            entries.append({**entry, 'status': 'invalid' if entry['status'] == 'invalid' else 'retired'})
    return dict(format='yuanhub-bond-conversion', schema_version=1,
                catalogs=[dict(game=g, entries=[e for e in entries if e['game'] == g]) for g in GAMES], pending=pending,
                statistics={g: dict(source_variants=sum(k[0] == g for k in seen),
                                    ready=sum(e['game'] == g and e['status'] == 'active' for e in entries),
                                    pending=sum(p['entry']['game'] == g for p in pending)) for g in GAMES})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='授权的字符串行数组JSON，或参考HTML（仅解析）')
    parser.add_argument('--operators', required=True, type=Path)
    parser.add_argument('--existing', type=Path, help='上次转换产物或七字段条目数组；后续转换必须提供')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--audit-only', action='store_true', help='仅输出统计与冲突行，不输出目录或发号结果')
    args = parser.parse_args()
    if not args.audit_only and not args.output:
        parser.error('目录输出必须显式提供 --output，避免资料进入日志')
    if args.output and args.output.resolve().is_relative_to(Path(__file__).resolve().parents[1]):
        parser.error('真实资料输出必须位于仓库外私有目录')
    text = args.input.read_text()
    rows = read_rows(text) if args.input.suffix == '.html' else json.loads(text)
    existing_path = args.existing or (args.output if not args.audit_only and args.output and args.output.exists() else None)
    existing = json.loads(existing_path.read_text()) if existing_path else []
    if isinstance(existing, dict):
        existing = [e for c in existing['catalogs'] for e in c['entries']] + [p['entry'] for p in existing.get('pending', [])]
    result = convert(rows, json.loads(args.operators.read_text()), existing)
    if args.audit_only:
        result = dict(statistics=result['statistics'], conflicts=list({(p['row'], tuple(p['unavailable'])) for p in result['pending']}))
        result['conflicts'].sort()
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(rendered)
    else:
        print(rendered, end='')


if __name__ == '__main__':
    main()
