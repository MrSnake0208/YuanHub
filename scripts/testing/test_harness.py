"""Behavioral tests for the runner itself. Git commits exist ONLY in temporary fixtures."""
from __future__ import annotations
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
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

    def command(self, root, *args):
        return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)

    def write(self, name, text='fixture'):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)
        return file

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

    def test_memory_notes_do_not_expand_diff_test_selection(self):
        self.write('.trellis/research/old-decision.md', 'star account migration')
        self.write('frontend/test/works.test.js')
        self.write('frontend/test/starState.test.js')
        result = impact.infer(self.root, ['frontend/src/pages/works/card.js'])
        self.assertIn('test/works.test.js', result['node'])
        self.assertNotIn('test/starState.test.js', result['node'])

    def test_fingerprint_tracks_code_tests_and_deletions_but_not_memory(self):
        source = 'frontend/src/a.js'; test = 'frontend/test/a.test.js'
        self.write(source, 'a'); self.write(test, 'test')
        changes = [source, test, '.trellis/research/decision.md']
        before = impact.fingerprint(self.root, changes)
        self.write('.trellis/research/decision.md', 'A reusable decision')
        self.assertEqual(before, impact.fingerprint(self.root, changes))
        self.write(source, 'b')
        after = impact.fingerprint(self.root, changes)
        self.assertNotEqual(before, after)
        self.write(test, 'updated assertion')
        updated = impact.fingerprint(self.root, changes)
        self.assertNotEqual(after, updated)
        (self.root / source).unlink()
        self.assertNotEqual(updated, impact.fingerprint(self.root, changes))

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

    def test_junit_counts_include_failures_errors_and_skips(self):
        folder = self.root / 'results'; folder.mkdir()
        (folder / 'TEST-example.xml').write_text('<testsuite tests="10" failures="1" errors="1" skipped="2"/>')
        self.assertEqual({'tests': 10, 'passed': 6, 'failures': 1, 'errors': 1, 'skipped': 2}, run.junit_counts(folder))


if __name__ == '__main__':
    unittest.main()
