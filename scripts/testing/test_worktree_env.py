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
    def test_local_service_checks_fail_without_redis_and_never_start_services(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, script in {'mongosh': 'exit 0', 'redis-cli': 'echo PONG'}.items():
                binary = root/name
                binary.write_text('#!/bin/sh\n' + script + '\n')
                binary.chmod(0o700)
            values = dict(os.environ, PATH=directory+os.pathsep+os.environ['PATH'])
            command = ['bash', str(MODULE.parents[1]/'backend/scripts/dev-up.sh')]
            result = subprocess.run(command, env=values, capture_output=True, text=True, timeout=5)
            self.assertEqual(0, result.returncode, result.stderr)
            (root/'redis-cli').write_text('#!/bin/sh\necho NOAUTH\n')
            result = subprocess.run(command, env=values, capture_output=True, text=True, timeout=5)
            self.assertNotEqual(0, result.returncode)
            self.assertIn('Redis is unavailable', result.stderr)

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

    def test_backend_builds_bootjar_before_java_and_does_not_launch_after_build_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True)
            for sub in ('scripts', 'backend/scripts', 'backend/src/main', 'bin'):
                (root/sub).mkdir(parents=True, exist_ok=True)
            shutil.copy(MODULE, root/'scripts/worktree_env.py')
            shutil.copy(MODULE.parents[1]/'dev.sh', root/'dev.sh')
            (root/'backend/scripts/dev-up.sh').write_text('exit 0')
            (root/'scripts/check_local_services.py').write_text('')
            gradle = root/'backend/gradlew'
            gradle.write_text('#!/bin/sh\n[ "$1" = -Pkotlin.compiler.execution.strategy=in-process ] && shift\n[ "$1" = bootJar ] || exit 90\nmkdir -p build/libs\necho built > build/libs/app.jar\n')
            gradle.chmod(0o700)
            java = root/'bin/java'
            java.write_text('#!/bin/sh\n[ "$1" = -jar ] && [ -f "$2" ] || exit 91\necho launched > java-called\n')
            java.chmod(0o700)
            values = dict(os.environ, PATH=str(root/'bin')+os.pathsep+os.environ['PATH'])
            result = subprocess.run(['bash', 'dev.sh', 'backend'], cwd=root, env=values,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertTrue((root/'backend/java-called').exists())
            self.assertEqual('built\n', (root/'.dev/backend-running.jar').read_text())
            (root/'backend/java-called').unlink()
            gradle.write_text('#!/bin/sh\nexit 23\n')
            result = subprocess.run(['bash', 'dev.sh', 'backend'], cwd=root, env=values,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(23, result.returncode, result.stderr)
            self.assertFalse((root/'backend/java-called').exists())

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
            self.assertEqual(env.exports(a)['SPRING_DATA_MONGODB_URI'], env.exports(b)['SPRING_DATA_MONGODB_URI'])
            self.assertEqual(str(a['ports']['redis']), values['SPRING_DATA_REDIS_PORT'])
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
