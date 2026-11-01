#!/usr/bin/env python3
"""One local entrypoint. Failures stay failures, including missing services and test gaps."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from impact import changed_files, current_task, coverage_gaps, fingerprint, infer

ROOT = Path(__file__).resolve().parents[2]


def environment():
    env = os.environ.copy()
    bins = ['/opt/homebrew/bin', '/usr/local/bin']
    env['PATH'] = os.pathsep.join(bins + [env.get('PATH', '')])
    if not shutil.which('node', path=env['PATH']):
        versions = sorted((Path.home() / '.nvm/versions/node').glob('v*/bin'),
                          key=lambda p: tuple(int(n) for n in re.findall(r'\d+', p.parent.name)), reverse=True)
        if versions:
            env['PATH'] = str(versions[0]) + os.pathsep + env['PATH']
    if sys.platform == 'darwin' and not env.get('JAVA_HOME'):
        result = subprocess.run(['/usr/libexec/java_home', '-v', '21'], capture_output=True, text=True)
        if result.returncode == 0:
            env['JAVA_HOME'] = result.stdout.strip()
    for key in list(env):
        if key.startswith(('SPRING_', 'SHARE_', 'YUANHUB_BETA_')) or key in {'PLANNER_TEST_MONGO_URI', 'BETA_TEST_MONGO_URI', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS'}:
            env.pop(key)
    # Defense in depth; Gradle test JVM properties and the pre-bean test guard
    # enforce these too. No live URI is ever accepted by the runner.
    env.update({
        'SPRING_PROFILES_ACTIVE': 'test',
        'SPRING_DATA_MONGODB_URI': 'mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50',
        'SHARE_MONGO_HUB_URI': 'mongodb://127.0.0.1:1/yuanhub_test_unit_hub?serverSelectionTimeoutMS=50&connectTimeoutMS=50',
        'SPRING_DATA_REDIS_URL': 'redis://127.0.0.1:1',
        'PYTHONDONTWRITEBYTECODE': '1', 'FC_SEED': env.get('FC_SEED', '20260922'),
    })
    return env


def junit_counts(directory):
    counts = dict(tests=0, failures=0, errors=0, skipped=0)
    for path in directory.glob('TEST-*.xml'):
        xml = ET.parse(path).getroot()
        for key in counts:
            counts[key] += int(xml.get(key, '0'))
    counts['passed'] = counts['tests'] - counts['failures'] - counts['errors'] - counts['skipped']
    return counts


def build_commands(mode, impact):
    front, back = ROOT / 'frontend', ROOT / 'backend'
    commands = [('runner-self-tests', ROOT, [sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts/testing', '-p', 'test_*.py']),
                ('frontend-source', front, ['npm', 'run', 'test:static']),
                ('backend-compile', back, ['./gradlew', 'compileTestKotlin', '--console=plain'])]
    if mode == 'stress':
        commands += [('backend-ktlint', back, ['./gradlew', 'ktlintCheck', '--console=plain']),
                     ('architecture', back, ['./gradlew', 'architectureTest', '--console=plain']),
                     ('stress', back, ['./gradlew', 'stressTest', '--console=plain'])]
        return commands
    if mode == 'all' or impact['conservative_full']:
        commands += [('frontend-node', front, ['npm', 'run', 'test:repo']), ('frontend-behavior', front, ['npm', 'run', 'test:behavior'])]
        unit = ['./gradlew', 'test', '--console=plain']
    else:
        node_files = [path for path in impact['node'] if path != 'test/contract.test.js']
        if node_files:
            commands.append(('frontend-node', front, ['node', '--test', *node_files]))
        if impact['behavior']:
            commands.append(('frontend-behavior', front, ['npm', 'run', 'test:behavior', '--', *impact['behavior']]))
        unit = ['./gradlew', 'test', '--console=plain'] + [v for name in impact['unit'] for v in ('--tests', name)]
    if mode == 'all' or impact['conservative_full'] or 'test/contract.test.js' in impact['node']:
        commands.append(('frontend-contract', front, ['npm', 'run', 'test:contract']))
    if mode == 'all' or impact['unit'] or impact['conservative_full']:
        commands.append(('backend-unit', back, unit))
    if impact.get('kotlin_files'):
        # The ktlint Gradle plugin does not fingerprint our dynamic ktlintFiles
        # filter for UP-TO-DATE/build-cache reuse. Force this targeted check to
        # execute so a previous full-source lint result cannot leak into it.
        commands.append(('backend-ktlint-affected', back, ['./gradlew', 'ktlintCheck', '-PstrictKtlint=true',
                                                         '-PktlintFiles=' + ','.join(impact['kotlin_files']), '--rerun-tasks', '--console=plain']))
    commands += [('backend-ktlint', back, ['./gradlew', 'ktlintCheck', '--console=plain']),
                 ('architecture', back, ['./gradlew', 'architectureTest', '--console=plain'])]
    if mode in ('smart', 'all'):
        # All four Mongo domain suites plus real Redis form a bounded isolated
        # suite. Conservative execution also catches account-cascade regressions.
        if mode == 'all' or impact['integration'] or impact['conservative_full']:
            commands.append(('integration', back, ['./gradlew', 'integrationTest', '--console=plain']))
        if mode == 'all':
            commands.append(('realistic', back, ['./gradlew', 'realisticTest', '--console=plain']))
        if mode == 'all' or impact['api'] or impact['conservative_full'] or set(impact['domains']) & {'account', 'admin', 'beta'}:
            commands.append(('api-schema', back, ['./gradlew', 'apiSchemaTest', '--console=plain']))
    if mode == 'all':
        commands += [('frontend-build', front, ['npm', 'run', 'build']),
                     ('backend-build', back, ['./gradlew', 'bootJar', '--console=plain']),
                     ('mutation', back, ['./gradlew', 'pitest', '--console=plain'])]
    return commands


def execute(label, directory, command, env, output, timeout):
    log = output / (label + '.log')
    start = time.monotonic()
    print(f'\n[{label}] ' + ' '.join(command), flush=True)
    try:
        with log.open('w') as stream:
            result = subprocess.run(command, cwd=directory, env=env, stdout=stream, stderr=subprocess.STDOUT, timeout=timeout)
            code = result.returncode
    except FileNotFoundError as error:
        code = 127; log.write_text(str(error) + '\nRun ./scripts/test.sh doctor and install the missing local dependency.\n')
    except subprocess.TimeoutExpired:
        code = 124
        with log.open('a') as stream:
            stream.write('\nTIMEOUT: the command did not complete; this is not a pass.\n')
    result = {'name': label, 'command': command, 'cwd': str(directory.relative_to(ROOT)),
              'exit_code': code, 'seconds': round(time.monotonic() - start, 2), 'log': str(log.relative_to(ROOT))}
    print(f'[{label}] {"PASS" if code == 0 else "FAIL"} ({result["seconds"]}s) — {result["log"]}', flush=True)
    if code:
        print('\n'.join(log.read_text(errors='replace').splitlines()[-14:]), flush=True)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['quick', 'smart', 'all', 'stress', 'plan', 'doctor'])
    parser.add_argument('--task', help='Explicit .trellis/tasks/<task> when several contexts are active')
    parser.add_argument('--base', help='Git base ref in the current monorepo')
    parser.add_argument('--timeout', type=int, default=900, help='Per-command timeout in seconds')
    args = parser.parse_args(argv)
    env = environment()
    if args.mode == 'doctor':
        commands = [('Node', ['node', '--version']), ('npm', ['npm', '--version']), ('Java', ['java', '-version']), ('Local databases', ['bash', 'backend/scripts/dev-up.sh'])]
        failed = False
        for label, command in commands:
            try:
                result = subprocess.run(command, env=env, cwd=ROOT, capture_output=True, text=True, timeout=20)
                print(f'{label}: ' + (result.stdout + result.stderr).strip()); failed |= result.returncode != 0
            except (OSError, subprocess.TimeoutExpired) as error:
                print(f'{label}: {error}'); failed = True
        print('Python:', sys.version.split()[0])
        return int(failed)
    task = current_task(ROOT, args.task)
    changes = changed_files(ROOT, args.base)
    impact = infer(ROOT, changes, task)
    impact['kotlin_files'] = [p.removeprefix('backend/') for p in changes if p.startswith('backend/') and p.endswith(('.kt', '.kts')) and (ROOT / p).is_file()]
    gaps, reviewed = coverage_gaps(ROOT, changes, task)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    output = ROOT / '.test-artifacts/runs' / (stamp + '-' + args.mode)
    output.mkdir(parents=True)
    report = {'mode': args.mode, 'started_at': stamp, 'task': task.relative_to(ROOT).as_posix() if task else None,
              'fingerprint': fingerprint(ROOT, changes, task), 'changes': changes, 'impact': impact,
              'missing_tests': gaps, 'reviewed_coverage': reviewed, 'checks': []}
    print('Task:', report['task'] or '(not resolved; use --task for the completion gate)')
    print('Changed files:', len(changes), '| affected domains:', ', '.join(impact['domains']) or '(shared)')
    print(f'Selected: {len(impact["node"])} node files, {len(impact["behavior"])} component files, {len(impact["unit"])} backend unit classes')
    if gaps:
        print('Missing reviewed tests/explanation for:\n  ' + '\n  '.join(gaps))
    if args.mode != 'plan':
        for label, directory, command in build_commands(args.mode, impact):
            report['checks'].append(execute(label, directory, command, env, output, args.timeout))
        tasks = {
            'backend-unit': 'test',
            'integration': 'integrationTest',
            'realistic': 'realisticTest',
            'stress': 'stressTest',
            'architecture': 'architectureTest',
            'api-schema': 'apiSchemaTest',
        }
        report['junit'] = {name: junit_counts(ROOT / 'backend/build/test-results' / task_name)
                           for name, task_name in tasks.items() if any(c['name'] == name for c in report['checks'])}
    report['success'] = (args.mode != 'plan' and all(c['exit_code'] == 0 for c in report['checks'])
                         and not any(c['skipped'] or c['tests'] == 0 for c in report.get('junit', {}).values())
                         and (not gaps or args.mode == 'quick'))
    manifest = json.loads((task / 'test-plan.json').read_text()) if task and (task / 'test-plan.json').is_file() else {}
    report['remaining_completion_checks'] = sorted(set(manifest.get('mandatory_checks', [])) - {c['name'] for c in report['checks']})
    report['completion_eligible'] = report['success'] and args.mode in ('smart', 'all') and task is not None and not report['remaining_completion_checks']
    (output / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    latest = ROOT / '.test-artifacts' / ('latest-' + args.mode + '.json')
    latest.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    lines = [f'# {args.mode} — {"PASS" if report["success"] else "NOT PASSED"}', '',
             f'Task: {report["task"]}', f'Fingerprint: `{report["fingerprint"]}`', '',
             *[f'- {c["name"]}: exit {c["exit_code"]}, {c["seconds"]}s — `{c["log"]}`' for c in report['checks']], '',
             'Missing-test explanations: ' + (', '.join(gaps) if gaps else 'none'), '',
             'Selection is conservative relevance analysis, not a proof that every business invariant is covered.']
    (output / 'report.md').write_text('\n'.join(lines) + '\n')
    print('\nReport:', output.relative_to(ROOT) / 'report.md')
    print('Completion gate:', 'eligible' if report['completion_eligible'] else 'not eligible')
    return 0 if args.mode == 'plan' or report['success'] else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f'TEST HARNESS ERROR: {error}', file=sys.stderr)
        raise SystemExit(2)
