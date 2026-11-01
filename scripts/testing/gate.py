"""Trellis completion gate with risk-based verification ownership."""
from __future__ import annotations
import datetime as dt
import json
from pathlib import Path
from impact import changed_files, coverage_gaps, fingerprint, runtime_file


VALID_RISKS = {'L0', 'L1', 'L2', 'L3', 'L4'}
VALID_OWNERS = {'user', 'agent'}


def _plan_settings(task):
    manifest = json.loads((task / 'test-plan.json').read_text())
    # Legacy tasks created before the risk-based policy remain usable. New
    # tasks explicitly seed these fields.
    risk = manifest.get('risk_level', 'L2')
    owner = manifest.get('verification_owner', 'user')
    return manifest, risk, owner


def validate_report(root, task, report, changes, now=None):
    errors = []
    manifest, risk, owner = _plan_settings(task)
    if report.get('task') != task.relative_to(root).as_posix():
        errors.append('report belongs to another Trellis task')
    accepted_modes = {'all'} if risk == 'L4' else {'smart', 'all'}
    if report.get('mode') not in accepted_modes or not report.get('success') or not report.get('completion_eligible'):
        errors.append('completion requires a successful ' + ('all' if risk == 'L4' else 'smart/all') + ' run for this risk level')
    if report.get('fingerprint') != fingerprint(root, changes, task):
        errors.append('code, tests, dependencies or task test-plan changed after verification')
    if report.get('missing_tests'):
        errors.append('report contains unexplained test gaps')
    checks = report.get('checks', [])
    if not checks or any(check.get('exit_code') != 0 for check in checks):
        errors.append('one or more checks did not succeed')
    required = set()
    testing_infra = any(p.startswith(('scripts/testing/', '.trellis/scripts/')) or p == 'scripts/test.sh' for p in changes)
    frontend_runtime = any(p.startswith(('frontend/src/', 'frontend/promo-site/src/')) or
                           p in {'frontend/package.json', 'frontend/vite.config.js', 'frontend/vitest.config.js'} for p in changes)
    backend_runtime = any(p.startswith('backend/src/main/') or p == 'backend/build.gradle.kts' for p in changes)
    if testing_infra:
        required.add('runner-self-tests')
    if frontend_runtime:
        required.add('frontend-source')
    if backend_runtime:
        required.update({'backend-compile', 'backend-ktlint', 'architecture'})
    if manifest.get('change_kind') == 'bugfix' and not manifest.get('regressions'):
        errors.append('bugfix tasks require at least one regression test entry')
    if any(p.startswith('backend/') and p.endswith(('.kt', '.kts')) for p in changes):
        required.add('backend-ktlint-affected')
    required.update(manifest.get('mandatory_checks', []))
    absent = required - {check.get('name') for check in checks}
    if absent:
        errors.append('missing required checks: ' + ', '.join(sorted(absent)))
    for suite, counts in report.get('junit', {}).items():
        if counts.get('tests', 0) == 0 or any(counts.get(key, 0) for key in ('failures', 'errors', 'skipped')):
            errors.append(f'{suite} has failures, skipped tests or no executed tests')
    try:
        started = dt.datetime.strptime(report['started_at'], '%Y%m%dT%H%M%S.%fZ').replace(tzinfo=dt.timezone.utc)
        age = (now or dt.datetime.now(dt.timezone.utc)) - started
        if age.total_seconds() < -60 or age > dt.timedelta(hours=24):
            errors.append('test evidence is older than 24 hours or has an invalid future timestamp')
    except (KeyError, TypeError, ValueError):
        errors.append('invalid test evidence timestamp')
    if owner == 'agent':
        for regression in manifest.get('regressions', []):
            for stage, expected in (('red', 'nonzero'), ('green', 'zero')):
                name = regression.get(stage + '_log', '')
                log = (root / name).resolve()
                if not name or not log.is_relative_to(root) or not log.is_file() or not log.stat().st_size:
                    errors.append(f'{regression.get("name", "bug")}: missing {stage} log')
                    continue
                try:
                    code = int(log.with_suffix('.exit').read_text().strip())
                    if (expected == 'zero' and code != 0) or (expected == 'nonzero' and code <= 0):
                        errors.append(f'{regression.get("name", "bug")}: invalid {stage} exit evidence')
                except (ValueError, OSError):
                    errors.append(f'{regression.get("name", "bug")}: missing {stage} exit evidence')
    return errors


def completion_gate(root, task):
    root, task = Path(root).resolve(), Path(task).resolve()
    if not task.is_relative_to(root / '.trellis/tasks'):
        return ['task is outside the Trellis task directory']
    changes = changed_files(root)
    plan = task / 'test-plan.json'
    if not plan.is_file():
        return ['create test-plan.json and classify the task risk before finishing a code task'] if any(runtime_file(p) for p in changes) else []
    try:
        manifest, risk, owner = _plan_settings(task)
    except (OSError, ValueError, TypeError):
        return ['test-plan.json is unreadable or invalid JSON']
    if risk not in VALID_RISKS:
        return ['set test-plan.json risk_level to one of L0, L1, L2, L3, L4']
    if owner not in VALID_OWNERS:
        return ['set test-plan.json verification_owner to user or agent']
    gaps, _ = coverage_gaps(root, changes, task)
    if gaps:
        return ['missing tests or reviewed exact-file explanation: ' + ', '.join(gaps)]
    if manifest.get('change_kind') == 'bugfix' and not manifest.get('regressions'):
        return ['bugfix tasks require at least one regression test entry']

    # frontend-All defaults regression/full execution to the user. In this mode
    # finish/archive only checks that the plan honestly covers changed runtime
    # sources; it does not force the Agent to run smart/all.
    if owner == 'user':
        return []

    # L0-L2 Agent-owned work may use targeted commands that do not emit a root
    # harness report. The plan/coverage gate is sufficient here; the final
    # response must state what actually ran.
    if risk in {'L0', 'L1', 'L2'}:
        return []

    reports = []
    report_modes = ('all',) if risk == 'L4' else ('smart', 'all')
    for mode in report_modes:
        file = root / '.test-artifacts' / ('latest-' + mode + '.json')
        if file.is_file():
            try:
                reports.append(json.loads(file.read_text()))
            except ValueError:
                continue
    if not reports:
        command = './scripts/test.sh all --task ' if risk == 'L4' else './scripts/test.sh smart --task '
        return ['no completed local verification report exists; run ' + command + task.relative_to(root).as_posix()]
    failures = [validate_report(root, task, report, changes) for report in reports]
    if any(not errors for errors in failures):
        return []
    return list(dict.fromkeys(error for group in failures for error in group))
