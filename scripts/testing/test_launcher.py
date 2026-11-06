"""Exercise the public test entrypoint without personal workflow or services."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import impact

ROOT = Path(__file__).resolve().parents[2]


class PublicTestLauncherTest(unittest.TestCase):
    def test_plan_uses_its_checkout_from_root_and_an_unrelated_directory(self):
        with tempfile.TemporaryDirectory(prefix='yuanhub-launcher-') as directory:
            root = Path(directory)/'checkout'
            outside = Path(directory)/'other'
            root.mkdir(); outside.mkdir()
            for name in ('scripts/test.sh', 'scripts/testing/run.py', 'scripts/testing/impact.py'):
                target = root/name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT/name, target)
            subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(root), '-c', 'core.hooksPath=/dev/null',
                            '-c', 'commit.gpgsign=false', '-c', 'user.name=Local fixture',
                            '-c', 'user.email=fixture@example.invalid', 'commit',
                            '--allow-empty', '-qm', 'temporary baseline'], check=True, capture_output=True)
            env = dict(os.environ, DOCKER_HOST='unix:///unused-yuanhub-launcher.sock')
            env.pop('DOCKER_CONTEXT', None)
            for cwd in (root, outside):
                with self.subTest(cwd=cwd):
                    result = subprocess.run([str(root/'scripts/test.sh'), 'plan'],
                                            cwd=cwd, env=env, capture_output=True, text=True, timeout=30)
                    self.assertEqual(0, result.returncode, result.stdout+result.stderr)
                    report = json.loads((root/'.test-artifacts/latest-plan.json').read_text())
                    self.assertNotIn('task', report)
                    self.assertNotIn('completion_eligible', report)
                    self.assertNotIn('Completion gate:', result.stdout)
                    self.assertEqual([], report['checks'])
                    self.assertFalse((root/'.trellis').exists())
                    self.assertFalse((outside/'.test-artifacts').exists())

    def test_launcher_changes_are_included_in_shared_infrastructure_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            result = impact.infer(Path(directory), ['scripts/test.sh'])
            self.assertTrue(result['conservative_full'])


if __name__ == '__main__':
    unittest.main()
