import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

MODULE = Path(__file__).resolve().parents[1] / 'worktree_env.py'
spec = importlib.util.spec_from_file_location('worktree_env', MODULE)
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)


class WorktreeEnvironmentTest(unittest.TestCase):
    def test_compose_uses_the_validated_local_endpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory)/'docker'
            binary.write_text('#!/bin/sh\n[ "$DOCKER_HOST" = "unix:///owned/docker.sock" ] && [ -z "${DOCKER_CONTEXT:-}" ] || exit 99\n')
            binary.chmod(0o700)
            values = dict(os.environ, PATH=directory+os.pathsep+os.environ['PATH'],
                          DOCKER_HOST='unix:///owned/docker.sock', DOCKER_CONTEXT='remote-production',
                          COMPOSE_PROJECT_NAME='owned-test', YUANHUB_MONGO_PORT='12345', YUANHUB_REDIS_PORT='12346')
            result = subprocess.run(['bash', str(MODULE.parents[1]/'backend/scripts/dev-up.sh')],
                                    env=values, capture_output=True, text=True, timeout=5)
            self.assertEqual(0, result.returncode, result.stderr)
            result = subprocess.run(['bash', str(MODULE.parents[1]/'backend/scripts/dev-up.sh')],
                                    env=dict(values, DOCKER_HOST='tcp://production:2375'),
                                    capture_output=True, text=True, timeout=5)
            self.assertNotEqual(0, result.returncode)
            self.assertIn('Only local Unix Docker endpoints', result.stderr)

    def test_launcher_does_not_start_apps_after_database_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True)
            (root/'scripts').mkdir()
            (root/'backend/scripts').mkdir(parents=True)
            shutil.copy(MODULE, root/'scripts/worktree_env.py')
            shutil.copy(MODULE.parents[1]/'dev.sh', root/'dev.sh')
            (root/'backend/scripts/dev-up.sh').write_text(
                "python3 - <<'CHECK'\nimport json, os\n"
                "print(json.dumps({k:v for k,v in os.environ.items() if k.startswith(('SPRING_', 'SHARE_', 'YUANHUB_BETA_'))}))\nCHECK\nexit 23\n")
            result = subprocess.run(['bash', 'dev.sh', 'containers', 'all'], cwd=root, capture_output=True, text=True,
                env=dict(os.environ, SPRING_CONFIG_LOCATION='file:/production.yml',
                         SHARE_MONGO_HUB_URI='mongodb://production/real', YUANHUB_BETA_CAMPAIGN_ID='production'))
            self.assertEqual(23, result.returncode, result.stderr)
            values = json.loads(result.stdout)
            self.assertEqual('local', values['SPRING_PROFILES_ACTIVE'])
            self.assertNotIn('SPRING_CONFIG_LOCATION', values)
            self.assertNotIn('YUANHUB_BETA_CAMPAIGN_ID', values)
            self.assertIn('127.0.0.1:', values['SHARE_MONGO_HUB_URI'])

    def test_concurrent_first_launch_uses_one_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            with ThreadPoolExecutor(max_workers=2) as pool:
                instances = list(pool.map(env.configuration, [Path(directory)] * 2))
            self.assertEqual(instances[0], instances[1])

    def test_instances_are_persistent_private_and_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            roots = [Path(directory)/name for name in ('task-a','task-b')]
            for root in roots:
                root.mkdir()
            a,b = [env.configuration(root) for root in roots]
            self.assertEqual(a, env.configuration(roots[0]))
            self.assertNotEqual(a['project'], b['project'])
            self.assertNotEqual(a['jwt'], b['jwt'])
            self.assertEqual(len(set(a['ports'].values())), 4)
            values = env.exports(a, 'containers')
            self.assertIn(f":{a['ports']['mongo']}/yuanhub_local_maa?", values['SPRING_DATA_MONGODB_URI'])
            self.assertIn('directConnection=true', values['SHARE_MONGO_HUB_URI'])
            self.assertNotIn('MaaBackend', values['SPRING_DATA_MONGODB_URI'])
            self.assertEqual('true', values['DEBUG_EMAIL_NO_SEND'])
            self.assertEqual('local', values['SPRING_PROFILES_ACTIVE'])
            self.assertEqual('127.0.0.1', values['SERVER_ADDRESS'])
            self.assertEqual(0o600, (roots[0]/'.dev/instance.json').stat().st_mode & 0o777)
            self.assertTrue(values['SHARE_MEDIA_DIR'].startswith(str(roots[0].resolve())))

    def test_local_instances_use_existing_data_but_keep_app_ports_and_jwt_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            roots = [Path(directory)/name for name in ('task-a', 'task-b')]
            for root in roots:
                root.mkdir()
            a, b = [env.exports(env.configuration(root)) for root in roots]
            for item in (a, b):
                self.assertEqual('mongodb://127.0.0.1:27017/MaaBackend?replicaSet=rs0&directConnection=true', item['SPRING_DATA_MONGODB_URI'])
                self.assertEqual('mongodb://127.0.0.1:27017/HubBackend?replicaSet=rs0&directConnection=true', item['SHARE_MONGO_HUB_URI'])
                self.assertEqual('6379', item['SPRING_DATA_REDIS_PORT'])
                self.assertEqual('0', item['SPRING_DATA_REDIS_DATABASE'])
                self.assertNotIn('SHARE_LOCAL_REDIS_KEY_PREFIX', item)
            for key in ('YUANHUB_FRONTEND_PORT', 'SERVER_PORT', 'SHARE_JWT_SECRET'):
                self.assertNotEqual(a[key], b[key])

    def test_local_launcher_never_calls_docker_when_services_are_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True)
            (root/'scripts').mkdir()
            shutil.copy(MODULE, root/'scripts/worktree_env.py')
            shutil.copy(MODULE.parents[1]/'dev.sh', root/'dev.sh')
            (root/'scripts/check_local_services.py').write_text('raise SystemExit(23)\n')
            result = subprocess.run(['bash', 'dev.sh'], cwd=root, capture_output=True, text=True)
            self.assertEqual(23, result.returncode, result.stderr)
            self.assertNotIn('Docker', result.stdout)


if __name__ == '__main__':
    unittest.main()
