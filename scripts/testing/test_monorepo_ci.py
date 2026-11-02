"""Execute the actual root workflow's request validation without GitHub or SSH."""
import fnmatch
import itertools
import json
import os
from pathlib import Path
import subprocess
import re
import textwrap
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]


class MonorepoWorkflowTest(unittest.TestCase):
    def pr_script(self, step):
        text = (ROOT / '.github/workflows/pr-ci.yml').read_text()
        block = text.split(f'      - name: {step}\n', 1)[1]
        script = re.split(r'\n {0,8}\S', block.split('        run: |\n', 1)[1], maxsplit=1)[0]
        return textwrap.dedent(script)

    def test_pr_component_selection(self):
        script = self.pr_script('Select components')
        cases = [
            ([], ('false', 'false')),
            (['docs/guide.md'], ('false', 'false')),
            (['frontend/src/main.js'], ('true', 'false')),
            (['backend/build.gradle.kts'], ('false', 'true')),
            (['backend/src/main/Api.kt'], ('true', 'true')),
            (['docs/development/testing.md'], ('true', 'true')),
            (['.github/workflows/backend-ci.yml'], ('true', 'true')),
            (['scripts/test.sh'], ('true', 'true')),
            (['unknown-root-config'], ('true', 'true')),
            (['frontend/a\nb.js'], ('true', 'false')),
            (['frontend/deleted.js', 'backend/renamed.js'], ('true', 'true')),
            ([f'docs/{n}.md' for n in range(350)] + ['backend/src/Api.kt'], ('true', 'true')),
        ]
        artifacts = ROOT / '.test-artifacts'
        artifacts.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=artifacts) as directory:
            output = Path(directory) / 'output'
            for paths, expected in cases:
                with self.subTest(paths=paths[-2:]):
                    output.write_text('')
                    raw = b''.join(os.fsencode(path) + b'\0' for path in paths)
                    with patch('subprocess.check_output', return_value=raw) as git, \
                            patch.dict(os.environ, GITHUB_OUTPUT=str(output)):
                        exec(script, {})
                    git.assert_called_once_with([
                        'git', 'diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD', '--'
                    ])
                    actual = dict(line.split('=') for line in output.read_text().splitlines())
                    self.assertEqual((actual['frontend'], actual['backend']), expected)
                    full = any(path.startswith('frontend/') or (not path.startswith(('backend/', 'docs/')) or
                               path == 'docs/development/testing.md') for path in paths)
                    self.assertEqual(actual['frontend_full'], str(full).lower())
            with patch('subprocess.check_output', side_effect=subprocess.CalledProcessError(128, 'git')):
                with self.assertRaises(subprocess.CalledProcessError):
                    exec(script, {})

    def test_pr_gate_fails_closed(self):
        script = self.pr_script('Require all affected checks')

        def check(selection, front, back, changes='success'):
            needs = {
                'changes': {'result': changes, 'outputs': selection},
                'frontend': {'result': front}, 'backend': {'result': back},
            }
            return subprocess.run(
                ['python3', '-c', script], capture_output=True, text=True,
                env=dict(os.environ, NEEDS_JSON=json.dumps(needs)),
            ).returncode

        for front_required, back_required in itertools.product(('true', 'false'), repeat=2):
            selection = {'frontend': front_required, 'backend': back_required}
            for front, back in itertools.product(('success', 'failure', 'cancelled', 'skipped'), repeat=2):
                expected = (
                    front == ('success' if front_required == 'true' else 'skipped') and
                    back == ('success' if back_required == 'true' else 'skipped')
                )
                with self.subTest(selection=selection, frontend=front, backend=back):
                    self.assertEqual(check(selection, front, back) == 0, expected)
        for status in ('failure', 'cancelled', 'skipped'):
            self.assertNotEqual(check({'frontend': 'false', 'backend': 'false'}, 'skipped', 'skipped', status), 0)
        for invalid in ({}, {'frontend': '', 'backend': 'false'}, {'frontend': 'false', 'backend': 'unknown'}):
            self.assertNotEqual(check(invalid, 'skipped', 'skipped'), 0)

    def test_contract_only_keeps_contract_and_skips_dependency_build_work(self):
        text = (ROOT / '.github/workflows/frontend-ci.yml').read_text()
        for name in ['Set up npm cache', 'Install dependencies', 'Static source check',
                     'Repository tests', 'Build', 'Verify injected build info', 'Upload build output']:
            block = text.split('      - name: ' + name + '\n', 1)[1].split('      - name:', 1)[0]
            self.assertIn('if: ${{ !inputs.contract-only }}', block)
        contract = text.split('      - name: Paired API contract\n', 1)[1].split('      - name:', 1)[0]
        self.assertNotIn('if:', contract)
        self.assertIn('npm run test:contract', contract)
        self.assertIn("contract-only: ${{ needs.changes.outputs.frontend_full == 'false' }}",
                      (ROOT / '.github/workflows/pr-ci.yml').read_text())
        backend = (ROOT / '.github/workflows/backend-ci.yml').read_text()
        self.assertIn('./gradlew ktlintCheck test assemble --console=plain', backend)

    def test_promo_push_filter_covers_its_build_directory(self):
        workflow='.github/workflows/promo-site-deploy.yml'
        text=(ROOT/workflow).read_text()
        paths=text.split('    paths:\n',1)[1].split('  workflow_dispatch:',1)[0]
        patterns=re.findall(r'^\s+- ["\']([^"\']+)["\']\s*$',paths,re.MULTILINE)
        build_dir=re.search(r'working-directory:\s*(\S+)',text).group(1)
        package=f'{build_dir}/package.json'
        self.assertTrue((ROOT/package).is_file())
        for changed in [package,workflow]:
            self.assertTrue(any(fnmatch.fnmatchcase(changed,pattern) for pattern in patterns),changed)
        for changed in ['backend/build.gradle.kts','frontend/src/main.js']:
            self.assertFalse(any(fnmatch.fnmatchcase(changed,pattern) for pattern in patterns),changed)
        self.assertIn("vars.YUANHUB_MONOREPO_DEPLOY_ENABLED == 'true'",text)

    def test_component_prepare_tags_are_validated_before_checkout(self):
        for component in ['frontend','backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            block=text.split('      - name: Validate release request\n',1)[1].split('      - name: Checkout',1)[0]
            script=textwrap.dedent(block.split('        run: |\n',1)[1])
            env=dict(os.environ,DEPLOY_PHASE='prepare',GITHUB_REF='refs/heads/main',REQUESTED_COMMIT='a'*40,PREPARE_REQUEST='offline-check')
            for tag,expected in [(f'{component}/v0.1.2',0),('v0.1.2',1),('wrong/v0.1.2',1),(f'{component}/v0.1.2;echo bad',1)]:
                result=subprocess.run(['bash','-c',script],env=dict(env,RELEASE_TAG=tag),capture_output=True,text=True)
                self.assertEqual(expected,result.returncode,(component,tag,result.stdout,result.stderr))

    def test_each_release_is_explicitly_disabled_until_repository_opt_in(self):
        for component in ['frontend','backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            self.assertIn("vars.YUANHUB_MONOREPO_DEPLOY_ENABLED == 'true'",text)
            self.assertIn('environment: '+component+'-production',text)
            self.assertIn('--workflow '+component+'-ci.yml',text)
            self.assertNotIn('--workflow ci.yml',text)

    def test_frontend_release_fetches_public_repository_over_https(self):
        text=(ROOT/'.github/workflows/frontend-release.yml').read_text()
        self.assertIn('REPO_URL: https://github.com/${{ github.repository }}.git', text)


if __name__=='__main__':
    unittest.main()
