"""Exercise release scripts with disposable Git remotes and an offline GitHub CLI.

Run: python3 scripts/testing/test_release_workflow.py
No real repository, network, service or GitHub credentials are used.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
REPOS = ('YuanHub', 'BackEndV3-Share')

PROXY = r'''
import json, os, pathlib, subprocess, sys, time
args = sys.argv[1:]
root = pathlib.Path(os.environ['RELEASE_FIXTURE'])
tool = pathlib.Path(sys.argv[0]).name
directory = pathlib.Path.cwd()
if tool == 'git' and args[:1] == ['-C']:
    directory = pathlib.Path(args[1]); args = args[2:]
def record(kind, **data):
    with (root / 'events.jsonl').open('a') as stream:
        stream.write(json.dumps(dict(kind=kind, tool=tool, directory=directory.name, **data)) + '\n')
def git(*command, cwd=None):
    return subprocess.check_output([os.environ['REAL_GIT'], *command], cwd=cwd, text=True).strip()
def flag(name):
    return args[args.index(name) + 1]
record('call', args=args)
if tool == 'git':
    if args == ['remote', 'get-url', 'origin']:
        print('https://github.com/fixture/' + directory.name + '.git'); sys.exit(0)
    result = subprocess.run([os.environ['REAL_GIT'], *args], cwd=directory)
    sys.exit(result.returncode)
if args[:2] == ['auth', 'status']:
    sys.exit(1 if os.environ.get('AUTH_FAIL') else 0)
if args[:2] == ['variable', 'get']:
    sys.exit(1)  # Disable the optional public curl check: never contact a real site.
if args[:2] == ['workflow', 'run']:
    name = flag('--repo').split('/')[1]
    assert args[2] == 'release.yml' and flag('--ref') == 'main'
    fields = dict(a.split('=', 1) for i, a in enumerate(args) if args[i-1] == '-f')
    assert fields['phase'] == 'prepare' and len(fields['commit']) == 40
    if os.environ.get('DISPATCH_FAIL') == name:
        sys.exit(9)
    (root / (name + '.prepare.json')).write_text(json.dumps(fields))
    sys.exit(0)
if args[:2] == ['run', 'list']:
    if os.environ.get('API_FAIL'):
        print('offline API failure', file=sys.stderr); sys.exit(9)
    name = flag('--repo').split('/')[1]
    workflow, branch = flag('--workflow'), flag('--branch')
    if flag('--event') == 'workflow_dispatch':
        assert workflow == 'release.yml' and branch == 'main' and '--commit' not in args
        fields = json.loads((root / (name + '.prepare.json')).read_text())
        title = 'Prepare {tag} @ {commit} [{request}]'.format(**fields)
        assert title in flag('--jq'), 'must match this request, not a stale successful preparation'
        # Dispatch head may differ from the requested SHA; head filtering would miss this run.
        print(name + ':prepare:' + fields['commit']); sys.exit(0)
    sha = flag('--commit')
    assert flag('--event') == 'push'
    if '--status' in args:
        # Model GitHub's filtering for the actual shell gate extracted from YAML.
        records = json.loads(os.environ.get('CI_RECORDS', '[]'))
        matches = [r for r in records if r['sha'] == sha and r['branch'] == branch
                   and r['event'] == flag('--event') and r['status'] == flag('--status')]
        print('123' if matches else ''); sys.exit(0)
    remote = root / 'remotes' / (name + '.git')
    ref = 'refs/heads/main' if workflow == 'ci.yml' else 'refs/tags/' + branch + '^{}'
    assert git('--git-dir=' + str(remote), 'rev-parse', ref) == sha
    print(name + ':' + workflow + ':' + sha); sys.exit(0)
if args[:2] == ['run', 'watch']:
    name, workflow, sha = args[2].split(':')
    assert flag('--repo') == 'fixture/' + name and '--exit-status' in args
    if workflow in ('ci.yml', 'prepare'):
        (root / (name + '.' + workflow + '.watch')).touch()
        if os.environ.get('WAIT_ALL'):
            deadline = time.monotonic() + 4
            while not all((root / (r + '.' + w + '.watch')).exists()
                          for r in ('YuanHub', 'BackEndV3-Share') for w in ('ci.yml', 'prepare')):
                assert time.monotonic() < deadline, 'CI and prepares must run in parallel'
                time.sleep(.02)
    if workflow == 'ci.yml':
        (root / (name + '.watch')).touch()
        if os.environ.get('WAIT_BOTH'):
            deadline = time.monotonic() + 4
            while not all((root / (r + '.watch')).exists() for r in ('YuanHub', 'BackEndV3-Share')):
                assert time.monotonic() < deadline, 'CI watches must run in parallel'
                time.sleep(.02)
        if os.environ.get('MUTATE_ON_CI') == name:
            repo = root / name
            (repo / 'changed.txt').write_text('changed while waiting')
            git('add', 'changed.txt', cwd=repo); git('commit', '-m', 'fixture mutation', cwd=repo)
        if os.environ.get('DIRTY_ON_CI') == name:
            (root / name / 'dirty.txt').write_text('changed while waiting')
        if os.environ.get('BRANCH_ON_CI') == name:
            git('checkout', '-b', 'changed-during-ci', cwd=root / name)
        failed = os.environ.get('FAIL_CI') == name
    elif workflow == 'prepare':
        failed = os.environ.get('FAIL_PREPARE') == name
    else:
        if os.environ.get('MUTATE_ON_BACKEND_RELEASE') and name == 'BackEndV3-Share':
            repo = root / 'YuanHub'
            (repo / 'changed.txt').write_text('changed after backend deployment')
            git('add', 'changed.txt', cwd=repo); git('commit', '-m', 'fixture mutation', cwd=repo)
        failed = os.environ.get('FAIL_RELEASE') == name
    record('finished', name=name, workflow=workflow, sha=sha, success=not failed)
    sys.exit(1 if failed else 0)
raise AssertionError('unexpected gh invocation: ' + repr(args))
'''


class ReleaseWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='yuanhub-release-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.env = dict(os.environ, RELEASE_FIXTURE=str(self.root), REAL_GIT=shutil.which('git'),
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1', GIT_TERMINAL_PROMPT='0')
        # Keep user Git hooks, signing and repository discovery out of the fixtures.
        for key in list(self.env):
            if key.startswith('GIT_') and key not in {'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT'}:
                del self.env[key]
        (self.root / 'remotes').mkdir()
        (self.root / 'bin').mkdir()
        for tool in ('git', 'gh'):
            proxy = self.root / 'bin' / tool
            proxy.write_text('#!' + sys.executable + '\n' + PROXY)
            proxy.chmod(0o755)
        for name in REPOS:
            repo = self.root / name
            repo.mkdir()
            self.git(name, 'init', '-b', 'main')
            self.git(name, 'config', 'user.name', 'Release Fixture')
            self.git(name, 'config', 'user.email', 'fixture@example.invalid')
            (repo / 'VERSION').write_text('0.0.1-beta.20\n')
            if name == 'YuanHub':
                shutil.copy2(ROOT / 'scripts/legacy-release/release-frontend.sh', repo)
            else:
                shutil.copy2(ROOT / 'scripts/legacy-release/release-backend.sh', repo)
            self.git(name, 'add', '.')
            self.git(name, 'commit', '-m', 'fixture initial')
            remote = self.root / 'remotes' / (name + '.git')
            subprocess.run([self.env['REAL_GIT'], 'init', '--bare', str(remote)],
                           env=self.env, check=True, capture_output=True)
            self.git(name, 'remote', 'add', 'origin', str(remote))
            self.git(name, 'push', '-u', 'origin', 'main')
            (repo / 'feature.txt').write_text('fixture feature')
            self.git(name, 'add', '.')
            self.git(name, 'commit', '-m', 'fixture feature')
            self.git(name, 'push', 'origin', 'main')
        shutil.copy2(ROOT / 'scripts/legacy-release/release-polyrepo.sh', self.root / 'release.sh')
        self.env['PATH'] = str(self.root / 'bin') + os.pathsep + self.env['PATH']

    def git(self, name, *args):
        result = subprocess.run([self.env['REAL_GIT'], '-C', str(self.root / name), *args],
                                env=self.env, check=True, text=True, capture_output=True)
        return result.stdout.strip()

    def run_release(self, *args, **environment):
        return subprocess.run(['bash', str(self.root / 'release.sh'), *args],
                              env=dict(self.env, **environment), text=True, capture_output=True, timeout=20)

    def run_backend_release(self, *args, **environment):
        return subprocess.run(['bash', str(self.root / 'BackEndV3-Share/release-backend.sh'), *args],
                              cwd=self.root, env=dict(self.env, **environment),
                              text=True, capture_output=True, timeout=20)

    def assert_standalone_release(self, name, script, version):
        # Run from outside a moved clone, with no sibling repo or workspace script.
        isolated = self.root / 'isolated clone'
        isolated.mkdir()
        repo = isolated / name
        shutil.move(str(self.root / name), repo)
        (self.root / 'release.sh').unlink()
        result = subprocess.run(['bash', str(repo / script), '--yes', version], cwd=self.root,
                                env=self.env, text=True, capture_output=True, timeout=20)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        tag = 'v0.0.1-beta.20' if version == 'auto' else 'v' + version
        sha = subprocess.check_output([self.env['REAL_GIT'], '-C', str(repo), 'rev-parse', 'HEAD'],
                                      env=self.env, text=True).strip()
        target = subprocess.check_output([self.env['REAL_GIT'], '-C', str(repo), 'rev-parse', tag + '^{}'],
                                         env=self.env, text=True).strip()
        self.assertEqual(sha, target)
        events = self.events()
        tag_index = next(i for i, e in enumerate(events) if e['tool'] == 'git'
                         and e.get('args') == ['push', 'origin', tag])
        self.assertTrue(any(e['kind'] == 'finished' and e.get('workflow') == 'ci.yml'
                            and e['success'] and e['sha'] == sha for e in events[:tag_index]))
        self.assertTrue(any(e['kind'] == 'finished' and e.get('workflow') == 'release.yml'
                            and e['success'] and e['sha'] == sha for e in events[tag_index:]))
        self.assertFalse(any(e['tool'] == 'git' and e['directory'] != name for e in events))
        self.assertFalse(any(e['tool'] == 'gh' and e.get('args', [])[:2] == ['workflow', 'run'] for e in events))

    def test_frontend_entrypoint_releases_without_sibling_or_workspace(self):
        self.assert_standalone_release('YuanHub', 'release-frontend.sh', 'auto')

    def test_backend_entrypoint_releases_without_sibling_or_workspace(self):
        self.assert_standalone_release('BackEndV3-Share', 'release-backend.sh', '0.1.13')

    def test_backend_entrypoint_ci_and_api_failures_create_no_tags(self):
        for environment in ({'FAIL_CI': 'BackEndV3-Share'}, {'API_FAIL': '1'}):
            with self.subTest(environment=environment):
                result = self.run_backend_release('--yes', '0.1.13', **environment)
                self.assertNotEqual(0, result.returncode)
                self.assertIn('没有创建', result.stderr)
                self.assert_no_tags()

    def test_backend_entrypoint_release_failure_preserves_tag(self):
        result = self.run_backend_release('--yes', '0.1.13', FAIL_RELEASE='BackEndV3-Share')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('重跑原 Release', result.stderr)
        sha = self.git('BackEndV3-Share', 'rev-parse', 'HEAD')
        self.assertEqual(sha, self.git('BackEndV3-Share', 'rev-parse', 'v0.1.13^{}'))
        self.assertIn('refs/tags/v0.1.13', self.tags('BackEndV3-Share'))
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [])[:2] == ['tag', '-d'] for e in self.events()))

    def test_backend_entrypoint_dry_run_and_declining_confirmation_are_readonly(self):
        before = self.git('BackEndV3-Share', 'rev-parse', 'HEAD')
        result = self.run_backend_release('--dry-run', 'v0.1.13', AUTH_FAIL='1')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertFalse(any(e['tool'] == 'gh' for e in self.events()))
        result = subprocess.run(['bash', str(self.root / 'BackEndV3-Share/release-backend.sh'), '0.1.13'],
                                input='n\n', env=self.env, text=True, capture_output=True, timeout=10)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('已取消', result.stdout)
        self.assertEqual(before, self.git('BackEndV3-Share', 'rev-parse', 'HEAD'))
        self.assertFalse(any(e['tool'] == 'git' and e['args'][0] in
                             {'fetch', 'merge', 'push', 'commit', 'add', 'tag'} for e in self.events()))
        self.assert_no_tags()

    def test_backend_entrypoint_auth_failure_stops_before_mutation(self):
        result = self.run_backend_release('--yes', '0.1.13', AUTH_FAIL='1')
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(any(e['tool'] == 'git' and e['args'][0] in
                             {'fetch', 'merge', 'push', 'commit', 'add', 'tag'} for e in self.events()))
        self.assert_no_tags()

    def test_backend_entrypoint_rejects_invalid_arguments(self):
        for args in [(), ('auto',), ('../bad',), ('--unknown',), ('0.1.13', '0.1.14'), ('',)]:
            with self.subTest(args=args):
                self.assertNotEqual(0, self.run_backend_release(*args).returncode)
        self.assert_no_tags()

    def test_backend_entrypoint_rejects_dirty_repo_and_wrong_branch(self):
        (self.root / 'BackEndV3-Share/dirty.txt').write_text('uncommitted')
        self.assertNotEqual(0, self.run_backend_release('--yes', '0.1.13').returncode)
        (self.root / 'BackEndV3-Share/dirty.txt').unlink()
        self.git('BackEndV3-Share', 'checkout', '-b', 'feature')
        self.assertNotEqual(0, self.run_backend_release('--yes', '0.1.13').returncode)
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [])[:1] == ['push'] for e in self.events()))
        self.assert_no_tags()

    def test_backend_entrypoint_rejects_existing_remote_tag_after_fetch(self):
        self.git('BackEndV3-Share', 'tag', '-a', 'v0.1.13', '-m', 'existing release')
        self.git('BackEndV3-Share', 'push', 'origin', 'v0.1.13')
        self.git('BackEndV3-Share', 'tag', '-d', 'v0.1.13')
        before = self.tags('BackEndV3-Share')
        result = self.run_backend_release('--yes', '0.1.13')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('已存在', result.stderr)
        self.assertEqual(before, self.tags('BackEndV3-Share'))
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [])[:1] == ['push'] for e in self.events()))

    def test_backend_entrypoint_rejects_diverged_main(self):
        # Remote moves from the shared ancestor while local main has its own feature.
        ancestor = self.git('BackEndV3-Share', 'rev-parse', 'HEAD')
        (self.root / 'BackEndV3-Share/local.txt').write_text('local')
        self.git('BackEndV3-Share', 'add', 'local.txt')
        self.git('BackEndV3-Share', 'commit', '-m', 'local feature')
        tree = self.git('BackEndV3-Share', 'rev-parse', ancestor + '^{tree}')
        remote_commit = self.git('BackEndV3-Share', 'commit-tree', tree, '-p', ancestor, '-m', 'remote feature')
        self.git('BackEndV3-Share', 'push', 'origin', remote_commit + ':refs/heads/main')
        result = self.run_backend_release('--yes', '0.1.13')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('分叉', result.stderr)
        self.assert_no_tags()

    def test_backend_entrypoint_changed_commit_while_ci_waits_creates_no_tags(self):
        result = self.run_backend_release('--yes', '0.1.13', MUTATE_ON_CI='BackEndV3-Share')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('提交已变化', result.stderr)
        self.assert_no_tags()

    def test_backend_entrypoint_dirty_worktree_while_ci_waits_creates_no_tags(self):
        result = self.run_backend_release('--yes', '0.1.13', DIRTY_ON_CI='BackEndV3-Share')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('未提交修改', result.stderr)
        self.assert_no_tags()

    def test_backend_entrypoint_branch_change_while_ci_waits_creates_no_tags(self):
        result = self.run_backend_release('--yes', '0.1.13', BRANCH_ON_CI='BackEndV3-Share')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('main 分支', result.stderr)
        self.assert_no_tags()

    def test_backend_entrypoint_fast_forwards_and_publishes_synced_sha(self):
        before = self.git('BackEndV3-Share', 'rev-parse', 'HEAD')
        self.git('BackEndV3-Share', 'push', 'origin', 'main')
        tree = self.git('BackEndV3-Share', 'rev-parse', 'HEAD^{tree}')
        remote_commit = self.git('BackEndV3-Share', 'commit-tree', tree, '-p', before, '-m', 'remote feature')
        self.git('BackEndV3-Share', 'push', 'origin', remote_commit + ':refs/heads/main')
        result = self.run_backend_release('--yes', '0.1.13')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(remote_commit, self.git('BackEndV3-Share', 'rev-parse', 'HEAD'))
        self.assertEqual(remote_commit, self.git('BackEndV3-Share', 'rev-parse', 'v0.1.13^{}'))

    def events(self):
        file = self.root / 'events.jsonl'
        return [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []

    def tags(self, name):
        return self.git(name, 'ls-remote', '--tags', 'origin')

    def assert_no_tags(self):
        for name in REPOS:
            self.assertEqual('', self.tags(name))
            self.assertEqual('', self.git(name, 'tag', '--list'))

    def both(self, **environment):
        return self.run_release('--yes', '--frontend', '0.0.1-beta.20', '--backend', '0.1.13', **environment)

    def test_ci_is_parallel_and_backend_deploys_first_with_frozen_commits(self):
        result = self.both(WAIT_BOTH='1', WAIT_ALL='1')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        events = self.events()
        tag_pushes = [(i, e) for i, e in enumerate(events) if e['tool'] == 'git'
                      and e.get('args', [])[:2] == ['push', 'origin'] and e['args'][2].startswith('v')]
        self.assertEqual(list(REPOS[::-1]), [e['directory'] for _, e in tag_pushes])
        first_tag = tag_pushes[0][0]
        for name in REPOS:
            self.assertTrue(any(e['kind'] == 'finished' and e['name'] == name and e['workflow'] == 'ci.yml'
                                for e in events[:first_tag]))
            self.assertTrue(any(e['kind'] == 'finished' and e['name'] == name and e['workflow'] == 'prepare'
                                and e['success'] for e in events[:first_tag]))
            sha = self.git(name, 'rev-parse', 'HEAD')
            tag = 'v0.0.1-beta.20' if name == 'YuanHub' else 'v0.1.13'
            self.assertEqual(sha, self.git(name, 'rev-parse', tag + '^{}'))
        self.assertTrue(any(e['kind'] == 'finished' and e['name'] == 'BackEndV3-Share'
                            and e['workflow'] == 'release.yml' and e['success']
                            for e in events[:tag_pushes[1][0]]))

    def test_either_ci_failure_creates_no_tags(self):
        for name in REPOS:
            with self.subTest(name=name):
                result = self.both(FAIL_CI=name, WAIT_BOTH='1')
                self.assertNotEqual(0, result.returncode)
                self.assertIn('没有创建发布 tag', result.stderr)
                self.assert_no_tags()

    def test_either_prepare_or_dispatch_failure_creates_no_tags(self):
        for flag_name in ('FAIL_PREPARE', 'DISPATCH_FAIL'):
            for name in REPOS:
                with self.subTest(flag=flag_name, name=name):
                    result = self.both(**{flag_name: name})
                    self.assertNotEqual(0, result.returncode)
                    self.assertIn('没有创建发布 tag', result.stderr)
                    self.assert_no_tags()

    def test_actual_prepare_validation_rejects_untrusted_requests_and_non_main_commits(self):
        for name in REPOS:
            content = (ROOT / ('frontend' if name == 'YuanHub' else 'backend') / '.github/workflows/release.yml').read_text()
            def step(title):
                block = content.split('      - name: ' + title + '\n', 1)[1]
                block = block.split('\n      - name:', 1)[0].split('        run: |\n', 1)[1].split('\n      #', 1)[0]
                return '\n'.join(line[10:] for line in block.splitlines())
            (self.root / name / 'not-on-main').write_text('fixture')
            self.git(name, 'add', 'not-on-main')
            self.git(name, 'commit', '-m', 'unmerged feature')
            sha = self.git(name, 'rev-parse', 'HEAD')
            valid = dict(DEPLOY_PHASE='prepare', GITHUB_REF='refs/heads/main', REQUESTED_COMMIT=sha,
                         RELEASE_TAG='v0.1.13', PREPARE_REQUEST='fixture-request')
            for override in ({}, {'GITHUB_REF': 'refs/heads/feature'}, {'REQUESTED_COMMIT': 'deadbeef'},
                             {'RELEASE_TAG': 'v../bad'}, {'PREPARE_REQUEST': 'bad"request'}, {'DEPLOY_PHASE': 'bad'}):
                result = subprocess.run(['bash', '-c', step('Validate release request')],
                                        env=dict(self.env, **dict(valid, **override)), capture_output=True)
                self.assertEqual(not override, result.returncode == 0, result.stderr)
            # HEAD is currently ahead of origin/main: a feature-only SHA cannot prepare.
            result = subprocess.run(['bash', '-c', step('Validate prepared commit')], cwd=self.root / name,
                                    env=dict(self.env, **valid), capture_output=True)
            self.assertNotEqual(0, result.returncode)
            self.git(name, 'push', 'origin', 'main')
            result = subprocess.run(['bash', '-c', step('Validate prepared commit')], cwd=self.root / name,
                                    env=dict(self.env, **valid), capture_output=True)
            self.assertEqual(0, result.returncode, result.stderr)
            self.git(name, 'tag', 'v0.1.13')
            result = subprocess.run(['bash', '-c', step('Validate prepared commit')], cwd=self.root / name,
                                    env=dict(self.env, **valid), capture_output=True)
            self.assertNotEqual(0, result.returncode)

    def test_backend_release_failure_does_not_publish_frontend(self):
        result = self.both(FAIL_RELEASE='BackEndV3-Share')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('前端尚未发布', result.stderr)
        self.assertEqual('', self.tags('YuanHub'))
        self.assertIn('refs/tags/v0.1.13', self.tags('BackEndV3-Share'))

    def test_frontend_release_failure_keeps_both_immutable_tags(self):
        result = self.both(FAIL_RELEASE='YuanHub')
        self.assertNotEqual(0, result.returncode)
        for name in REPOS:
            self.assertNotEqual('', self.tags(name))
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [])[:2] == ['tag', '-d'] for e in self.events()))

    def test_dry_run_changes_no_local_or_remote_state(self):
        snapshots = {name: (self.git(name, 'rev-parse', 'HEAD'), self.git(name, 'ls-remote', 'origin'),
                            (self.root / name / 'VERSION').read_text()) for name in REPOS}
        result = self.run_release('--dry-run', '--frontend', 'auto', '--backend', 'v0.1.13', AUTH_FAIL='1')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        for name in REPOS:
            self.assertEqual(snapshots[name], (self.git(name, 'rev-parse', 'HEAD'), self.git(name, 'ls-remote', 'origin'),
                                              (self.root / name / 'VERSION').read_text()))
        self.assertFalse(any(e['tool'] == 'gh' or (e['tool'] == 'git' and e['args'][0] in
                             {'fetch', 'merge', 'push', 'commit', 'add', 'tag'}) for e in self.events()))

    def test_frontend_only_reuses_prepared_version_and_ignores_unselected_backend(self):
        (self.root / 'BackEndV3-Share' / 'dirty.txt').write_text('unselected')
        result = self.run_release('--yes', '--frontend', 'auto')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('refs/tags/v0.0.1-beta.20', self.tags('YuanHub'))
        self.assertEqual('', self.tags('BackEndV3-Share'))
        self.assertFalse(any(e['tool'] == 'git' and e.get('args') == ['push', 'origin', 'main'] for e in self.events()))

    def test_backend_only_does_not_modify_frontend(self):
        before = self.git('YuanHub', 'rev-parse', 'HEAD')
        result = self.run_release('--yes', '--backend', '0.1.13')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(before, self.git('YuanHub', 'rev-parse', 'HEAD'))
        self.assertEqual('', self.tags('YuanHub'))

    def test_frontend_prepare_on_candidate_increments_without_commit_or_push(self):
        self.git('YuanHub', 'tag', 'v0.0.1-beta.20')
        self.git('YuanHub', 'push', 'origin', 'v0.0.1-beta.20')
        self.git('YuanHub', 'checkout', '-b', 'candidate')
        before = self.git('YuanHub', 'rev-parse', 'HEAD')
        script = str(self.root / 'YuanHub/release-frontend.sh')
        preview = subprocess.run(['bash', script, '--dry-run', '--prepare-only', 'auto'], env=self.env, text=True, capture_output=True)
        self.assertEqual(0, preview.returncode, preview.stderr)
        self.assertEqual('0.0.1-beta.20\n', (self.root / 'YuanHub/VERSION').read_text())
        result = subprocess.run(['bash', script, '--yes', '--prepare-only', 'auto'], env=self.env, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual('0.0.1-beta.21\n', (self.root / 'YuanHub/VERSION').read_text())
        self.assertEqual(before, self.git('YuanHub', 'rev-parse', 'HEAD'))
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [None])[0] in {'push', 'commit', 'add', 'tag'} for e in self.events()))
        self.assertEqual('', self.git('YuanHub', 'ls-remote', '--tags', 'origin', 'v0.0.1-beta.21'))

    def test_candidate_prepare_works_in_isolated_clone_and_reuses_unpublished_version(self):
        self.git('YuanHub', 'checkout', '-b', 'candidate')
        isolated = self.root / 'isolated clone'
        isolated.mkdir()
        repo = isolated / 'YuanHub'
        shutil.move(str(self.root / 'YuanHub'), repo)
        shutil.rmtree(self.root / 'BackEndV3-Share')
        (self.root / 'release.sh').unlink()
        result = subprocess.run(['bash', str(repo / 'release-frontend.sh'), '--yes', '--prepare-only', 'auto'],
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual('0.0.1-beta.20\n', (repo / 'VERSION').read_text())
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [None])[0] in {'push', 'commit', 'add', 'tag'} for e in self.events()))

    def test_existing_frontend_remote_tag_rejects_release(self):
        self.git('YuanHub', 'tag', 'v0.0.1-beta.20')
        self.git('YuanHub', 'push', 'origin', 'v0.0.1-beta.20')
        self.git('YuanHub', 'tag', '-d', 'v0.0.1-beta.20')
        result = self.run_release('--yes', '--frontend', '0.0.1-beta.20')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('已存在', result.stderr)
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [None])[0] == 'push' for e in self.events()))
        self.assertEqual('', self.tags('BackEndV3-Share'))

    def test_frontend_prepare_rejects_main_and_release_rejects_unprepared_version(self):
        script = str(self.root / 'YuanHub/release-frontend.sh')
        for args in (['--yes', '--prepare-only', '0.0.1-beta.21'], ['--yes', '0.0.1-beta.21']):
            result = subprocess.run(['bash', script, *args], env=self.env, text=True, capture_output=True)
            self.assertNotEqual(0, result.returncode)
        self.assertEqual('0.0.1-beta.20\n', (self.root / 'YuanHub/VERSION').read_text())
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [None])[0] in {'push', 'commit', 'add', 'tag'} for e in self.events()))
        self.assert_no_tags()

    def test_unmerged_main_is_not_pushed_or_released(self):
        for name in REPOS:
            (self.root / name / 'unmerged').write_text('fixture')
            self.git(name, 'add', 'unmerged')
            self.git(name, 'commit', '-m', 'unmerged')
        result = self.both()
        self.assertNotEqual(0, result.returncode)
        self.assertIn('尚未合并到远端', result.stderr)
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [None])[0] == 'push' for e in self.events()))
        self.assert_no_tags()

    def test_frontend_stale_expected_commit_is_rejected_before_version_update(self):
        result = subprocess.run(['bash', str(self.root / 'YuanHub/release-frontend.sh'),
                                 '--yes', '--expected-commit', 'a' * 40, '0.0.1-beta.20'],
                                env=self.env, text=True, capture_output=True, timeout=10)
        self.assertNotEqual(0, result.returncode)
        self.assertIn('提交已变化', result.stderr)
        self.assertEqual('0.0.1-beta.20\n', (self.root / 'YuanHub/VERSION').read_text())
        self.assert_no_tags()

    def test_auth_failure_stops_before_version_update_or_push(self):
        result = self.both(AUTH_FAIL='1')
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('0.0.1-beta.20\n', (self.root / 'YuanHub/VERSION').read_text())
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [])[:1] == ['push'] for e in self.events()))
        self.assert_no_tags()

    def test_declining_confirmation_changes_no_version_or_refs(self):
        result = subprocess.run(['bash', str(self.root / 'release.sh'), '--frontend', 'auto', '--backend', '0.1.13'],
                                input='n\n', env=self.env, text=True, capture_output=True, timeout=10)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('已取消', result.stdout)
        self.assertFalse(any(e['tool'] == 'git' and e['args'][0] in
                             {'fetch', 'merge', 'push', 'commit', 'add', 'tag'} for e in self.events()))
        self.assert_no_tags()

    def test_dirty_selected_repo_stops_before_main_push(self):
        (self.root / 'BackEndV3-Share' / 'dirty.txt').write_text('uncommitted')
        result = self.both()
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(any(e['tool'] == 'git' and e.get('args', [])[:1] == ['push'] for e in self.events()))
        self.assert_no_tags()

    def test_existing_backend_tag_stops_before_frontend_version_update(self):
        self.git('BackEndV3-Share', 'tag', 'v0.1.13')
        result = self.both()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('0.0.1-beta.20\n', (self.root / 'YuanHub' / 'VERSION').read_text())
        self.assertEqual('', self.tags('YuanHub'))

    def test_changed_commit_while_ci_waits_prevents_all_tags(self):
        result = self.both(MUTATE_ON_CI='YuanHub')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('前端提交已变化', result.stderr)
        self.assert_no_tags()

    def test_changed_frontend_after_backend_release_is_rejected(self):
        result = self.both(MUTATE_ON_BACKEND_RELEASE='1')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('提交已变化', result.stderr)
        self.assertEqual('', self.tags('YuanHub'))
        self.assertIn('refs/tags/v0.1.13', self.tags('BackEndV3-Share'))

    def test_api_errors_fail_without_creating_tags(self):
        result = self.both(API_FAIL='1')
        self.assertNotEqual(0, result.returncode)
        self.assert_no_tags()

    def test_missing_invalid_and_duplicate_arguments_fail_before_mutation(self):
        for args in [(), ('--backend',), ('--frontend', ''), ('--backend', 'auto'),
                     ('--backend', '0.1.13', '--backend', '0.1.14'), ('--frontend', '../bad')]:
            with self.subTest(args=args):
                self.assertNotEqual(0, self.run_release(*args).returncode)
        self.assert_no_tags()

    def test_actual_remote_ci_gates_reject_wrong_sha_branch_event_and_failure(self):
        sha = 'a' * 40
        for name, variable in [('YuanHub', 'YUANHUB_RELEASE_COMMIT'), ('BackEndV3-Share', 'BACKEND_RELEASE_COMMIT')]:
            content = (ROOT / ('frontend' if name == 'YuanHub' else 'backend') / '.github/workflows/release.yml').read_text()
            gate = content.split('      - name: Require successful CI for release commit\n', 1)[1]
            gate = gate.split('\n      - name:', 1)[0].split('        run: |\n', 1)[1]
            gate = '\n'.join(line[10:] for line in gate.splitlines())
            valid = dict(sha=sha, branch='main', event='push', status='success')
            cases = [([], False), ([valid], True)]
            for key, bad in [('sha', 'b' * 40), ('branch', 'feature'), ('event', 'pull_request'), ('status', 'failure')]:
                cases.append(([dict(valid, **{key: bad})], False))
            for records, success in cases:
                with self.subTest(name=name, records=records):
                    result = subprocess.run(['bash', '-c', gate], env=dict(self.env, **{
                        variable: sha, 'GITHUB_REPOSITORY': 'fixture/' + name, 'CI_RECORDS': json.dumps(records)
                    }), text=True, capture_output=True, timeout=5)
                    self.assertEqual(success, result.returncode == 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
