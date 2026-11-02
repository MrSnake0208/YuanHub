"""Run actual server prepare/activation scripts offline in disposable directories.

Run: python3 scripts/testing/test_server_prebuild.py
Compilers, service commands, curl and sleep are replaced; no real services are used.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
PROXY = r'''
import hashlib, json, os, pathlib, subprocess, sys
name, args = pathlib.Path(sys.argv[0]).name, sys.argv[1:]
root = pathlib.Path(os.environ['SERVER_FIXTURE'])
with (root / 'events.jsonl').open('a') as stream:
    stream.write(json.dumps(dict(tool=name, args=args)) + '\n')
if name == 'sudo':
    assert args[0] == '-n' and pathlib.Path(args[1]).parent == root / 'bin'
    assert pathlib.Path(args[1]).name in ('systemctl', 'nginx')
    sys.exit(subprocess.run(args[1:]).returncode)
if name in ('systemctl', 'nginx', 'sleep'):
    sys.exit(0)
if name == 'java':
    print('openjdk version "21.0.1"', file=sys.stderr)
elif name == 'javac':
    print('javac 21.0.1')
elif name == 'node':
    print('22')
elif name in ('gradlew', 'npm'):
    if os.environ.get('BUILD_FAIL'):
        sys.exit(9)
    if name == 'gradlew':
        assert not pathlib.Path('build/resources/main/git.properties').exists()
        pathlib.Path('build/libs').mkdir(parents=True, exist_ok=True)
        pathlib.Path('build/libs/app.jar').write_bytes(b'fixture jar')
    elif args[:2] == ['run', 'build']:
        pathlib.Path('dist/assets').mkdir(parents=True)
        pathlib.Path('dist/index.html').write_text('fixture')
        pathlib.Path('dist/sw.js').write_text('fixture service worker')
        pathlib.Path('dist/assets/app.js').write_text(os.environ['RELEASE_VERSION'] + os.environ['VITE_API_BASE'])
    else:
        assert args[0] == 'ci'
elif name == 'curl':
    url = args[-1]
    if '/actuator/health/readiness' in url:
        print('{"status":"UP"}')
    elif '/v1/beta/status' in url:
        print('{"data":{}}')
    else:
        old = ':8080/' in url or (url.startswith('https://') and os.environ.get('PUBLIC_FAIL'))
        print(json.dumps({'data': {'backend_version': 'v0.1.12' if old else os.environ['RELEASE_VERSION'],
                                  'backend_commit': 'b'*40 if old else os.environ['RELEASE_COMMIT']}}))
elif name == 'sha256sum':
    print(hashlib.sha256(pathlib.Path(args[0]).read_bytes()).hexdigest() + '  ' + args[0])
elif name == 'mv':
    if args[:2] == ['-T', '-n']:
        if not pathlib.Path(args[3]).exists():
            os.rename(args[2], args[3])
    elif args[0] == '-T':
        os.replace(args[1], args[2])  # GNU mv's atomic symlink replacement, also runnable on macOS.
    else:
        sys.exit(subprocess.run([os.environ['REAL_MV'], *args]).returncode)
else:
    raise AssertionError('Unexpected proxy: ' + name)
'''


class ServerPrebuildTest(unittest.TestCase):
    def setUp(self):
        artifacts = ROOT / '.test-artifacts'
        artifacts.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='yuanhub-server-test-', dir=artifacts)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.env = dict(os.environ, SERVER_FIXTURE=str(self.root), REAL_MV=shutil.which('mv'),
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1', GIT_TERMINAL_PROMPT='0')
        for key in list(self.env):
            if key.startswith('GIT_') and key not in {'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT'}:
                del self.env[key]
        for name in ('sudo', 'systemctl', 'nginx', 'sleep', 'java', 'javac', 'node', 'npm', 'curl', 'sha256sum', 'mv'):
            self.proxy(self.bin / name)
        self.env['PATH'] = str(self.bin) + os.pathsep + self.env['PATH']
        self.source = self.root / 'server/.monorepo-source'
        self.source.mkdir(parents=True)
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Server Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        (self.source / 'frontend').mkdir()
        (self.source / 'backend').mkdir()
        (self.source / 'frontend/VERSION').write_text('0.0.1-beta.20\n')
        self.proxy(self.source / 'backend/gradlew')
        self.git('add', '.')
        self.git('commit', '-m', 'fixture')
        self.sha = self.git('rev-parse', 'HEAD')
        self.server = self.source.parent
        self.ci_jar = self.root / 'ci-app.jar'
        self.ci_jar.write_bytes(b'fixture jar')
        self.env['PREBUILT_JAR'] = str(self.ci_jar)
        self.env.update(BACKEND_ROOT=str(self.server), FRONTEND_ROOT=str(self.server),
                        RELEASE_COMMIT=self.sha, KEEP_RELEASES='0', PRODUCT_VERSION='0.0.1-beta.20',
                        BACKEND_URL='https://fixture.invalid/api', API_BASE='https://fixture.invalid/api',
                        SYSTEMCTL=str(self.bin / 'systemctl'), NGINX=str(self.bin / 'nginx'))

    def proxy(self, path):
        path.write_text('#!' + sys.executable + '\n' + PROXY)
        path.chmod(0o755)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.source), *args], env=self.env,
                                       text=True, stderr=subprocess.DEVNULL).strip()

    def events(self, tool):
        path = self.root / 'events.jsonl'
        return [json.loads(line) for line in path.read_text().splitlines()
                if json.loads(line)['tool'] == tool] if path.exists() else []

    def backend(self, phase='prepare', **env):
        return subprocess.run(['bash', str(ROOT / 'backend/deploy/blue-green-deploy.sh')],
                              env=dict(self.env, RELEASE_VERSION='v0.1.13', DEPLOY_PHASE=phase, **env),
                              text=True, capture_output=True, timeout=10)

    def bootstrap_backend(self, jar_version='v0.1.12'):
        for directory in ('slots', 'state', 'nginx', 'shared', 'releases/' + jar_version):
            (self.server / directory).mkdir(parents=True, exist_ok=True)
        jar = self.server / 'releases' / jar_version / 'app.jar'
        jar.write_bytes(b'old jar')
        (self.server / 'slots/blue.env').write_text('YUANHUB_JAR=' + str(jar) + '\n')
        (self.server / 'state/active-slot').write_text('blue\n')
        (self.server / 'nginx/active.conf').write_text('server 127.0.0.1:8080 max_fails=1 fail_timeout=3s;\n')
        (self.server / 'shared/backend.env').write_text('fixture=true\n')

    def active_backend(self):
        return [(self.server / path).read_bytes() for path in
                ('slots/blue.env', 'state/active-slot', 'nginx/active.conf', 'releases/v0.1.12/app.jar')]

    def frontend(self, phase='prepare', **env):
        content = (ROOT / '.github/workflows/frontend-release.yml').read_text()
        script = content.split('      - name: Build and activate release on server\n', 1)[1]
        script = script.split('          script: |\n', 1)[1].split('\n      - name:', 1)[0]
        script = textwrap.dedent(script)
        return subprocess.run(['bash', '-c', script],
                              env=dict(self.env, RELEASE_VERSION='0.0.1-beta.20', RELEASE_TAG='frontend/v0.0.1-beta.20',
                                       DEPLOY_PHASE=phase, **env), text=True, capture_output=True, timeout=10)

    def bootstrap_frontend(self):
        remote = self.root / 'repo.git'
        subprocess.run(['git', 'init', '--bare', str(remote)], env=self.env,
                       check=True, capture_output=True)
        self.git('remote', 'add', 'origin', str(remote))
        self.git('push', 'origin', 'main')
        self.env['REPO_URL'] = str(remote)
        old = self.server / 'releases/old'
        old.mkdir(parents=True)
        (old / 'index.html').write_text('old frontend')
        (self.server / 'current').symlink_to('releases/old')

    def assert_ok(self, result):
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_backend_prepare_needs_no_live_services_and_reuses_artifact(self):
        # No slots, shared environment, Nginx upstream or running application are present.
        del self.env['PRODUCT_VERSION']
        del self.env['BACKEND_URL']
        self.assert_ok(self.backend())
        meta = json.loads((self.server / 'releases/v0.1.13/deploy-meta.json').read_text())
        self.assertEqual(self.sha, meta['commit'])
        self.assert_ok(self.backend())
        self.assertEqual([], self.events('gradlew'))
        for tool in ('sudo', 'curl', 'systemctl', 'nginx', 'sleep'):
            self.assertEqual([], self.events(tool))
        self.assertFalse((self.server / 'slots').exists())

    def test_backend_prepare_missing_ci_jar_preserves_active_state(self):
        self.bootstrap_backend()
        before = self.active_backend()
        self.assertNotEqual(0, self.backend(PREBUILT_JAR=str(self.root / 'missing-ci.jar')).returncode)
        self.assertEqual(before, self.active_backend())
        self.assertEqual([], self.events('sudo'))
        self.assertFalse((self.server / 'releases/v0.1.13').exists())

    def assert_backend_preserves_slot_rollback_artifact(self, slot):
        self.bootstrap_backend(jar_version='v0.1.13')
        (self.server / ('slots/' + slot + '.env')).write_text(
            'YUANHUB_JAR=' + str(self.server / 'releases/v0.1.13/app.jar') + '\n')
        result = self.backend()
        self.assertNotEqual(0, result.returncode)
        self.assertIn('Refusing to replace', result.stderr)
        self.assertEqual(b'old jar', (self.server / 'releases/v0.1.13/app.jar').read_bytes())
        self.assertEqual([], self.events('gradlew'))

    def test_backend_preserves_blue_rollback_artifact(self):
        self.assert_backend_preserves_slot_rollback_artifact('blue')

    def test_backend_preserves_green_rollback_artifact(self):
        self.assert_backend_preserves_slot_rollback_artifact('green')

    def test_backend_activation_reuses_prepare_and_preserves_drain(self):
        self.bootstrap_backend()
        before = self.active_backend()
        self.assert_ok(self.backend())
        self.assertEqual(before, self.active_backend())
        self.assert_ok(self.backend('release'))
        self.assertEqual([], self.events('gradlew'))
        self.assertEqual('green\n', (self.server / 'state/active-slot').read_text())
        self.assertIn('8081', (self.server / 'nginx/active.conf').read_text())
        self.assertTrue((self.server / 'releases/v0.1.12/app.jar').is_file())
        history = next(self.server.glob('.deploy-history.*'))
        self.assertEqual('blue\n', (history / 'active-slot').read_text())
        self.assertIn(['45'], [e['args'] for e in self.events('sleep')])
        self.assertIn(['stop', 'yuanhub-backend@blue.service'], [e['args'] for e in self.events('systemctl')])

    def test_backend_public_failure_rolls_back_prepared_release(self):
        self.bootstrap_backend()
        before = self.active_backend()
        self.assert_ok(self.backend())
        result = self.backend('release', PUBLIC_FAIL='1')
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(before, self.active_backend())
        commands = [e['args'] for e in self.events('systemctl')]
        self.assertIn(['stop', 'yuanhub-backend@green.service'], commands)
        self.assertNotIn(['stop', 'yuanhub-backend@blue.service'], commands)
        self.assertEqual([], self.events('gradlew'))

    def test_backend_incomplete_existing_release_is_preserved(self):
        self.bootstrap_backend()
        release = self.server / 'releases/v0.1.13'
        release.mkdir()
        marker = release / 'important'
        marker.write_text('keep')
        self.assertNotEqual(0, self.backend('release').returncode)
        self.assertEqual('keep', marker.read_text())
        self.assertEqual([], self.events('systemctl'))

    def test_backend_missing_ci_jar_does_not_activate_or_compile(self):
        self.bootstrap_backend()
        self.assert_ok(self.backend())
        before = self.active_backend()
        self.assertNotEqual(0, self.backend('release', PREBUILT_JAR=str(self.root / 'missing.jar')).returncode)
        self.assertEqual(before, self.active_backend())
        self.assertEqual([], self.events('gradlew'))
        self.assertEqual([], self.events('sudo'))

    def test_frontend_prepare_leaves_current_and_reuses_for_activation(self):
        self.bootstrap_frontend()
        self.assert_ok(self.frontend())
        self.assertEqual('releases/old', os.readlink(self.server / 'current'))
        self.assertEqual('old frontend', (self.server / 'releases/old/index.html').read_text())
        meta = json.loads((self.server / ('releases/0.0.1-beta.20-' + self.sha) / 'deploy-meta.json').read_text())
        self.assertEqual(self.sha, meta['commit'])
        self.assertEqual(self.env['API_BASE'], meta['apiBase'])
        self.assert_ok(self.frontend())
        self.assert_ok(self.frontend('release'))
        self.assertEqual(2, len(self.events('npm')))  # one install, one build across three runs
        self.assertEqual('releases/0.0.1-beta.20-' + self.sha, os.readlink(self.server / 'current'))
        self.assertEqual('releases/old', os.readlink(next(self.server.glob('.switch.*')) / 'previous'))
        self.assertEqual('old frontend', (self.server / 'releases/old/index.html').read_text())

    def test_frontend_changed_config_preserves_prepared_release(self):
        self.bootstrap_frontend()
        self.assert_ok(self.frontend())
        release = self.server / ('releases/0.0.1-beta.20-' + self.sha)
        before = (release / 'deploy-meta.json').read_bytes()
        self.assertNotEqual(0, self.frontend('release', API_BASE='https://new.invalid/api').returncode)
        self.assertEqual(before, (release / 'deploy-meta.json').read_bytes())
        self.assertEqual('releases/old', os.readlink(self.server / 'current'))

    def test_frontend_incomplete_existing_release_is_preserved(self):
        self.bootstrap_frontend()
        release = self.server / ('releases/0.0.1-beta.20-' + self.sha)
        release.mkdir()
        marker = release / 'important'
        marker.write_text('keep')
        self.assertNotEqual(0, self.frontend('release').returncode)
        self.assertEqual('keep', marker.read_text())
        self.assertEqual('releases/old', os.readlink(self.server / 'current'))

    def test_frontend_legacy_deployed_metadata_can_be_released_again(self):
        self.bootstrap_frontend()
        self.assert_ok(self.frontend('release'))
        path = self.server / 'current/deploy-meta.json'
        meta = json.loads(path.read_text())
        del meta['apiBase']
        path.write_text(json.dumps(meta, separators=(',', ':')))
        self.assert_ok(self.frontend('release'))
        self.assertEqual(2, len(self.events('npm')))

    def test_both_servers_preserve_artifacts_with_wrong_commit_metadata(self):
        self.bootstrap_frontend()
        for prepare, version in ((self.backend, 'v0.1.13'),
                                 (self.frontend, '0.0.1-beta.20-' + self.sha)):
            with self.subTest(version=version):
                self.assert_ok(prepare())
                path = self.server / 'releases' / version / 'deploy-meta.json'
                meta = json.loads(path.read_text())
                meta['commit'] = 'a' * 40
                path.write_text(json.dumps(meta, separators=(',', ':')))
                before = path.read_bytes()
                self.assertNotEqual(0, prepare().returncode)
                self.assertEqual(before, path.read_bytes())
        self.assertEqual('releases/old', os.readlink(self.server / 'current'))

    def test_frontend_prepare_build_failure_preserves_current(self):
        self.bootstrap_frontend()
        self.assertNotEqual(0, self.frontend(BUILD_FAIL='1').returncode)
        self.assertEqual('releases/old', os.readlink(self.server / 'current'))
        self.assertFalse((self.server / 'releases/0.0.1-beta.20').exists())

    def test_frontend_refuses_overwriting_active_release_on_config_change(self):
        self.bootstrap_frontend()
        self.assert_ok(self.frontend('release'))
        before = (self.server / 'current/deploy-meta.json').read_bytes()
        result = self.frontend(API_BASE='https://new.invalid/api')
        self.assertNotEqual(0, result.returncode)
        self.assertIn('Refusing to replace', result.stderr)
        self.assertEqual(before, (self.server / 'current/deploy-meta.json').read_bytes())


if __name__ == '__main__':
    unittest.main()
