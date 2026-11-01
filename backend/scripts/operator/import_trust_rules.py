"""Convert a supplied trust_export directory into the versioned relationship rules."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def convert(source):
    data = json.loads((source / 'trust_data.json').read_text())
    raw = json.loads((source / 'raw/full_trust.json').read_text())
    clean = json.loads((source / 'raw/breakthrough_clean.json').read_text())
    levels = sorted(data['levels'], key=lambda row: row['level'])
    assert [row['level'] for row in levels] == list(range(1, 41)), 'Incomplete level table'
    assert [row['trust_value'] for row in levels] == list(range(100, 1001, 100)) + list(range(1200, 5001, 200)) + list(range(5500, 10001, 500))
    awards = lambda values: sorted((a['id'], a['amount']) for a in values)
    original = {row['level']: row for row in raw['levels']}
    for row in levels:
        old = original[row['level']]
        assert (old['trust_value'], old['star_limit']) == (row['trust_value'], row['star_limit'])
        assert awards(row['awards']) == awards(old['awards'].values()), 'Awards differ from raw export'
    limits = lambda rows: sorted((r['warrior_id'], r['stage'], r['trust_exp_limit']) for r in rows)
    assert limits(clean) == limits(data['breakthrough']), 'Breakthrough table differs from raw export'
    assert len(set((r['warrior_id'], r['stage']) for r in clean)) == len(clean)
    subjects = defaultdict(list)
    for row in data['breakthrough']:
        subjects[row['warrior_id']].append(row)
    assert len(subjects) == 124
    result = {
        'version': 'relationships-2026-10-22-trust-v1',
        'source': '2026-10-22 信赖配置提取数据；双服同步及电影形态奖励共用按产品确认',
        'verified_on': '2026-10-22',
        'export_sha256': hashlib.sha256((source / 'trust_data.json').read_bytes()).hexdigest(),
        'milestones': [
            {'at': r['trust_value'], 'rewards': [
                {'item_key': 'item:' + str(a['id']), 'name': a['name'], 'quantity': a['amount']}
                for a in r['awards']
            ]} for r in levels
        ],
        'subjects': [],
    }
    for wid, rows in sorted(subjects.items()):
        assert len({r['warrior_name'] for r in rows}) == 1
        cap = max(r['trust_exp_limit'] for r in rows)
        assert cap in (2000, 10000)
        result['subjects'].append({'warrior_id': wid, 'name': rows[0]['warrior_name'], 'max': cap})
    assert len({r['name'] for r in result['subjects']}) == len(subjects)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = convert(args.source)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f"Wrote {len(output['subjects'])} subjects and {len(output['milestones'])} reward levels to {args.output}")
