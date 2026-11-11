"""Freeze main, test locally and prebuild releases, then explicitly publish components."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import subprocess
import time
import uuid

from scripts.release_gate import REPO, ROOT, command, deployed, verify, version

STATE = ROOT / '.dev/release/candidate.json'


def write_state(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    os.replace(temporary, STATE)


def plan(frontend, backend, sha):
    rows = []
    for component, value in [('backend', backend), ('frontend', frontend)]:
        if value is None:
            continue
        if value == 'auto':
            # Offline legacy preview only; prepare resolves auto from the deployed version.
            if component != 'frontend':
                raise ValueError('offline backend preview requires an explicit version')
            value = (ROOT / 'frontend/VERSION').read_text().strip()
        value = version(value)
        rows.append(dict(component=component, version=value, tag=f'{component}/v{value}', commit=sha,
                         workflow=f'{component}-release.yml',
                         artifact='frontend/dist' if component == 'frontend' else 'backend/build/libs/*.jar'))
    if not rows:
        raise ValueError('select a component or use --prepare for automatic change detection')
    return rows


def require_main():
    if command('git', 'branch', '--show-current') != 'main':
        raise ValueError('prepare/publish only from the main branch')
    if command('git', 'status', '--porcelain'):
        raise ValueError('worktree is dirty; commit and push explicitly before preparing')
    origin = command('git', 'remote', 'get-url', 'origin')
    if origin not in (f'https://github.com/{REPO}.git', f'https://github.com/{REPO}', f'git@github.com:{REPO}.git'):
        raise ValueError('origin must be the YuanHub Monorepo')
    command('git', 'fetch', 'origin', 'main')
    sha = command('git', 'rev-parse', 'HEAD')
    if sha != command('git', 'rev-parse', 'origin/main'):
        raise ValueError('local HEAD differs from remote main; no automatic merge/reset')
    return sha


def variables():
    return {v['name']: v['value'] for v in json.loads(command(
        'gh', 'variable', 'list', '--repo', REPO, '--json', 'name,value'))}


def next_patch(value):
    major, minor, patch = value.split('-', 1)[0].split('.')
    return f'{major}.{minor}.{int(patch) + 1}'


def changed(component, baseline, sha):
    base = baseline['commit']
    command('git', 'cat-file', '-e', base + '^{commit}')
    command('git', 'merge-base', '--is-ancestor', base, sha)
    paths = command('git', 'diff', '--name-only', '--no-renames', base, sha, '--').splitlines()
    selected = [p for p in paths if p.startswith(component + '/') or
                not p.startswith(('frontend/', 'backend/', 'docs/'))]
    return selected


def dispatch(workflow, inputs, title):
    command('gh', 'workflow', 'run', workflow, '--repo', REPO, '--ref', 'main',
            *[arg for key, value in inputs.items() for arg in ('-f', f'{key}={value}')])
    # A unique request id avoids selecting somebody else's run for the same SHA.
    for _ in range(30):
        runs = json.loads(command('gh', 'run', 'list', '--repo', REPO, '--workflow', workflow,
                                  '--event', 'workflow_dispatch', '--limit', '100',
                                  '--json', 'databaseId,displayTitle'))
        matches = [r for r in runs if r['displayTitle'] == title]
        if len(matches) == 1:
            return matches[0]['databaseId']
        time.sleep(2)
    raise ValueError('dispatch accepted but run not located; inspect Actions before retrying')


def local_test_commands(component, stress):
    if component == 'frontend':
        return [('frontend', ['npm', 'run', 'test:static'])]
    gradle = ['./gradlew', 'ktlintCheck', 'test', 'criticalTest', '--console=plain']
    if stress:
        gradle.append('stressTest')
    return [('backend', gradle), ('backend', ['node', '--test',
            'scripts/migrations/20260907-level-catalog.test.js',
            'scripts/migrations/20261015-recruitment-duplicate-pools.test.js']),
            ('backend/scripts/beta', ['npm', 'test'])]


def run_local_tests(state):
    started = time.time()
    folder = ROOT / '.dev/release/logs' / state['sha']
    folder.mkdir(parents=True, exist_ok=True)
    components = [row['component'] for row in state['rows']]

    def run_component(component):
        results = []
        commands = local_test_commands(component, state['stress'])
        if component == 'backend' and not (ROOT / 'backend/scripts/beta/node_modules').is_dir():
            commands.insert(-1, ('backend/scripts/beta', ['npm', 'ci']))
        for index, (cwd, args) in enumerate(commands, 1):
            log = folder / f'{component}-{index}.log'
            result = dict(component=component, cwd=cwd, command=args, log=str(log), started_at=time.time())
            print(f'Local: {cwd}: {" ".join(args)} -> {log}', flush=True)
            env = os.environ.copy()
            if cwd == 'backend/scripts/beta':
                # Keep the existing beta Mongo coverage enabled on the local test instance.
                env['BETA_TEST_MONGO_URI'] = 'mongodb://127.0.0.1:27017/yuanhub_test_beta_release?replicaSet=rs0&directConnection=true'
            with log.open('w') as output:
                try:
                    result['returncode'] = subprocess.run(args, cwd=ROOT / cwd, env=env,
                                                          stdout=output, stderr=subprocess.STDOUT).returncode
                except OSError as error:
                    result['returncode'] = None
                    output.write(str(error) + '\n')
            result['finished_at'] = time.time()
            results.append(result)
        return results

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [result for group in pool.map(run_component, components) for result in group]
    return dict(sha=state['sha'], components=components, stress=state['stress'], commands=results,
                started_at=started, finished_at=time.time(), success=all(r['returncode'] == 0 for r in results))


def run_status(run_id):
    return dict(run_id=run_id, **json.loads(command('gh', 'run', 'view', str(run_id), '--repo', REPO,
                                                  '--json', 'status,conclusion,headSha,url')))


def wait_run(run_id):
    try:
        command('gh', 'run', 'watch', str(run_id), '--repo', REPO, '--exit-status')
    except subprocess.CalledProcessError:
        pass  # Read the terminal status even when watch reports a failed job.
    return run_status(run_id)


def validate_preparation(state):
    local = state.get('local_tests') or {}
    components = {row['component'] for row in state['rows']}
    results = local.get('commands', [])
    recorded = {(r['component'], r['cwd'], tuple(r['command'])) for r in results}
    required = {(c, cwd, tuple(args)) for c in components for cwd, args in local_test_commands(c, state['stress'])}
    if (local.get('sha') != state['sha'] or local.get('success') is not True or
            local.get('stress') != state['stress'] or not components.issubset(local.get('components', [])) or
            not required.issubset(recorded) or any(r.get('returncode') != 0 for r in results)):
        raise ValueError('local tests are missing, failed or mismatched; rerun ./release.sh --prepare')
    if 'frontend' in components:
        frontend = state.get('frontend_prepare_run') or {}
        if (not frontend.get('run_id') or frontend.get('headSha') != state['sha'] or
                frontend.get('status') != 'completed' or frontend.get('conclusion') != 'success'):
            raise ValueError('frontend prebuild is missing or unsuccessful; rerun ./release.sh --prepare')


def prepare(args):
    sha = require_main()
    config = variables()
    baselines = {c: deployed(config, c) for c in ('frontend', 'backend')}
    selected = {}
    changes = {}
    explicit = args.frontend is not None or args.backend is not None
    for component in ('frontend', 'backend'):
        changes[component] = changed(component, baselines[component], sha)
        value = getattr(args, component)
        if (not explicit and changes[component]) or value is not None:
            selected[component] = next_patch(baselines[component]['version']) if value in (None, 'auto') else version(value)
            if selected[component] == baselines[component]['version']:
                raise ValueError('choose a new version; deployed versions are immutable')
    if not selected:
        raise ValueError('no deployable changes since the current production versions')
    rows = plan(selected.get('frontend'), selected.get('backend'), sha)
    for row in rows:
        ensure_tag(row, create=False)
    state = dict(sha=sha, rows=rows, baselines=baselines, changes=changes,
                 frontend_api_base=config.get('YUANHUB_FRONTEND_API_BASE', ''), stress=args.stress,
                 request=uuid.uuid4().hex)
    print(json.dumps(state, indent=2, ensure_ascii=False), flush=True)
    if args.dry_run:
        return
    write_state(state)
    inputs = dict(commit=sha, frontend_version=selected.get('frontend', ''),
                  backend_version=selected.get('backend', ''), stress=str(args.stress).lower(), request=state['request'], baselines=json.dumps(baselines))
    failures = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = {'local_tests': pool.submit(run_local_tests, state)}
        try:
            state['run_id'] = dispatch('release-check.yml', inputs, f'Check {sha} [{state["request"]}]')
            write_state(state)
            pending['check_run'] = pool.submit(wait_run, state['run_id'])
            if 'frontend' in selected:
                row = next(r for r in rows if r['component'] == 'frontend')
                frontend_inputs = dict(tag=row['tag'], phase='prepare', commit=sha, request=state['request'],
                                       check_run=str(state['run_id']), confirmation=f'deploy {row["tag"]}@{sha}')
                frontend_id = dispatch(row['workflow'], frontend_inputs, f'Deploy {row["tag"]} [{state["request"]}]')
                state['frontend_prepare_run'] = dict(run_id=frontend_id, status='queued', conclusion=None)
                write_state(state)
                pending['frontend_prepare_run'] = pool.submit(wait_run, frontend_id)
        except (ValueError, OSError, subprocess.CalledProcessError) as error:
            failures.append(f'dispatch: {error}; Actions: https://github.com/{REPO}/actions')
        for name, future in pending.items():
            try:
                state[name] = future.result()
                if name == 'local_tests':
                    failures.extend(f'local: {r["cwd"]}: {" ".join(r["command"])} -> {r["log"]}'
                                    for r in state[name]['commands'] if r['returncode'] != 0)
                elif (state[name]['status'] != 'completed' or state[name]['conclusion'] != 'success' or
                      state[name]['headSha'] != sha):
                    failures.append(f'{name}: {state[name]}')
            except (ValueError, OSError, subprocess.CalledProcessError) as error:
                run_id = state.get('run_id') if name == 'check_run' else (state.get(name) or {}).get('run_id')
                failures.append(f'{name}: {error}; https://github.com/{REPO}/actions/runs/{run_id}'
                                if run_id else f'{name}: {error}; logs: {ROOT / ".dev/release/logs" / sha}')
            write_state(state)
    if not failures:
        try:
            candidate_evidence(state, config)
        except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
            failures.append(f'candidate evidence: {error}; https://github.com/{REPO}/actions/runs/{state["run_id"]}')
    if command('git', 'rev-parse', 'HEAD') != sha or command('git', 'status', '--porcelain'):
        failures.append('HEAD or worktree changed during prepare; rerun ./release.sh --prepare')
    if failures:
        if 'local_tests' in state:
            state['local_tests']['success'] = False
        write_state(state)
        raise ValueError('Prepare failed:\n' + '\n'.join(failures))
    validate_preparation(state)
    print(f'ready: {sha}\nLogs: {ROOT / ".dev/release/logs" / sha}\n'
          f'Check: https://github.com/{REPO}/actions/runs/{state["run_id"]}\nNext: ./release.sh --publish')


def ensure_tag(row, create=False):
    tag = row['tag']
    refs = command('git', 'ls-remote', '--tags', 'origin', 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}').splitlines()
    if refs:
        resolved = {line.split()[1]: line.split()[0] for line in refs}
        target = resolved.get('refs/tags/' + tag + '^{}', resolved.get('refs/tags/' + tag))
        if target != row['commit']:
            raise ValueError(tag + ' exists; never move an immutable tag')
        return
    if create:
        local = command('git', 'tag', '--list', tag)
        if local:
            if command('git', 'rev-parse', tag + '^{commit}') != row['commit']:
                raise ValueError('conflicting local tag: ' + tag)
        else:
            command('git', 'tag', '-a', tag, row['commit'], '-m', f'{tag} verified release')
        command('git', 'push', 'origin', 'refs/tags/' + tag)


def candidate_evidence(state, config):
    manifest = verify(state['run_id'], state['sha'], api_base=config.get('YUANHUB_FRONTEND_API_BASE', ''))
    expected = {c: next((r['version'] for r in state['rows'] if r['component'] == c), '') for c in ('frontend', 'backend')}
    if state['rows'] != plan(expected['frontend'] or None, expected['backend'] or None, state['sha']):
        raise ValueError('local candidate tags/commits/workflows differ from the frozen plan')
    if (manifest['versions'] != expected or manifest.get('stress') != state['stress'] or
            manifest.get('baselines') != state['baselines']):
        raise ValueError('local candidate differs from validated versions/risk checks; prepare again')
    return manifest


def publish(args, state):
    validate_preparation(state)
    if state.get('frontend_prepare_run'):
        state['frontend_prepare_run'] = run_status(state['frontend_prepare_run']['run_id'])
        validate_preparation(state)
    require_main()
    config = variables()
    candidate_evidence(state, config)
    command('git', 'merge-base', '--is-ancestor', state['sha'], 'origin/main')
    if config.get('YUANHUB_MONOREPO_DEPLOY_ENABLED') != 'true':
        raise ValueError('deployment channel is disabled; enable only after a separate approved cutover')
    for row in state['rows']:
        ensure_tag(row)
    print(json.dumps(state, indent=2, ensure_ascii=False), flush=True)
    if args.dry_run:
        return
    if not args.yes and input(f'Publish frozen {state["sha"]} to production? Type publish: ') != 'publish':
        raise ValueError('publication cancelled')
    for row in state['rows']:  # backend first; watch includes readiness and public health checks.
        current = deployed(config, row['component'])
        expected = dict(version=row['version'], commit=state['sha'])
        if current == expected:
            print(row['tag'] + ' already deployed; skipping')
            continue
        if current != state['baselines'][row['component']]:
            raise ValueError('production changed since prepare; freeze a new candidate')
        candidate_evidence(state, config)
        ensure_tag(row, create=True)
        key = row['component'] + '_deploy_run'
        if key not in state:
            request = uuid.uuid4().hex
            inputs = dict(tag=row['tag'], phase='release', commit=state['sha'], request=request,
                          check_run=str(state['run_id']), confirmation=f'deploy {row["tag"]}@{state["sha"]}')
            state[key] = dispatch(row['workflow'], inputs, f'Deploy {row["tag"]} [{request}]')
            write_state(state)
        try:
            command('gh', 'run', 'watch', str(state[key]), '--repo', REPO, '--exit-status')
        except subprocess.CalledProcessError:
            failed = state.pop(key)
            write_state(state)
            raise ValueError(f'Deploy failed: https://github.com/{REPO}/actions/runs/{failed}; inspect failure before retry/rollback')
        if deployed(config, row['component']) != expected:
            raise ValueError(row['component'] + ' production metadata mismatch after deployment')
        print(row['tag'] + ' healthy')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare', action='store_true')
    mode.add_argument('--publish', action='store_true')
    mode.add_argument('--status', action='store_true')
    parser.add_argument('--frontend', nargs='?', const='auto')
    parser.add_argument('--backend', nargs='?', const='auto')
    parser.add_argument('--stress', action='store_true', help='Include scale-sensitive isolated backend suite')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--yes', action='store_true', help='Explicit approval for production publication')
    args = parser.parse_args()
    if args.status or args.publish:
        if args.frontend or args.backend or args.stress:
            raise ValueError('status/publish use the frozen candidate; prepare again to change it')
        state = json.loads(STATE.read_text())
        if args.publish:
            publish(args, state)
        else:
            print('Local tests: ' + json.dumps(state.get('local_tests'), indent=2))
            print('Release check: ' + json.dumps(run_status(state['run_id']) if state.get('run_id') else None))
            if state.get('frontend_prepare_run'):
                state['frontend_prepare_run'] = run_status(state['frontend_prepare_run']['run_id'])
            print('Frontend prepare: ' + json.dumps(state.get('frontend_prepare_run')))
            validate_preparation(state)
            candidate_evidence(state, variables())
            print('This candidate passed; production publication still requires explicit approval.')
    elif args.dry_run and not args.prepare:
        print(json.dumps(plan(args.frontend, args.backend, command('git', 'rev-parse', 'HEAD')), indent=2))
    elif args.prepare:
        prepare(args)
    else:
        raise ValueError('choose --prepare, --status, --publish or --dry-run; no implicit publication')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
