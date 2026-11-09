"""Execute the actual root workflow's request validation without GitHub or SSH."""
import itertools
import json
import os
from pathlib import Path
import subprocess
import re
import textwrap
import tempfile
import unittest
import zipfile
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
        behavior = text.split('      - name: Behavior tests\n', 1)[1].split('      - name:', 1)[0]
        self.assertIn('if: ${{ inputs.behavior && !inputs.contract-only }}', behavior)
        self.assertIn('npm run test:behavior', behavior)
        self.assertIn("contract-only: ${{ needs.changes.outputs.frontend_full == 'false' }}",
                      (ROOT / '.github/workflows/pr-ci.yml').read_text())
        backend = (ROOT / '.github/workflows/backend-ci.yml').read_text()
        self.assertIn('./gradlew ktlintCheck test assemble --console=plain', backend)

    def test_no_automatic_test_or_deploy_triggers(self):
        for path in (ROOT / '.github/workflows').glob('*.yml'):
            text = path.read_text()
            triggers = text.split('\non:\n', 1)[1].split('\npermissions:', 1)[0].split('\nconcurrency:', 1)[0]
            for event in ('push', 'pull_request', 'pull_request_target', 'schedule', 'workflow_run', 'release'):
                self.assertNotRegex(triggers, r'(?m)^  ' + event + r':', str(path))
        text = (ROOT / '.github/workflows/promo-site-deploy.yml').read_text()
        self.assertIn('working-directory: frontend/promo-site', text)
        self.assertIn('scripts.release_gate', text)
        self.assertIn('environment: production', text)

    def test_concentrated_gate_rejects_any_incomplete_job(self):
        text = (ROOT / '.github/workflows/release-check.yml').read_text()
        self.assertNotIn('\n  frontend:\n', text)
        self.assertNotIn('\n  safety:\n', text)
        backend = text.split('\n  backend:\n', 1)[1].split('\n  gate:\n', 1)[0]
        self.assertIn("if: ${{ inputs.backend_version != '' }}", backend)
        self.assertIn('      artifact-only: true', backend)
        self.assertIn('needs: [candidate, backend]', text)
        block = text.split('      - name: Require all checks and record evidence\n', 1)[1].split('      - uses:', 1)[0]
        script = textwrap.dedent(block.split('        run: |\n', 1)[1])
        artifacts = ROOT / '.test-artifacts'
        artifacts.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=artifacts) as directory:
            for backend_version, candidate_status, backend_status in itertools.product(
                    ('', '4.5.6'), ('success', 'failure', 'cancelled', 'skipped'),
                    ('success', 'failure', 'cancelled', 'skipped')):
                needs = dict(candidate=dict(result=candidate_status), backend=dict(result=backend_status))
                candidate = Path(directory)/'candidate.json'
                candidate.unlink(missing_ok=True)
                env = dict(os.environ, RESULTS=json.dumps(needs), SHA='a'*40,
                           FRONTEND='' if backend_version else '1.2.3', BACKEND=backend_version,
                           GITHUB_RUN_ID='12', GITHUB_RUN_ATTEMPT='1', STRESS='false', API_BASE='https://api.example',
                           GITHUB_STEP_SUMMARY=str(Path(directory)/'summary'),BASELINES='{}')
                expected = candidate_status == 'success' and backend_status == ('success' if backend_version else 'skipped')
                result = subprocess.run(['bash','-e','-c',script],cwd=directory,env=env,capture_output=True)
                self.assertEqual(result.returncode == 0, expected, (needs, backend_version, result.stderr))
                self.assertEqual(candidate.exists(), expected)
                if expected:
                    self.assertEqual('artifact-only', json.loads(candidate.read_text())['checks'])

    def test_release_checks_keep_infrastructure_regressions_and_artifact_only_backend(self):
        text = (ROOT / '.github/workflows/release-check.yml').read_text()
        for removed in ('services:', 'docker run', 'npm test', 'frontend-ci.yml'):
            self.assertNotIn(removed, text)
        candidate = text.split('\n  candidate:\n', 1)[1].split('\n  backend:\n', 1)[0]
        self.assertIn('      - name: Release infrastructure regressions\n'
                      '        run: python3 -m unittest scripts.testing.test_monorepo_ci scripts.testing.test_monorepo_release '
                      'scripts.testing.test_artifact_deploy scripts.testing.test_server_prebuild\n', candidate)
        self.assertIn('name: release-candidate-${{ github.run_id }}-${{ github.run_attempt }}', text)
        backend = (ROOT / '.github/workflows/backend-ci.yml').read_text()
        self.assertIn('artifact-only:\n        type: boolean\n        default: false', backend)
        full = backend.split('      - name: Lint, unit tests and build jar\n', 1)[1].split('      - name:', 1)[0]
        self.assertIn('if: ${{ !inputs.artifact-only }}', full)
        self.assertIn('./gradlew ktlintCheck test assemble --console=plain', full)
        jar = backend.split('      - name: Build release jar only\n', 1)[1].split('      - name:', 1)[0]
        self.assertIn('if: ${{ inputs.artifact-only }}', jar)
        self.assertIn('./gradlew assemble --console=plain', jar)
        self.assertNotIn('ktlintCheck', jar)
        self.assertNotIn(' test ', jar)
        self.assertIn('name: yuanhub-backend-jar-${{ inputs.commit || github.sha }}-${{ github.run_attempt }}', backend)

    def test_component_prepare_tags_are_validated_before_checkout(self):
        for component in ['frontend','backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            block=text.split('      - name: Validate release request\n',1)[1].split('      - name: Checkout',1)[0]
            script=textwrap.dedent(block.split('        run: |\n',1)[1])
            env=dict(os.environ,DEPLOY_PHASE='prepare',GITHUB_REF='refs/heads/main',REQUESTED_COMMIT='a'*40,PREPARE_REQUEST='offline-check',CHECK_RUN='123')
            for tag,expected in [(f'{component}/v0.1.2',0),('v0.1.2',1),('wrong/v0.1.2',1),(f'{component}/v0.1.2;echo bad',1)]:
                result=subprocess.run(['bash','-c',script],env=dict(env,RELEASE_TAG=tag,CONFIRMATION='deploy '+tag+'@'+'a'*40),capture_output=True,text=True)
                self.assertEqual(expected,result.returncode,(component,tag,result.stdout,result.stderr))

    def test_each_release_is_explicitly_disabled_until_repository_opt_in(self):
        for component in ['frontend','backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            self.assertIn("vars.YUANHUB_MONOREPO_DEPLOY_ENABLED == 'true'",text)
            self.assertIn('environment: '+component+'-production',text)
            self.assertIn('scripts.release_gate',text)
            self.assertIn('CHECK_RUN',text)
            self.assertIn('CONFIRMATION',text)
            self.assertNotIn('--workflow ci.yml',text)

    def test_backend_release_only_installs_successful_ci_artifacts(self):
        for component in ['backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            gate=text.split('      - name: Require concentrated release evidence\n',1)[1].split('      - name:',1)[0]
            self.assertNotIn("inputs.phase != 'prepare'", gate)
            self.assertIn('gh run download "$CI_RUN_ID"', text)
            self.assertIn('bash scripts/deploy/transfer-release.sh', text)
            for forbidden in ['git clone', 'git fetch', 'npm ci', 'npm run build', './gradlew']:
                self.assertNotIn(forbidden, text)
        deploy=(ROOT/'backend/deploy/blue-green-deploy.sh').read_text()
        self.assertNotIn('./gradlew', deploy)
        self.assertIn('PREBUILT_JAR from successful CI is required', deploy)

    def test_frontend_keeps_server_build_for_limited_bandwidth(self):
        text=(ROOT/'.github/workflows/frontend-release.yml').read_text()
        self.assertIn('REPO_URL: https://github.com/${{ github.repository }}.git', text)
        self.assertIn('npm ci --no-audit --no-fund', text)
        self.assertIn('npm run build', text)
        self.assertNotIn('transfer-release.sh', text)
        gate = text.split('      - name: Require concentrated release evidence\n', 1)[1].split('      - name:', 1)[0]
        self.assertIn('--phase "$DEPLOY_PHASE"', gate)
        self.assertIn('echo "CI_RUN_ID=$CHECK_RUN" >> "$GITHUB_ENV"', gate)
        self.assertIn('echo "YUANHUB_VERSION=${RELEASE_TAG#frontend/v}" >> "$GITHUB_ENV"', text)

    def test_backend_rejects_stale_or_missing_jar_commit_before_upload(self):
        text=(ROOT/'.github/workflows/backend-release.yml').read_text()
        block=text.split("<<'PY'\n",1)[1].split('\n          PY',1)[0]
        script=textwrap.dedent(block)
        artifacts=ROOT/'.test-artifacts'
        artifacts.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=artifacts) as directory:
            jar=Path(directory)/'app.jar'
            for content, build_version, expected in [('git.commit.id='+'a'*40,'0.1.2',0), ('git.commit.id='+'b'*40,'0.1.2',1), ('','0.1.2',1), ('git.commit.id='+'a'*40,'0.1.1',1)]:
                with zipfile.ZipFile(jar,'w') as archive:
                    archive.writestr('BOOT-INF/classes/git.properties',content+'\n')
                    archive.writestr('META-INF/build-info.properties','build.version='+build_version+'\n')
                result=subprocess.run(['python3','-c',script,str(jar),'a'*40,'0.1.2'],capture_output=True)
                self.assertEqual(result.returncode,expected,result.stderr)


if __name__=='__main__':
    unittest.main()
