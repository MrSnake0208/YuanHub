"""Seed the lightweight risk-verification context for new Trellis tasks."""
import json

# Keep task creation cheap: every task needs the risk-selection entrypoint, but
# the frontend/backend quality guideline should only be added when that layer is
# actually in scope.
QUALITY_SPECS = ('docs/development/testing.md',)


def seed_test_context(root, task):
    for name in ('implement.jsonl', 'check.jsonl'):
        file = task / name
        text = file.read_text() if file.is_file() else ''
        records = [json.loads(line) for line in text.splitlines() if line.strip()]
        existing = {record.get('file') for record in records}
        additions = [json.dumps({'file': spec, 'reason': 'Risk-based verification entrypoint; add only the affected layer quality guideline during planning'}, ensure_ascii=False)
                     for spec in QUALITY_SPECS if spec not in existing]
        if additions:
            file.write_text(text + ('\n' if text and not text.endswith('\n') else '') + '\n'.join(additions) + '\n')
    plan = task / 'test-plan.json'
    if not plan.exists():
        plan.write_text(json.dumps({
            'version': 2,
            'change_kind': 'feature',
            'risk_level': 'unclassified',
            'verification_owner': 'user',
            'coverage': [], 'regressions': [], 'exceptions': [], 'mandatory_checks': [],
            'instructions': 'Classify risk as L0-L4 before implementation. Map behavior-changing sources to tests/invariants. For L0/L1 non-behavior edits, use exact-file exceptions instead of artificial tests. Regression/full execution defaults to the user; set verification_owner=agent only when the current request asks the Agent to run verification. See docs/development/testing.md.'
        }, indent=2, ensure_ascii=False) + '\n')
