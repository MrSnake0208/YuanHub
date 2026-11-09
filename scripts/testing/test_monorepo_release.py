"""Release safety checks use temporary Git repos and mocked GitHub/production reads."""
import argparse
from datetime import datetime, timezone, timedelta
import json
import os
import sys
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import mock_open, patch

from scripts import release, release_gate as gate

SHA = 'a' * 40
NOW = datetime.now(timezone.utc)


def successful_run():
    return dict(id=12, run_attempt=1, head_sha=SHA, head_branch='main', event='workflow_dispatch',
                path='.github/workflows/release-check.yml', status='completed', conclusion='success',
                updated_at=NOW.isoformat(), repository=dict(full_name=gate.REPO))


def manifest():
    return dict(sha=SHA, run_id=12, attempt=1, checks='artifact-only',
                versions=dict(frontend='1.2.3', backend='4.5.6'), stress=False, frontend_api_base='https://api.example')


def local_tests(components=('frontend', 'backend'), stress=False):
    return dict(sha=SHA, components=list(components), stress=stress, success=True,
                started_at=1, finished_at=2,
                commands=[dict(component=c, cwd=cwd, command=args, returncode=0, log='fixture.log',
                               started_at=1, finished_at=2)
                          for c in components for cwd, args in release.local_test_commands(c, stress)])


def frontend_prepared():
    return dict(run_id=13, headSha=SHA, status='completed', conclusion='success', url='https://example/run/13')


class ReleaseGateTest(unittest.TestCase):
    def test_exact_completed_successful_main_run_only(self):
        run = successful_run()
        gate.validate_run(run, SHA, NOW)
        for key, values in dict(head_sha=['b'*40], head_branch=['feature'], event=['push', 'pull_request'],
                                path=['.github/workflows/frontend-ci.yml'], status=['queued','in_progress'],
                                conclusion=['failure','cancelled','skipped','timed_out',None],
                                repository=[dict(full_name='other/repo')]).items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    gate.validate_run(dict(run, **{key: value}), SHA, NOW)
        for delta in (timedelta(days=8), timedelta(seconds=-1)):
            with self.assertRaises(ValueError):
                gate.validate_run(dict(run, updated_at=(NOW-delta).isoformat()), SHA, NOW)

    def test_manifest_binds_version_sha_attempt_and_api_configuration(self):
        run, evidence = successful_run(), manifest()
        gate.validate_manifest(evidence, run, SHA, 'frontend', '1.2.3', 'https://api.example')
        for key, value in [('sha','b'*40),('attempt',2),('run_id',13),('checks','partial'),('checks','complete'),('checks',None)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                gate.validate_manifest(dict(evidence, **{key:value}), run, SHA)
        for component, version, api in [('frontend','1.2.4',None),('backend','1.2.3',None),('frontend','1.2.3','https://changed')]:
            with self.assertRaises(ValueError):
                gate.validate_manifest(evidence, run, SHA, component, version, api)
        with self.assertRaises(ValueError):
            gate.validate_manifest(evidence, dict(run, run_attempt=2), SHA)

    def test_prepare_admits_only_matching_nonfailed_run_identity(self):
        run = successful_run()
        for status in ('queued', 'in_progress', 'completed'):
            for conclusion in (None, '', 'success'):
                gate.validate_run(dict(run, status=status, conclusion=conclusion), SHA, phase='prepare')
        for key, values in dict(head_sha=['b'*40], head_branch=['feature'], event=['push', 'pull_request'],
                                path=['.github/workflows/frontend-ci.yml'], status=['waiting', 'pending'],
                                conclusion=['failure', 'cancelled', 'skipped', 'timed_out'],
                                repository=[dict(full_name='other/repo')]).items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    gate.validate_run(dict(run, **{key: value}), SHA, phase='prepare')
        # Prebuild does not depend on evidence age, manifests, JARs or live baselines.
        queued = dict(run, status='queued', conclusion=None, updated_at='unused')
        with patch.object(gate, 'command', return_value=json.dumps(queued)) as command:
            self.assertEqual(queued, gate.verify(12, SHA, phase='prepare'))
        command.assert_called_once_with('gh', 'api', f'repos/{gate.REPO}/actions/runs/12')
        with patch('sys.argv', ['gate', '--run', '12', '--commit', SHA, '--phase', 'prepare',
                               '--component', 'frontend', '--version', '1.2.3', '--deployment-url', 'https://example']), \
                patch.object(gate, 'command', return_value=json.dumps(queued)) as command, \
                patch.object(gate, 'deployed') as deployed, \
                patch.dict(os.environ, GITHUB_ENV='fixture-env'), patch('builtins.open', mock_open()) as output:
            gate.main()
        self.assertEqual(1, command.call_count)
        deployed.assert_not_called()
        output().write.assert_called_once_with('CI_ARTIFACT_SUFFIX=' + SHA + '-1\n')

    def test_missing_or_expired_evidence_cannot_be_downloaded(self):
        for artifacts in ([], [dict(name='release-candidate-12-1', expired=True)]):
            with patch.object(gate, 'command', side_effect=[json.dumps(successful_run()),json.dumps([dict(artifacts=artifacts)])]) as call:
                with self.assertRaisesRegex(ValueError,'missing or expired'):
                    gate.verify(12,SHA)
                self.assertEqual(call.call_count, 2)

    def test_gate_downloads_only_this_attempt(self):
        def gh(*args):
            if args[:2] == ('gh','api'):
                if '--slurp' in args:
                    return json.dumps([dict(artifacts=[dict(name='release-candidate-12-1',expired=False),dict(name='yuanhub-backend-jar-'+SHA+'-1',expired=False)])])
                return json.dumps(successful_run())
            Path(args[-1], 'candidate.json').write_text(json.dumps(manifest()))
            return ''
        with patch.object(gate,'command',side_effect=gh) as calls:
            self.assertEqual(gate.verify(12,SHA)['sha'],SHA)
        self.assertIn('release-candidate-12-1', calls.call_args.args)

    def test_frontend_activation_requires_selected_backend_readiness(self):
        with patch('sys.argv',['gate','--run','12','--commit',SHA,'--component','frontend','--version','1.2.3','--backend-url','https://api.example']), \
                patch.object(gate,'verify',return_value=manifest()), \
                patch.object(gate,'deployed',return_value=dict(version='4.5.5',commit='b'*40)):
            with self.assertRaisesRegex(ValueError,'not ready'):
                gate.main()

    def test_actual_gh_cli_protocol_with_no_network(self):
        root = release.ROOT/'.test-artifacts'
        root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as folder:
            folder = Path(folder)
            fixture = dict(run=successful_run(),manifest=manifest())
            (folder/'fixture.json').write_text(json.dumps(fixture))
            fake = folder/'gh'
            fake.write_text('#!' + sys.executable + '\n' + r'''import json, os, pathlib, sys
root = pathlib.Path(os.environ['FAKE_GH_ROOT'])
args = sys.argv[1:]
fixture = json.loads((root/'fixture.json').read_text())
with (root/'calls').open('a') as stream:
    stream.write(json.dumps(args)+'\n')
if args[0] == 'api':
    if '--slurp' in args:
        print(json.dumps([dict(artifacts=[dict(name='release-candidate-12-1',expired=False),dict(name='yuanhub-backend-jar-'+fixture['manifest']['sha']+'-1',expired=False)])]))
    else:
        print(json.dumps(fixture['run']))
elif args[:2] == ['run','download']:
    assert args[2] == '12' and args[args.index('--repo')+1] == 'MrSnake0208/YuanHub'
    assert args[args.index('--name')+1] == 'release-candidate-12-1'
    (pathlib.Path(args[args.index('--dir')+1])/'candidate.json').write_text(json.dumps(fixture['manifest']))
elif args[:2] == ['workflow','run']:
    assert args[2] == 'release-check.yml'
    assert args[args.index('--ref')+1] == 'main'
elif args[:2] == ['run','list']:
    print(json.dumps([dict(databaseId=12,displayTitle='unique request')]))
else:
    raise AssertionError(args)
''')
            fake.chmod(0o755)
            with patch.dict(os.environ,PATH=str(folder)+os.pathsep+os.environ['PATH'],FAKE_GH_ROOT=str(folder)):
                run_id = release.dispatch('release-check.yml',dict(commit=SHA),'unique request')
                self.assertEqual(run_id,12)
                self.assertEqual(gate.verify(run_id,SHA)['versions'],manifest()['versions'])
            calls = [json.loads(line) for line in (folder/'calls').read_text().splitlines()]
            self.assertEqual(len(calls),5)



class ReleasePlanTest(unittest.TestCase):
    def test_offline_preview_has_no_network_or_mutation(self):
        with patch('sys.argv',['release','--dry-run','--backend','0.1.40']), \
                patch.object(release,'command',return_value=SHA) as read:
            release.main()
        read.assert_called_once_with('git','rev-parse','HEAD')

    def test_no_implicit_publish(self):
        with patch('sys.argv',['release','--frontend','1.2.3','--yes']), patch.object(release,'command') as call:
            with self.assertRaisesRegex(ValueError,'no implicit'):
                release.main()
            call.assert_not_called()

    def test_prepare_refuses_feature_branch_before_network(self):
        with patch('sys.argv',['release','--prepare']), patch.object(release,'command',return_value='feature/work') as call:
            with self.assertRaisesRegex(ValueError,'main branch'):
                release.main()
            call.assert_called_once_with('git','branch','--show-current')

    def test_prepare_requires_clean_matching_remote_main(self):
        for outputs, expected in [(['main',' M file'],'dirty'),
                                  (['main','',f'https://github.com/{gate.REPO}.git','',SHA,'b'*40],'differs')]:
            with patch.object(release,'command',side_effect=outputs):
                with self.assertRaisesRegex(ValueError,expected):
                    release.require_main()

    def test_local_candidate_cannot_relabel_commit_tag_or_workflow(self):
        for field, value in [('commit','b'*40),('tag','frontend/v7.8.9'),('workflow','other.yml')]:
            state = dict(sha=SHA,run_id=12,rows=release.plan('1.2.3','4.5.6',SHA),stress=False,baselines={})
            evidence = dict(manifest(),baselines={})
            state['rows'][1][field] = value
            with patch.object(release,'verify',return_value=evidence):
                with self.assertRaisesRegex(ValueError,'frozen plan'):
                    release.candidate_evidence(state,{})

    def test_versions_are_independent_and_need_no_version_file_edit(self):
        rows = release.plan('9.8.7','0.1.40',SHA)
        self.assertEqual(['backend','frontend'],[r['component'] for r in rows])
        self.assertEqual('backend/v0.1.40', rows[0]['tag'])
        self.assertEqual('frontend/v9.8.7', rows[1]['tag'])
        for invalid in ('../../invalid','v1','01.2.3','1.2.3;echo bad'):
            with self.assertRaises(ValueError):
                release.plan(invalid,None,SHA)

    def test_new_candidate_does_not_inherit_old_run(self):
        with tempfile.TemporaryDirectory(dir=release.ROOT/'.test-artifacts') as folder:
            state = Path(folder)/'candidate.json'
            state.write_text(json.dumps(dict(sha='b'*40,run_id=1)))
            args = argparse.Namespace(frontend='1.2.3',backend=None,dry_run=False,stress=False)
            with patch.object(release,'STATE',state), patch.object(release,'require_main',return_value=SHA), \
                    patch.object(release,'variables',return_value={}), \
                    patch.object(release,'deployed',return_value=dict(version='1.2.2',commit='c'*40)), \
                    patch.object(release,'changed',return_value=['frontend/main.js']), \
                    patch.object(release,'ensure_tag'), patch.object(release,'dispatch',side_effect=[12,13]) as dispatch, \
                    patch.object(release,'run_local_tests',return_value=local_tests(('frontend',))), \
                    patch.object(release,'wait_run',side_effect=lambda run_id: dict(frontend_prepared(), run_id=run_id)), \
                    patch.object(release,'candidate_evidence'), \
                    patch.object(release,'command',side_effect=[SHA,'']):
                release.prepare(args)
            frozen = json.loads(state.read_text())
            self.assertEqual((SHA,12),(frozen['sha'],frozen['run_id']))
            self.assertEqual(local_tests(('frontend',)), frozen['local_tests'])
            self.assertEqual(frontend_prepared(), frozen['frontend_prepare_run'])
            self.assertEqual('frontend-release.yml', dispatch.call_args.args[0])
            inputs = dispatch.call_args.args[1]
            self.assertEqual(('prepare', '12', SHA), (inputs['phase'], inputs['check_run'], inputs['commit']))
            self.assertEqual('deploy frontend/v1.2.3@' + SHA, inputs['confirmation'])

    def test_prepare_runs_local_checks_and_both_actions_concurrently_and_rejects_failures(self):
        for failure in ('local', 'check', 'frontend', 'head', 'dirty', None):
            with self.subTest(failure=failure):
                dispatched = threading.Event()
                watched = set()
                saved = []
                def local(state):
                    self.assertTrue(dispatched.wait(5), 'frontend dispatch waited for local tests')
                    result = local_tests(('frontend',))
                    if failure == 'local':
                        result['success'] = False
                        result['commands'][0]['returncode'] = 1
                    return result
                def dispatch(workflow, inputs, title):
                    if workflow == 'release-check.yml':
                        return 12
                    dispatched.set()
                    return 13
                def wait(run_id):
                    self.assertTrue(dispatched.wait(5), 'release-check completion blocked frontend dispatch')
                    watched.add(run_id)
                    result = dict(frontend_prepared(), run_id=run_id)
                    if (run_id, failure) in ((12, 'check'), (13, 'frontend')):
                        result['conclusion'] = 'failure'
                    return result
                args = argparse.Namespace(frontend='1.2.3', backend=None, dry_run=False, stress=False)
                with patch.object(release, 'require_main', return_value=SHA), \
                        patch.object(release, 'variables', return_value={}), \
                        patch.object(release, 'deployed', return_value=dict(version='1.2.2', commit='b'*40)), \
                        patch.object(release, 'changed', return_value=['frontend/main.js']), \
                        patch.object(release, 'ensure_tag'), patch.object(release, 'candidate_evidence'), \
                        patch.object(release, 'run_local_tests', side_effect=local), \
                        patch.object(release, 'dispatch', side_effect=dispatch), \
                        patch.object(release, 'wait_run', side_effect=wait), \
                        patch.object(release, 'write_state', side_effect=lambda s: saved.append(json.loads(json.dumps(s)))), \
                        patch.object(release, 'command', side_effect=['b'*40 if failure == 'head' else SHA,
                                                                    ' M file' if failure == 'dirty' else '']):
                    if failure:
                        with self.assertRaisesRegex(ValueError, 'Prepare failed'):
                            release.prepare(args)
                        self.assertFalse(saved[-1]['local_tests']['success'])
                    else:
                        release.prepare(args)
                        self.assertTrue(saved[-1]['local_tests']['success'])
                self.assertEqual({12, 13}, watched)

    def test_local_commands_are_scoped_logged_and_time_bound(self):
        with tempfile.TemporaryDirectory(dir=release.ROOT/'.test-artifacts') as folder:
            root = Path(folder)
            for components, stress in [(('frontend',), False), (('backend',), False), (('backend',), True)]:
                state = dict(sha=SHA, rows=[dict(component=c) for c in components], stress=stress)
                with patch.object(release, 'ROOT', root), \
                        patch.object(release.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
                    result = release.run_local_tests(state)
                self.assertEqual(SHA, result['sha'])
                self.assertTrue(result['success'])
                self.assertEqual(list(components), result['components'])
                self.assertLessEqual(result['started_at'], result['finished_at'])
                commands = [c.args[0] for c in run.call_args_list]
                if components == ('frontend',):
                    self.assertEqual([['npm', 'run', 'test:' + s] for s in ('static', 'repo', 'behavior', 'contract')], commands)
                else:
                    self.assertEqual(['./gradlew', 'ktlintCheck', 'test', 'integrationTest', 'apiSchemaTest',
                                      'architectureTest', 'realisticTest', '--console=plain', '-PintegrationForks=4'] +
                                     (['stressTest'] if stress else []), commands[0])
                    self.assertEqual(['node', '--test', 'scripts/migrations/20260907-level-catalog.test.js',
                                      'scripts/migrations/20261015-recruitment-duplicate-pools.test.js'], commands[1])
                    self.assertEqual([['npm', 'ci'], ['npm', 'test']], commands[2:])
                    self.assertIn('127.0.0.1', run.call_args.kwargs['env']['BETA_TEST_MONGO_URI'])
                for row in result['commands']:
                    self.assertTrue(Path(row['log']).is_file())
                    self.assertLessEqual(row['started_at'], row['finished_at'])
            (root/'backend/scripts/beta/node_modules').mkdir(parents=True)
            with patch.object(release, 'ROOT', root), \
                    patch.object(release.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)) as run:
                result = release.run_local_tests(state)
            self.assertFalse(result['success'])
            self.assertNotIn(['npm', 'ci'], [c.args[0] for c in run.call_args_list])

    def test_publish_rejects_missing_failed_or_mismatched_local_evidence_before_existing_checks(self):
        args = argparse.Namespace(dry_run=False, yes=True)
        valid = local_tests(('frontend',))
        variants = [None, dict(valid, sha='b'*40), dict(valid, components=[]), dict(valid, success=False),
                    dict(valid, stress=True), dict(valid, commands=valid['commands'][:-1]),
                    dict(valid, commands=[dict(r, returncode=1) for r in valid['commands']])]
        for evidence in variants:
            state = dict(sha=SHA, rows=release.plan('1.2.3', None, SHA), stress=False, local_tests=evidence)
            with self.subTest(evidence=evidence), patch.object(release, 'require_main') as check, \
                    patch.object(release, 'command') as command:
                with self.assertRaisesRegex(ValueError, 'rerun ./release.sh --prepare'):
                    release.publish(args, state)
            check.assert_not_called()
            command.assert_not_called()

    def test_publish_rejects_missing_failed_or_mismatched_frontend_prebuild(self):
        for prebuild in (None, dict(frontend_prepared(), conclusion='failure'),
                         dict(frontend_prepared(), headSha='b'*40), dict(frontend_prepared(), status='in_progress')):
            state = dict(sha=SHA, rows=release.plan('1.2.3', None, SHA), stress=False,
                         local_tests=local_tests(('frontend',)), frontend_prepare_run=prebuild)
            with patch.object(release, 'require_main') as check:
                with self.assertRaisesRegex(ValueError, 'prebuild.*--prepare'):
                    release.publish(argparse.Namespace(dry_run=False, yes=True), state)
            check.assert_not_called()

    def test_git_tag_is_immutable_and_idempotent(self):
        root = release.ROOT/'.test-artifacts'
        root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as folder:
            repo, remote = Path(folder)/'repo', Path(folder)/'remote.git'
            subprocess.run(['git','init','--bare',str(remote)],check=True,capture_output=True)
            subprocess.run(['git','init',str(repo)],check=True,capture_output=True)
            def git(*args):
                return subprocess.check_output(args,cwd=repo,text=True,stderr=subprocess.DEVNULL).strip()
            git('git','config','user.name','Fixture')
            git('git','config','user.email','fixture@example.invalid')
            git('git','commit','--allow-empty','-m','fixture')
            git('git','remote','add','origin',str(remote))
            sha = git('git','rev-parse','HEAD')
            row = release.plan('1.2.3',None,sha)[0]
            with patch.object(release,'command',side_effect=git):
                release.ensure_tag(row,create=True)
                release.ensure_tag(row,create=True)
                with self.assertRaisesRegex(ValueError,'immutable'):
                    release.ensure_tag(dict(row,commit='b'*40),create=True)
                self.assertEqual(sha,git('git','rev-parse',row['tag']+'^{commit}'))

    def test_publish_blocks_failed_check_disabled_channel_and_changed_production(self):
        args = argparse.Namespace(dry_run=False,yes=True)
        state = dict(sha=SHA,run_id=12,rows=release.plan('1.2.3',None,SHA),baselines=dict(frontend=dict(version='1.2.2',commit='b'*40)),
                     stress=False,local_tests=local_tests(('frontend',)),frontend_prepare_run=frontend_prepared())
        for failure in ('ci','disabled','drift'):
            config = dict(YUANHUB_MONOREPO_DEPLOY_ENABLED='false' if failure=='disabled' else 'true')
            with self.subTest(failure=failure), patch.object(release,'require_main'), \
                    patch.object(release,'run_status',return_value=frontend_prepared()), \
                    patch.object(release,'variables',return_value=config), \
                    patch.object(release,'candidate_evidence',side_effect=ValueError('failed check') if failure=='ci' else None), \
                    patch.object(release,'command') as command, patch.object(release,'ensure_tag') as tag, \
                    patch.object(release,'deployed',return_value=dict(version='8.8.8',commit='c'*40)), \
                    patch.object(release,'dispatch') as dispatch:
                with self.assertRaises(ValueError):
                    release.publish(args,state)
                self.assertFalse(any(c.kwargs.get('create') for c in tag.call_args_list))
                dispatch.assert_not_called()

    def test_backend_failure_prevents_frontend_and_success_is_ordered(self):
        args = argparse.Namespace(dry_run=False,yes=True)
        for fail in (True,False):
            state = dict(sha=SHA,run_id=12,rows=release.plan('1.2.3','4.5.6',SHA),
                         stress=False,local_tests=local_tests(),frontend_prepare_run=frontend_prepared(),
                         baselines={c:dict(version='0.0.1',commit='b'*40) for c in ('backend','frontend')})
            calls = []
            def cmd(*args):
                if 'watch' in args and fail:
                    raise subprocess.CalledProcessError(1,args)
                return ''
            def deployed(config,c):
                calls.append(c)
                return dict(version='4.5.6' if c=='backend' else '1.2.3',commit=SHA) if calls.count(c)%2==0 else state['baselines'][c]
            with patch.object(release,'require_main'), patch.object(release,'variables',return_value=dict(YUANHUB_MONOREPO_DEPLOY_ENABLED='true')), \
                    patch.object(release,'run_status',return_value=frontend_prepared()), \
                    patch.object(release,'candidate_evidence'),patch.object(release,'command',side_effect=cmd), \
                    patch.object(release,'ensure_tag'),patch.object(release,'write_state'), \
                    patch.object(release,'deployed',side_effect=deployed),patch.object(release,'dispatch',return_value=55) as dispatch:
                if fail:
                    with self.assertRaisesRegex(ValueError,'Deploy failed'):
                        release.publish(args,state)
                    self.assertEqual(1,dispatch.call_count)
                else:
                    release.publish(args,state)
                    self.assertEqual(['backend','backend','frontend','frontend'],calls)


if __name__ == '__main__':
    unittest.main()
