"""Validate one immutable release-check run. No tags or deployment writes."""
import argparse
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
REPO = 'MrSnake0208/YuanHub'
VERSION = r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?'


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def version(value):
    value = value.removeprefix('v')
    if not re.fullmatch(VERSION, value):
        raise ValueError('invalid version: ' + value)
    return value


def deployed(config, component):
    key = f'YUANHUB_{component.upper()}_URL'
    base = config.get(key, '').rstrip('/')
    if not base.startswith('https://'):
        raise ValueError(f'{key} must be configured with HTTPS')
    endpoint = '/deploy-meta.json' if component == 'frontend' else '/version'
    with urlopen(base + endpoint + '?release-check=' + uuid.uuid4().hex, timeout=15) as response:
        data = json.load(response)
    if component == 'backend':
        data = data['data']
        result = dict(version=version(data['backend_version']), commit=data['git']['commit_id'])
    else:
        result = dict(version=version(data['version']), commit=data['commit'])
    if not re.fullmatch('[0-9a-f]{40}', result['commit']):
        raise ValueError('deployed metadata requires a full commit SHA')
    return result


def validate_run(run, sha, now=None):
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('candidate requires full SHA')
    expected = dict(head_sha=sha, head_branch='main', event='workflow_dispatch',
                    path='.github/workflows/release-check.yml', status='completed', conclusion='success')
    for key, value in expected.items():
        if run.get(key) != value:
            raise ValueError(f'release check {key}: expected {value}, got {run.get(key)}')
    if run.get('repository', {}).get('full_name') != REPO:
        raise ValueError('release check belongs to another repository')
    completed = datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))
    age = (now or datetime.now(timezone.utc)) - completed
    if age < timedelta(0) or age > timedelta(days=7):
        raise ValueError('release check is expired; prepare a new candidate')


def validate_manifest(manifest, run, sha, component=None, release_version=None, api_base=None):
    if (manifest.get('sha') != sha or manifest.get('run_id') != run['id'] or
            manifest.get('attempt') != run['run_attempt']):
        raise ValueError('candidate SHA/run/attempt mismatch')
    if manifest.get('checks') != 'complete':
        raise ValueError('candidate checks are incomplete')
    versions = manifest.get('versions', {})
    if not any(versions.values()):
        raise ValueError('candidate has no selected components')
    for name in ('frontend', 'backend'):
        if versions.get(name):
            version(versions[name])
    if component and (not release_version or versions.get(component) != release_version):
        raise ValueError('candidate component/version mismatch')
    if api_base is not None and manifest.get('frontend_api_base') != api_base:
        raise ValueError('frontend API configuration changed; prepare again')


def verify(run_id, sha, component=None, release_version=None, api_base=None):
    if not str(run_id).isdigit():
        raise ValueError('invalid run id')
    run = json.loads(command('gh', 'api', f'repos/{REPO}/actions/runs/{run_id}'))
    validate_run(run, sha)
    name = f'release-candidate-{run_id}-{run["run_attempt"]}'
    # Artifacts are immutable and attempt-specific; a rerun cannot inherit old evidence.
    artifacts = json.loads(command('gh', 'api', '--paginate', '--slurp',
                                   f'repos/{REPO}/actions/runs/{run_id}/artifacts?per_page=100'))
    matches = [a for page in artifacts for a in page['artifacts'] if a['name'] == name]
    if len(matches) != 1 or matches[0]['expired']:
        raise ValueError('candidate evidence is missing or expired')
    temp_root = ROOT / '.test-artifacts/release'
    temp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=temp_root) as folder:
        command('gh', 'run', 'download', str(run_id), '--repo', REPO, '--name', name, '--dir', folder)
        manifest = json.loads((Path(folder) / 'candidate.json').read_text())
    validate_manifest(manifest, run, sha, component, release_version, api_base)
    if manifest['versions'].get('backend'):
        jar_name = f'yuanhub-backend-jar-{sha}-{run["run_attempt"]}'
        jars = [a for page in artifacts for a in page['artifacts'] if a['name'] == jar_name and not a['expired']]
        if len(jars) != 1:
            raise ValueError('verified backend artifact missing or expired; prepare again')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--component', choices=['frontend', 'backend'])
    parser.add_argument('--version')
    parser.add_argument('--api-base')
    parser.add_argument('--deployment-url')
    parser.add_argument('--backend-url')
    parser.add_argument('--phase', choices=['prepare', 'release'], default='release')
    args = parser.parse_args()
    manifest = verify(args.run, args.commit, args.component, args.version, args.api_base)
    if args.deployment_url:
        if not args.component:
            raise ValueError('deployment requires a component')
        current = deployed({f'YUANHUB_{args.component.upper()}_URL': args.deployment_url}, args.component)
        target = dict(version=args.version, commit=args.commit)
        if current not in (manifest['baselines'][args.component], target):
            raise ValueError('production changed since this candidate; prepare again or use explicit rollback')
    if args.component == 'frontend' and args.phase == 'release' and manifest['versions'].get('backend'):
        backend = deployed({'YUANHUB_BACKEND_URL': args.backend_url or ''}, 'backend')
        if backend != dict(version=manifest['versions']['backend'], commit=args.commit):
            raise ValueError('candidate backend is not ready; frontend activation blocked')
    if 'GITHUB_ENV' in os.environ:
        with open(os.environ['GITHUB_ENV'], 'a') as output:
            output.write(f'CI_ARTIFACT_SUFFIX={args.commit}-{manifest["attempt"]}\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
