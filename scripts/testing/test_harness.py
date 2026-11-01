"""Behavioral tests for the runner itself. Git commits exist ONLY in temporary fixtures."""
from __future__ import annotations
import datetime as dt
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import gate
import impact
import run


def commands_for(mode, selection):
    # Explicit scope fixture for legacy command-shape checks.
    full = selection['conservative_full']
    selection['scope'] = {'frontend': full or bool(selection['node'] or selection['behavior']),
                          'backend': full or bool(selection['unit'] or selection.get('kotlin_files')),
                          'full_frontend': full, 'full_backend': full,
                          'contract': full or 'test/contract.test.js' in selection['node'], 'runner': full}
    return run.build_commands(mode, selection)


class TemporaryProject(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='yuanhub_test_git_')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        for repository in impact.REPOSITORIES:
            directory = self.root / repository
            directory.mkdir(parents=True, exist_ok=True)
            self.command(directory, 'init', '-q')
            if not repository:
                (directory / '.gitignore').write_text('.test-artifacts/\n')
                self.command(directory, 'add', '.gitignore')
            self.command(directory, '-c', 'user.name=Local fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'temporary baseline')
        self.task = self.root / '.trellis/tasks/test-task'
        self.task.mkdir(parents=True)
        (self.task / 'task.json').write_text('{"status":"in_progress"}')
        self.manifest = {
            'risk_level': 'L3',
            'verification_owner': 'agent',
            'coverage': [],
            'exceptions': [],
            'mandatory_checks': [],
        }
        self.write_manifest()

    def command(self, root, *args):
        return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)

    def write(self, name, text='fixture'):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)
        return file

    def write_manifest(self):
        (self.task / 'test-plan.json').write_text(json.dumps(self.manifest))

    def test_nested_staged_unstaged_and_untracked_paths_with_spaces(self):
        self.write('frontend/src/pages/star/new feature.js')
        self.write('backend/src/main/kotlin/service/account/New.kt')
        self.command(self.root / 'backend', 'add', 'src')
        self.write('root-notes.md')
        changed = impact.changed_files(self.root)
        self.assertIn('frontend/src/pages/star/new feature.js', changed)
        self.assertIn('backend/src/main/kotlin/service/account/New.kt', changed)
        self.assertIn('root-notes.md', changed)
        self.assertNotIn('frontend', changed)

    def test_deleted_file_and_rename_target_are_both_preserved(self):
        old = self.write('frontend/src/pages/star/old.js')
        repo = self.root / 'frontend'
        self.command(repo, 'add', 'src')
        self.command(repo, '-c', 'user.name=Local fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'temporary source')
        old.rename(old.with_name('new.js'))
        changed = impact.changed_files(self.root)
        self.assertIn('frontend/src/pages/star/old.js', changed)
        self.assertIn('frontend/src/pages/star/new.js', changed)

    def test_invalid_base_is_not_silently_treated_as_no_changes(self):
        with self.assertRaises(RuntimeError):
            impact.changed_files(self.root, 'not-a-real-base')

    def test_reverse_import_graph_follows_multiple_hops(self):
        self.write('frontend/src/api/account.js', 'export const api = 1')
        self.write('frontend/src/store/account.js', "import {api} from '../api/account.js'")
        self.write('frontend/behavior/account.spec.js', "import '../src/store/account.js'")
        graph = impact.import_graph(self.root / 'frontend')
        dependents = impact.reverse_dependents(graph, {'src/api/account.js'})
        self.assertIn('behavior/account.spec.js', dependents)
        self.assertIn('src/store/account.js', dependents)

    def test_star_changes_select_migration_and_account_behaviors(self):
        for name in ['starState', 'legacyHostAccountMigration.indexeddb', 'account']:
            self.write(f'frontend/test/{name}.test.js', 'import test from "node:test"')
        self.write('frontend/test/unrelated.test.js')
        result = impact.infer(self.root, ['frontend/src/pages/star/bridge.js'])
        for name in ['starState', 'legacyHostAccountMigration.indexeddb', 'account']:
            self.assertIn(f'test/{name}.test.js', result['node'])
        self.assertNotIn('test/unrelated.test.js', result['node'])

    def test_account_service_changes_select_cascade_domains(self):
        for domain in ['account', 'star', 'inventory', 'operator']:
            self.write(f'backend/src/test/kotlin/service/{domain}/{domain.title()}ServiceTest.kt',
                       f'package example.service.{domain}\nclass {domain.title()}ServiceTest {{}}')
        result = impact.infer(self.root, ['backend/src/main/kotlin/service/account/SubAccountService.kt'])
        self.assertEqual(4, len(result['unit']))
        self.assertTrue({'account', 'star', 'inventory', 'operator'} <= set(result['domains']))

    def test_changed_backend_regression_is_selected_even_without_a_matching_domain_name(self):
        name = 'backend/src/test/kotlin/regression/IndependentRegressionTest.kt'
        self.write(name, 'package regression\nclass IndependentRegressionTest {}')
        result = impact.infer(self.root, ['backend/src/main/kotlin/service/star/StarRule.kt', name])
        self.assertIn('regression.IndependentRegressionTest', result['unit'])

    def test_unknown_source_and_shared_dependencies_conservatively_select_all(self):
        self.write('frontend/test/a.test.js')
        self.write('frontend/test/b.test.js')
        for path in ['frontend/src/utils/completelyNovelLogic.js', 'frontend/package.json']:
            with self.subTest(path=path):
                result = impact.infer(self.root, [path])
                self.assertTrue(result['conservative_full'])
                self.assertEqual(2, len(result['node']))

    def test_scale_only_methods_are_not_selected_as_unit_tests(self):
        self.write('backend/src/test/kotlin/integration/ScaleTest.kt', '''package integration
class ScaleTest {
    @Tag("realistic") fun realistic() {}
    @Tag("stress") fun stress() {}
}''')
        self.write('backend/src/test/kotlin/unit/OrdinaryTest.kt', 'package unit\nclass OrdinaryTest {}')
        for changes in [[], ['backend/src/test/kotlin/integration/ScaleTest.kt']]:
            with self.subTest(changes=changes):
                selection = impact.infer(self.root, changes)
                self.assertEqual(['unit.OrdinaryTest'] if changes else [], selection['unit'])

    def test_default_gradle_excludes_scale_tags_and_preserves_explicit_suites(self):
        # Real Gradle/JUnit discovery remains a separate user/CI check.
        source = (run.ROOT / 'backend/build.gradle.kts').read_text()
        default = source.split('tasks.test {', 1)[1].split('\n}', 1)[0]
        for tag in ['integration', 'architecture', 'api-schema', 'realistic', 'stress']:
            self.assertIn('"' + tag + '"', default)
        for task, tag in [('realisticTest', 'realistic'), ('stressTest', 'stress')]:
            self.assertIn(f'isolatedSuite("{task}", "{tag}")', source)
        self.assertIn('useJUnitPlatform { includeTags(tag) }', source)
        self.assertIn('tasks.check { dependsOn(integrationTest, realisticTest, architectureTest, apiSchemaTest) }', source)

    def test_current_task_documents_expand_relevant_test_selection(self):
        (self.task / 'prd.md').write_text('This change must preserve star account migration.')
        self.write('frontend/test/starState.test.js')
        result = impact.infer(self.root, ['frontend/src/pages/works/card.js'], self.task)
        self.assertIn('test/starState.test.js', result['node'])
        self.assertIn('.trellis/tasks/test-task/prd.md', result['task_documents'])

    def test_task_resolution_never_accepts_an_external_path(self):
        self.assertEqual(self.task, impact.current_task(self.root))
        with self.assertRaises(ValueError):
            impact.current_task(self.root, '../elsewhere')
        other = self.root / '.trellis/tasks/other'
        other.mkdir(); (other / 'task.json').write_text('{"status":"in_progress"}')
        (other / 'test-plan.json').write_text('{}')
        self.assertIsNone(impact.current_task(self.root))

    def test_existing_test_name_alone_cannot_satisfy_new_code_coverage(self):
        source = 'frontend/src/pages/star/bridge.js'
        test = 'frontend/test/starState.test.js'
        self.write(source); self.write(test)
        self.manifest['coverage'] = [{'sources': [source], 'tests': [test], 'invariants': ['canonical identity is preserved']}]
        self.write_manifest()
        gaps, _ = impact.coverage_gaps(self.root, [source], self.task)
        self.assertEqual([source], gaps)
        gaps, reviewed = impact.coverage_gaps(self.root, [source, test], self.task)
        self.assertFalse(gaps); self.assertEqual([test], reviewed[0]['tests'])

    def test_exemptions_are_exact_file_and_require_a_real_explanation(self):
        first = 'frontend/src/a.js'; second = 'frontend/src/b.js'
        self.manifest['exceptions'] = [{'sources': [first], 'reason': 'TODO'}]
        self.write_manifest()
        self.assertEqual([first], impact.coverage_gaps(self.root, [first], self.task)[0])
        self.manifest['exceptions'][0]['reason'] = 'Pre-existing unrelated user modification preserved byte-for-byte; this task does not own this source.'
        self.write_manifest()
        self.assertEqual([second], impact.coverage_gaps(self.root, [first, second], self.task)[0])

    def test_fingerprint_tracks_code_tests_and_plan_but_not_completion_prose(self):
        source = 'frontend/src/a.js'; test = 'frontend/test/a.test.js'
        self.write(source, 'a'); self.write(test, 'test')
        changes = [source, test, '.trellis/tasks/test-task/implement.md']
        before = impact.fingerprint(self.root, changes, self.task)
        (self.task / 'implement.md').write_text('Marked a verified step complete')
        self.assertEqual(before, impact.fingerprint(self.root, changes, self.task))
        self.write(source, 'b')
        self.assertNotEqual(before, impact.fingerprint(self.root, changes, self.task))
        after = impact.fingerprint(self.root, changes, self.task)
        self.manifest['mandatory_checks'] = ['integration']; self.write_manifest()
        self.assertNotEqual(after, impact.fingerprint(self.root, changes, self.task))

    def valid_report(self, changes=None):
        changes = changes or []
        return {'task': self.task.relative_to(self.root).as_posix(), 'mode': 'smart', 'success': True,
                'completion_eligible': True, 'fingerprint': impact.fingerprint(self.root, changes, self.task),
                'missing_tests': [], 'started_at': dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ'),
                'checks': [{'name': name, 'exit_code': 0} for name in ['runner-self-tests', 'frontend-source', 'backend-compile', 'backend-ktlint', 'architecture']],
                'junit': {'architecture': {'tests': 4, 'passed': 4, 'failures': 0, 'errors': 0, 'skipped': 0}}}

    def test_completion_rejects_quick_stale_wrong_task_and_failed_checks(self):
        report = self.valid_report()
        self.assertEqual([], gate.validate_report(self.root, self.task, report, []))
        for key, value in [('mode', 'quick'), ('fingerprint', 'stale'), ('task', 'other'), ('success', False)]:
            with self.subTest(key=key):
                self.assertTrue(gate.validate_report(self.root, self.task, {**report, key: value}, []))
        report['checks'][0]['exit_code'] = 1
        self.assertTrue(gate.validate_report(self.root, self.task, report, []))

    def test_completion_rejects_skips_and_zero_test_suites(self):
        for counts in [{'tests': 0}, {'tests': 4, 'skipped': 1}]:
            report = self.valid_report(); report['junit'] = {'integration': counts}
            self.assertTrue(gate.validate_report(self.root, self.task, report, []))

    def test_completion_requires_declared_database_and_regression_evidence(self):
        self.manifest['mandatory_checks'] = ['integration']
        self.manifest['regressions'] = [{'name': 'historical migration', 'red_log': '.test-artifacts/red.log', 'green_log': '.test-artifacts/green.log'}]
        self.write_manifest()
        report = self.valid_report()
        self.assertTrue(gate.validate_report(self.root, self.task, report, []))
        report['checks'].append({'name': 'integration', 'exit_code': 0})
        self.write('.test-artifacts/red.log', 'real failing assertion'); self.write('.test-artifacts/red.exit', '1')
        self.write('.test-artifacts/green.log', 'passing assertion'); self.write('.test-artifacts/green.exit', '0')
        self.assertEqual([], gate.validate_report(self.root, self.task, report, []))
        self.write('.test-artifacts/red.exit', '0')
        self.assertTrue(gate.validate_report(self.root, self.task, report, []))

    def test_completion_rejects_old_evidence(self):
        report = self.valid_report()
        report['started_at'] = '20200101T000000.000000Z'
        self.assertTrue(gate.validate_report(self.root, self.task, report, []))

    def test_quick_never_runs_database_or_mutation_but_all_runs_them(self):
        selection = {'conservative_full': True, 'unit': ['ExampleTest'], 'node': [], 'behavior': [], 'integration': ['MongoTest'], 'api': [], 'domains': ['star']}
        quick = {c[0] for c in commands_for('quick', selection)}
        full = {c[0] for c in commands_for('all', selection)}
        self.assertFalse({'integration', 'realistic', 'stress', 'api-schema', 'mutation'} & quick)
        self.assertTrue({'integration', 'realistic', 'api-schema', 'mutation', 'frontend-build', 'backend-build'} <= full)
        self.assertNotIn('stress', full)

    def test_workspace_full_and_conservative_modes_explicitly_run_contract_once(self):
        for mode in ['quick', 'smart', 'all']:
            selection = {'conservative_full': mode != 'all', 'unit': [], 'node': ['test/contract.test.js'],
                         'behavior': [], 'integration': [], 'api': [], 'domains': []}
            with self.subTest(mode=mode):
                commands = commands_for(mode, selection)
                self.assertEqual(1, sum(name == 'frontend-contract' for name, _, _ in commands))
                by_name = {name: command for name, _, command in commands}
                self.assertEqual(['npm', 'run', 'test:repo'], by_name['frontend-node'])
                self.assertEqual(['npm', 'run', 'test:contract'], by_name['frontend-contract'])

    def test_targeted_contract_is_separate_and_never_leaves_an_empty_node_command(self):
        for node in [['test/contract.test.js'], ['test/ordinary.test.js', 'test/contract.test.js'], ['test/ordinary.test.js']]:
            selection = {'conservative_full': False, 'unit': [], 'node': node,
                         'behavior': [], 'integration': [], 'api': [], 'domains': []}
            with self.subTest(node=node):
                commands = {name: command for name, _, command in commands_for('smart', selection)}
                self.assertEqual('test/contract.test.js' in node, 'frontend-contract' in commands)
                if 'test/ordinary.test.js' in node:
                    self.assertEqual(['node', '--test', 'test/ordinary.test.js'], commands['frontend-node'])
                else:
                    self.assertNotIn('frontend-node', commands)

    def test_affected_ktlint_forces_rerun_instead_of_reusing_unfiltered_outputs(self):
        kotlin_file = 'src/test/kotlin/com/lhs/share/integration/RealisticFixtureScaleTest.kt'
        selection = {
            'conservative_full': False,
            'unit': [],
            'node': [],
            'behavior': [],
            'integration': [],
            'api': [],
            'domains': [],
            'kotlin_files': [kotlin_file],
        }
        commands = {name: command for name, _, command in commands_for('quick', selection)}
        affected = commands['backend-ktlint-affected']
        self.assertIn('-PstrictKtlint=true', affected)
        self.assertIn('-PktlintFiles=' + kotlin_file, affected)
        self.assertIn('--rerun-tasks', affected)

    def test_stress_is_explicit_and_does_not_repeat_the_entire_all_suite(self):
        selection = {'conservative_full': True, 'unit': ['ExampleTest'], 'node': [], 'behavior': [], 'integration': ['MongoTest'], 'api': [], 'domains': ['star']}
        stress = {c[0] for c in commands_for('stress', selection)}
        self.assertIn('stress', stress)
        self.assertFalse({'backend-unit', 'integration', 'realistic', 'api-schema', 'mutation', 'frontend-build', 'backend-build'} & stress)
        self.assertTrue({'runner-self-tests', 'backend-compile', 'backend-ktlint', 'architecture'} <= stress)

    def test_runner_removes_live_connection_overrides_without_requiring_docker(self):
        with patch.dict(os.environ, {'SPRING_PROFILES_ACTIVE': 'prod', 'SHARE_MONGO_HUB_URI': 'mongodb://production/HubBackend',
                                     'BETA_TEST_MONGO_URI': 'mongodb://production/HubBackend', 'DOCKER_HOST': 'unix:///tmp/test.sock'}):
            env = run.environment()
            self.assertEqual('test', env['SPRING_PROFILES_ACTIVE'])
            self.assertIn('127.0.0.1:1/yuanhub_test_', env['SHARE_MONGO_HUB_URI'])
            self.assertNotIn('BETA_TEST_MONGO_URI', env)
        with patch.dict(os.environ, {'DOCKER_HOST': 'tcp://remote.example.invalid:2375'}):
            self.assertEqual('test', run.environment()['SPRING_PROFILES_ACTIVE'])

    def test_preexisting_exception_cannot_silently_exempt_new_edits_to_the_same_file(self):
        import hashlib
        source = 'frontend/src/preexisting.js'
        self.write(source, 'original user work')
        self.manifest['exceptions'] = [{'sources': [source], 'reason': 'Pre-existing unrelated user changes are preserved exactly and are outside this task scope.',
                                        'baseline_sha256': hashlib.sha256((self.root / source).read_bytes()).hexdigest()}]
        self.write_manifest()
        self.assertFalse(impact.coverage_gaps(self.root, [source], self.task)[0])
        self.write(source, 'new changes cannot reuse the old exception')
        self.assertEqual([source], impact.coverage_gaps(self.root, [source], self.task)[0])

    def test_bugfix_cannot_finish_with_an_empty_regression_list(self):
        self.manifest['change_kind'] = 'bugfix'; self.write_manifest()
        self.assertTrue(gate.validate_report(self.root, self.task, self.valid_report(), []))

    def test_user_owned_verification_does_not_require_smart_or_all_report(self):
        source = 'frontend/src/pages/star/notice.js'
        self.write(source)
        self.manifest.update({
            'risk_level': 'L0',
            'verification_owner': 'user',
            'change_kind': 'non_behavior',
            'exceptions': [{
                'sources': [source],
                'reason': 'Copy-only runtime edit with no state, API, persistence, routing, or interaction behavior change.'
            }],
        })
        self.write_manifest()
        self.assertEqual([], gate.completion_gate(self.root, self.task))

    def test_agent_owned_l3_still_requires_fresh_smart_or_all_report(self):
        source = 'frontend/src/pages/star/behavior.js'
        test = 'frontend/test/starBehavior.test.js'
        self.write(source)
        self.write(test)
        self.command(self.root / 'frontend', 'add', 'src', 'test')
        self.manifest.update({
            'risk_level': 'L3',
            'verification_owner': 'agent',
            'coverage': [{
                'sources': [source],
                'tests': [test],
                'invariants': ['observable star behavior remains correct'],
            }],
        })
        self.write_manifest()
        errors = gate.completion_gate(self.root, self.task)
        self.assertTrue(any('local verification report' in error for error in errors))

    def test_unclassified_new_task_cannot_finish(self):
        self.manifest['risk_level'] = 'unclassified'
        self.manifest['verification_owner'] = 'user'
        self.write_manifest()
        self.assertTrue(any('risk_level' in error for error in gate.completion_gate(self.root, self.task)))

    def test_junit_counts_include_failures_errors_and_skips(self):
        folder = self.root / 'results'; folder.mkdir()
        (folder / 'TEST-example.xml').write_text('<testsuite tests="10" failures="1" errors="1" skipped="2"/>')
        self.assertEqual({'tests': 10, 'passed': 6, 'failures': 1, 'errors': 1, 'skipped': 2}, run.junit_counts(folder))


if __name__ == '__main__':
    unittest.main()
