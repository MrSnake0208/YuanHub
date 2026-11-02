"""Exercise artifact installation in owned directories; never connect to a server."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHA = 'a' * 40


class ArtifactTransferTest(unittest.TestCase):
    def setUp(self):
        artifacts = ROOT / '.test-artifacts'
        artifacts.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=artifacts)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.site = self.root / 'site'

    def test_transfer_checks_integrity_before_install_and_reports_duration(self):
        tools = self.root / 'tools'
        tools.mkdir()
        proxy = tools / 'proxy'
        proxy.write_text('''#!/usr/bin/env python3
import os, pathlib, shutil, subprocess, sys
tool = pathlib.Path(sys.argv[0]).name
if tool == 'ssh-keyscan':
    print('fixture known host')
elif tool == 'ssh-keygen':
    pass
elif tool == 'ssh':
    sys.exit(subprocess.run(['bash', '-c', sys.argv[-1]]).returncode)
elif tool == 'scp':
    if os.environ.get('FAIL_UPLOAD'):
        sys.exit(1)
    destination = sys.argv[-1].split(':', 1)[1]
    shutil.copyfile(sys.argv[-2], destination)
    if os.environ.get('CORRUPT_UPLOAD'):
        with open(destination, 'ab') as stream:
            stream.write(b'corrupt')
''')
        proxy.chmod(0o755)
        for name in ['ssh-keyscan', 'ssh-keygen', 'ssh', 'scp']:
            (tools / name).symlink_to(proxy)
        bundle = self.root / 'bundle'
        bundle.mkdir()
        marker = self.root / 'installed'
        (bundle / 'deploy.sh').write_text(f'printf installed > "{marker}"\n')
        summary = self.root / 'summary'
        env = dict(os.environ, PATH=str(tools)+os.pathsep+os.environ['PATH'],
                   DEPLOY_HOST='fixture', DEPLOY_USER='fixture', DEPLOY_PORT='22', DEPLOY_KEY='fixture',
                   RELEASE_ROOT=str(self.site), RELEASE_COMMIT=SHA, BUNDLE_DIR=str(bundle),
                   GITHUB_RUN_ID='1', GITHUB_RUN_ATTEMPT='1', GITHUB_STEP_SUMMARY=str(summary),
                   COMPONENT='backend', DEPLOY_PHASE='prepare')
        for attempt, flag in enumerate(['FAIL_UPLOAD', 'CORRUPT_UPLOAD', ''], 1):
            run_env = dict(env, GITHUB_RUN_ATTEMPT=str(attempt))
            if flag:
                run_env[flag] = '1'
            result = subprocess.run(['bash', str(ROOT / 'scripts/deploy/transfer-release.sh')],
                                    env=run_env, capture_output=True, text=True)
            if flag:
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(marker.exists())
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(marker.read_text(), 'installed')
                self.assertIn('Upload:', summary.read_text())
                self.assertTrue((self.site / '.incoming/1-3/bundle.tar.gz').is_file())
                self.assertTrue((self.site / '.incoming/1-2/bundle.tar.gz').is_file())



if __name__ == '__main__':
    unittest.main()
