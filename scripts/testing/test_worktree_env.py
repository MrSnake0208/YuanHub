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
            result = subprocess.run(['bash', 'dev.sh', 'all'], cwd=root, capture_output=True, text=True,
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
            gradle = root/'backend/gradlew'
            gradle.write_text('#!/bin/sh\n[ "$1" = bootJar ] || exit 90\nmkdir -p build/libs\necho built > build/libs/app.jar\n')
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
            self.assertEqual(len(set(a['ports'].values())), 2)
            values = env.exports(a)
            self.assertIn(":27017/MaaBackend?", values['SPRING_DATA_MONGODB_URI'])
            self.assertIn('directConnection=true', values['SHARE_MONGO_HUB_URI'])
            self.assertEqual(values['SPRING_DATA_MONGODB_URI'], env.exports(b)['SPRING_DATA_MONGODB_URI'])
            self.assertEqual('6379', values['SPRING_DATA_REDIS_PORT'])
            self.assertEqual('true', values['DEBUG_EMAIL_NO_SEND'])
            self.assertEqual('local', values['SPRING_PROFILES_ACTIVE'])
            self.assertEqual('127.0.0.1', values['SERVER_ADDRESS'])
            self.assertEqual(0o600, (roots[0]/'.dev/instance.json').stat().st_mode & 0o777)
            self.assertTrue(values['SHARE_MEDIA_DIR'].startswith(str(roots[0].resolve())))


if __name__ == '__main__':
    unittest.main()
