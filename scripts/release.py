"""Independent component tags in one repository. Dry-run has no network writes."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def plan(frontend, backend, sha):
    rows = []
    for component, version in [('backend',backend), ('frontend',frontend)]:
        if not version:
            continue
        recorded = (ROOT/'frontend/VERSION').read_text().strip() if component=='frontend' else None
        if version == 'auto':
            if component != 'frontend':
                raise ValueError('backend requires an explicit version')
            version = recorded
        version = version.removeprefix('v')
        if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?',version):
            raise ValueError('invalid version: '+version)
        if recorded and recorded != version:
            raise ValueError('update frontend/VERSION on a candidate branch before release')
        rows.append(dict(component=component,version=version,tag=f'{component}/v{version}',commit=sha,
                         workflow=f'{component}-release.yml',ci=f'{component}-ci.yml',
                         artifact='frontend/dist' if component=='frontend' else 'backend/build/libs/*.jar'))
    if not rows:
        raise ValueError('select --frontend auto|VERSION and/or --backend VERSION')
    return rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend')
    parser.add_argument('--backend')
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--yes',action='store_true',help='Explicitly approve publishing the printed tags')
    args=parser.parse_args()
    sha=command('git','rev-parse','HEAD')
    rows=plan(args.frontend,args.backend,sha)
    print(json.dumps(rows,indent=2,ensure_ascii=False),flush=True)
    if args.dry_run:
        return
    if command('git','branch','--show-current') != 'main':
        raise ValueError('publish only from the approved clean main branch')
    if command('git','status','--porcelain'):
        raise ValueError('worktree is dirty')
    origin=command('git','remote','get-url','origin')
    match=re.fullmatch(r'(?:https://github\.com/|git@github\.com:)([^/]+/[^/]+?)(?:\.git)?',origin)
    if not match:
        raise ValueError('origin must identify an explicit GitHub repository')
    repo=match.group(1)
    remote=command('git','ls-remote','origin','refs/heads/main').split()
    if not remote or remote[0] != sha:
        raise ValueError('local HEAD differs from remote main')
    for row in rows:
        if command('git','tag','--list',row['tag']) or command('git','ls-remote','--tags','origin','refs/tags/'+row['tag']):
            raise ValueError(row['tag']+' exists; rerun its existing workflow instead of moving tags')
        runs=json.loads(command('gh','run','list','--repo',repo,'--workflow',row['ci'],'--branch','main','--commit',sha,'--status','success','--limit','1','--json','databaseId'))
        if not runs:
            raise ValueError('run '+row['ci']+' successfully for this exact main SHA first')
    if not args.yes and input('Publish these component tags to '+repo+'? [yes/no] ') != 'yes':
        raise ValueError('publication cancelled')
    for row in rows:
        subprocess.run(['git','tag','-a',row['tag'],sha,'-m',row['component']+' v'+row['version']],cwd=ROOT,check=True)
        subprocess.run(['git','push','origin','refs/tags/'+row['tag']],cwd=ROOT,check=True)
        print('Tag published. Verify '+row['workflow']+' completed before publishing a dependent component.',flush=True)
        # Keep API-dependent frontend activation an explicit decision after backend readiness.
        if row['component']=='backend' and len(rows)>1:
            print('Backend tag published; frontend remains unpublished. After backend readiness, run --frontend separately.')
            break


if __name__=='__main__':
    try:
        main()
    except (ValueError,subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
