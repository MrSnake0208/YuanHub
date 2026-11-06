"""Focused regression checks; never start application, database or browser services."""
import unittest
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch
import impact
import run
from test_harness import TemporaryProject


class ScopeTest(unittest.TestCase):
    setUp = TemporaryProject.setUp
    command = TemporaryProject.command
    write = TemporaryProject.write
    def test_css_and_documentation_select_no_execution(self):
        for path in ['frontend/src/pages/recruitment/recruitmentPreviewMobile.css', 'docs/guide.md']:
            selected = impact.infer(self.root, [path])
            self.assertEqual([], run.build_commands('smart', selected))

    def test_frontend_and_backend_unknowns_do_not_cross_components(self):
        self.write('frontend/behavior/example.spec.js')
        self.write('backend/src/test/kotlin/ExampleTest.kt', 'class ExampleTest {}')
        front = impact.infer(self.root, ['frontend/src/unknown.js'])
        back = impact.infer(self.root, ['backend/src/main/kotlin/Unknown.kt'])
        self.assertEqual([], front['unit'])
        self.assertEqual([], back['behavior'])
        self.assertEqual([], back['node'])
        self.assertNotIn('runner-self-tests', [x[0] for x in run.build_commands('smart', front)])

    def test_contract_direct_inputs_select_contract(self):
        contract = (run.ROOT / 'frontend/test/contract.test.js').read_text()
        self.write('frontend/test/contract.test.js', contract)
        for path in ['frontend/src/pages/user/profile.vue', 'frontend/src/router/routes.js',
                     'frontend/src/utils/openApiToken.js', 'frontend/src/components/GameAccountManager.vue']:
            selected = impact.infer(self.root, [path])
            self.assertIn('frontend-contract', [x[0] for x in run.build_commands('smart', selected)])

    def test_controller_change_selects_contract_without_full_frontend(self):
        selected = impact.infer(self.root, ['backend/src/main/kotlin/hub/controller/inventory/Inventory.kt'])
        self.assertEqual(['test/contract.test.js'], selected['node'])
        self.assertEqual([], selected['behavior'])
        self.assertIn('frontend-contract', [x[0] for x in run.build_commands('smart', selected)])

    def test_shared_configuration_selects_both_and_runner_only_when_affected(self):
        for path in ['dev.sh', '.github/workflows/pr-ci.yml', 'scripts/testing/impact.py']:
            selected = impact.infer(self.root, [path])
            self.assertTrue(selected['scope']['full_frontend'])
            self.assertTrue(selected['scope']['full_backend'])
            self.assertEqual(path.startswith('scripts/testing/'), selected['scope']['runner'])

    def test_deleted_unknown_source_retains_component_fallback(self):
        old = self.write('frontend/src/deleted.js')
        self.command(self.root, 'add', 'frontend')
        self.command(self.root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', 'commit', '-qm', 'fixture')
        old.unlink()
        selected = impact.infer(self.root, impact.changed_files(self.root))
        self.assertTrue(selected['scope']['full_frontend'])
        self.assertFalse(selected['scope']['backend'])

    def test_targeted_integration_keeps_selected_classes(self):
        selected = impact.infer(self.root, ['backend/src/main/kotlin/inventory/InventoryService.kt'])
        selected['integration'] = ['example.InventoryTransactionTest']
        commands = {name: argv for name, _, argv in run.build_commands('smart', selected)}
        self.assertEqual(['--tests', 'example.InventoryTransactionTest'], commands['integration'][-2:])
        full = {name: argv for name, _, argv in run.build_commands('all', selected)}
        self.assertNotIn('--tests', full['integration'])

    def test_smart_needs_no_task_or_coverage_manifest(self):
        self.write('frontend/src/example.js', 'export const value = 1')
        self.write('.trellis/scripts/task.py', 'raise AssertionError("retired CLI must not run")')
        self.write('.trellis/tasks/old/task.json', '{invalid old metadata')
        with patch.object(run, 'ROOT', self.root), \
                patch('run.environment', return_value={'PATH': '', 'FC_SEED': '1'}), \
                patch('run.execute_plan', return_value=([], 'completed')):
            self.assertEqual(0, run.main(['smart']))
        report = json.loads((self.root / '.test-artifacts/latest-smart.json').read_text())
        self.assertTrue(report['success'])
        self.assertNotIn('completion_eligible', report)

    def test_source_changes_during_execution_invalidate_report(self):
        self.write('frontend/src/example.js', 'before')
        def execute(*args):
            self.write('frontend/src/example.js', 'after')
            return [], 'completed'
        with patch.object(run, 'ROOT', self.root), \
                patch('run.environment', return_value={'PATH': '', 'FC_SEED': '1'}), \
                patch('run.execute_plan', side_effect=execute):
            self.assertEqual(1, run.main(['smart']))
        report = json.loads((self.root / '.test-artifacts/latest-smart.json').read_text())
        self.assertFalse(report['source_unchanged'])
        self.assertFalse(report['success'])

    def test_skipped_or_empty_junit_suite_cannot_pass_report(self):
        self.write('backend/src/main/kotlin/Example.kt')
        for counts in [{'tests': 0, 'skipped': 0}, {'tests': 4, 'skipped': 1}]:
            with self.subTest(counts=counts), patch.object(run, 'ROOT', self.root), \
                    patch('run.environment', return_value={'PATH': '', 'FC_SEED': '1'}), \
                    patch('run.execute_plan', return_value=([{
                        'name': 'backend-unit', 'exit_code': 0, 'counts': counts,
                        'seconds': 0, 'log': 'fixture.log',
                    }], 'completed')):
                self.assertEqual(1, run.main(['smart']))

    def test_clean_committed_pr_requires_base_before_execution(self):
        with patch.object(run, 'ROOT', self.root), patch('run.environment', return_value={}), \
                patch('run.changed_files', return_value=[]), patch('run.execute') as execute:
            with self.assertRaisesRegex(ValueError, '--base'):
                run.main(['quick'])
            execute.assert_not_called()


class ExecutionTest(unittest.TestCase):
    def test_real_command_timeout_and_zero_discovery_are_not_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(run, 'ROOT', root):
                timed = run.execute('owned-sleeper', root, [sys.executable, '-c', 'import time; time.sleep(5)'],
                                    dict(os.environ), root, .05)
                self.assertEqual(124, timed['exit_code'])
                empty = run.execute('frontend-node', root, [sys.executable, '-c', 'print("# tests 0")'],
                                    dict(os.environ), root, 5)
                self.assertEqual(1, empty['exit_code'])
                self.assertIn('evidence_error', empty)

    def test_old_junit_is_discarded_and_test_task_forced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results = root / 'backend/build/test-results/test'
            results.mkdir(parents=True)
            old = results / 'TEST-old.xml'
            old.write_text('<testsuite tests="3"/>')
            with patch.object(run, 'ROOT', root), patch('run.subprocess.Popen') as process:
                process.return_value.wait.return_value = 0
                result = run.execute('backend-unit', root, ['./gradlew', 'test', '--console=plain'], {}, root, 5)
            self.assertFalse(old.exists())
            self.assertIn('--rerun', process.call_args.args[0])
            self.assertEqual(1, result['exit_code'])
            self.assertEqual(0, result['counts']['tests'])

    def test_failed_prerequisite_stops_remaining_commands(self):
        commands = [('compile', Path('.'), ['false']), ('test', Path('.'), ['true'])]
        with patch('run.execute', return_value={'exit_code': 1}) as execute:
            checks, status = run.execute_plan(commands, {}, Path('.'), 30, 60)
        self.assertEqual('failed', status)
        self.assertEqual(1, len(checks))
        self.assertEqual(1, execute.call_count)

    def test_total_budget_is_not_reset_per_command(self):
        commands = [('one', Path('.'), ['true']), ('two', Path('.'), ['true'])]
        with patch('run.time.monotonic', side_effect=[0, 1, 11]), \
                patch('run.execute', return_value={'exit_code': 0}) as execute:
            checks, status = run.execute_plan(commands, {}, Path('.'), 900, 10)
        self.assertEqual('budget_exhausted', status)
        self.assertEqual(1, len(checks))
        self.assertEqual(9, execute.call_args.args[-1])

    def test_frontend_zero_skip_and_failure_are_visible(self):
        for text, label, expected in [
            ('# tests 0\n# fail 0', 'frontend-node', {'tests': 0, 'failures': 0, 'skipped': 0}),
            ('ℹ tests 4\nℹ fail 1\nℹ skipped 2', 'frontend-contract', {'tests': 4, 'failures': 1, 'skipped': 2}),
            (' Tests 3 passed | 1 skipped (4)', 'frontend-behavior', {'tests': 4, 'failures': 0, 'skipped': 1}),
        ]:
            self.assertEqual(expected, run.frontend_counts(text, label))


if __name__ == '__main__':
    unittest.main()
