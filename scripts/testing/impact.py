"""Conservative monorepo impact selection. Evidence of relevance is not proof of test quality."""
from __future__ import annotations
import fnmatch
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

REPOSITORIES = ('',)
WORDS = {
    'star': ('star', 'yuanstar', 'loadout'),
    'account': ('account', 'authentication', 'auth', 'token'),
    'inventory': ('inventory', 'entitycatalog', 'exchange'),
    'operator': ('operator', 'cultivation', 'training'),
    'planner': ('planner', 'stamina', 'cultivation'),
    'beta': ('beta', 'quota', 'enrollment'),
    'admin': ('admin', 'permission', 'security'),
    'ledger': ('ledger', 'cart'),
    'pwa': ('pwa', 'install', 'viewport', 'responsive'),
    'works': ('work', 'copilot', 'protocol', 'level'),
}
CASCADES = {
    'star': {'star', 'account'},
    'account': {'account', 'star', 'inventory', 'operator', 'planner', 'beta', 'admin'},
    'inventory': {'inventory', 'operator', 'planner'},
    'operator': {'operator', 'planner', 'star'},
    'planner': {'planner', 'operator', 'inventory'},
    'beta': {'beta', 'account', 'admin'},
}
IGNORED = {'.git', 'node_modules', 'build', 'dist', '__pycache__', '.test-artifacts'}


def git(directory, *arguments):
    result = subprocess.run(['git', '-C', str(directory), *arguments], capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(f'Git failed in {directory.name}: {result.stderr.decode(errors="replace").strip()}')
    return result.stdout


def changed_files(root, base=None):
    found = set()
    for repository in REPOSITORIES:
        directory = root / repository
        if not (directory / '.git').exists():
            continue
        commands = [('diff', '--name-only', '--no-renames', '-z', base or 'HEAD', '--'),
                    ('diff', '--cached', '--name-only', '--no-renames', '-z', '--'),
                    ('ls-files', '--others', '--exclude-standard', '-z')]
        for command in commands:
            for raw in git(directory, *command).split(b'\0'):
                if raw:
                    name = (Path(repository) / raw.decode('utf-8', errors='surrogateescape')).as_posix()
                    if name not in REPOSITORIES[1:] and not any(p in IGNORED for p in Path(name).parts):
                        found.add(name)
    return sorted(found)


def runtime_file(path):
    if path.startswith(('frontend/src/', 'frontend/promo-site/src/', 'backend/src/main/')):
        return True
    if path.startswith(('scripts/testing/', '.trellis/scripts/', 'frontend/scripts/')):
        return path.endswith(('.py', '.sh', '.js', '.mjs')) and not Path(path).name.startswith('test_')
    return path in {'scripts/test.sh', 'dev.sh', 'frontend/package.json', 'frontend/vite.config.js',
                    'frontend/vitest.config.js', 'backend/build.gradle.kts'}


def is_test(path):
    return ('/test/' in path or '/behavior/' in path or '/test-support/' in path or
            path.startswith('scripts/testing/test_') or '/src/test/' in path)


def fingerprint(root, changes, task=None):
    digest = hashlib.sha256()
    for name in sorted(changes):
        if not (runtime_file(name) or is_test(name) or name.endswith(('lock.json', 'lock.yaml', 'baseline.xml'))):
            continue
        path = root / name
        digest.update(name.encode('utf-8', errors='surrogateescape')); digest.update(b'\0')
        digest.update(path.read_bytes() if path.is_file() else b'<deleted>')
    if task:
        for name in ('prd.md', 'design.md', 'test-plan.json'):
            path = task / name
            if path.is_file():
                digest.update(name.encode()); digest.update(path.read_bytes())
    return digest.hexdigest()


def current_task(root, explicit=None):
    if explicit:
        task = (root / explicit).resolve()
        if not task.is_relative_to(root / '.trellis/tasks') or not (task / 'task.json').is_file():
            raise ValueError('--task must name an existing .trellis/tasks task')
        return task
    cli = root / '.trellis/scripts/task.py'
    if cli.is_file():
        result = subprocess.run([os.environ.get('PYTHON', 'python3'), str(cli), 'current', '--json'],
                                cwd=root, capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            try:
                name = (json.loads(result.stdout).get('current_task') or {}).get('dir')
                if name:
                    task = (root / name).resolve()
                    if task.is_relative_to(root / '.trellis/tasks') and (task / 'test-plan.json').is_file():
                        return task
            except (ValueError, TypeError):
                pass
    # A terminal may lack the AI session id. An unambiguous planned task can be
    # resolved without changing the user's default active-task pointer.
    candidates = []
    for plan in (root / '.trellis/tasks').glob('*/test-plan.json'):
        try:
            if json.loads((plan.parent / 'task.json').read_text()).get('status') == 'in_progress':
                candidates.append(plan.parent)
        except (OSError, ValueError):
            pass
    return candidates[0] if len(candidates) == 1 else None


def import_graph(front):
    graph = {}
    pattern = re.compile(r'(?:from\s*|import\s*\(|import\s*)[\"\']([^\"\']+)[\"\']')
    for folder in ('src', 'test', 'behavior', 'test-support', 'promo-site/src', 'promo-site/test'):
        for path in (front / folder).rglob('*'):
            if not path.is_file() or path.suffix not in {'.js', '.mjs', '.vue', '.ts'}:
                continue
            edges = set()
            for spec in pattern.findall(path.read_text(errors='replace')):
                if not spec.startswith(('.', '@/')):
                    continue
                candidate = front / 'src' / spec[2:] if spec.startswith('@/') else path.parent / spec
                for target in (candidate, candidate.with_suffix('.js'), candidate / 'index.js', candidate.with_suffix('.vue')):
                    target = target.resolve()
                    if target.is_relative_to(front.resolve()) and target.is_file():
                        edges.add(target.relative_to(front.resolve()).as_posix()); break
            graph[path.relative_to(front).as_posix()] = edges
    return graph


def reverse_dependents(graph, seeds):
    affected = set(seeds)
    while True:
        extra = {name for name, dependencies in graph.items() if dependencies & affected}
        if extra <= affected:
            return affected
        affected |= extra


def infer(root, changes, task=None):
    domains = {domain for path in changes for domain, words in WORDS.items() if any(w in path.lower() for w in words)}
    # Cascade once from directly changed domains; recursively closing account
    # edges would turn every small star edit into an unnecessary whole-app run.
    domains |= set().union(*(CASCADES.get(d, {d}) for d in list(domains))) if domains else set()
    task_documents = []
    if task:
        for name in ('prd.md', 'design.md', 'implement.md'):
            file = task / name
            if file.is_file():
                text = file.read_text(errors='replace')
                task_documents.append(file.relative_to(root).as_posix())
                domains.update(d for d, words in WORDS.items() if any(re.search(r'(?<![A-Za-z])' + re.escape(w) + r'(?![A-Za-z])', text, re.I) for w in words))
    front = root / 'frontend'
    nodes = sorted(p.relative_to(front).as_posix() for folder in ('test', 'promo-site/test') for p in (front / folder).rglob('*.test.js'))
    components = sorted(p.relative_to(front).as_posix() for p in (front / 'behavior').rglob('*.spec.js'))
    seeds = {p.removeprefix('frontend/') for p in changes if p.startswith('frontend/')}
    dependent = reverse_dependents(import_graph(front), seeds)
    source_paths = [p for p in changes if runtime_file(p)]
    unknown = any(p.startswith(('frontend/src/', 'backend/src/main/')) and not any(w in p.lower() for words in WORDS.values() for w in words) for p in source_paths)
    infrastructure = any(p in {'scripts/test.sh', 'frontend/package.json', 'frontend/vite.config.js', 'frontend/vitest.config.js', 'backend/build.gradle.kts'} or
                         p.startswith(('scripts/testing/', 'backend/src/test/kotlin/com/lhs/share/testinfra/')) for p in changes)
    whole = infrastructure or unknown or not changes
    keywords = {w for domain in domains for w in WORDS[domain]}
    selected_node = nodes if whole else [p for p in nodes if p in dependent or any(w in p.lower() for w in keywords)]
    selected_behavior = components if whole else [p for p in components if p in dependent or any(w in p.lower() for w in keywords)]
    if any(p.startswith('src/') for p in seeds):
        selected_node = selected_node or nodes
        selected_behavior = selected_behavior or components
    selections = {'unit': [], 'integration': [], 'architecture': [], 'api': []}
    symbols = {Path(p).stem for p in changes if p.startswith('backend/src/main/') and p.endswith('.kt')}
    for file in (root / 'backend/src/test/kotlin').rglob('*.kt'):
        text = file.read_text(errors='replace')
        # shortcut: scale-tagged files are scale-only; split mixed files before adding ordinary tests.
        if '@Tag("realistic")' in text or '@Tag("stress")' in text:
            continue
        package = re.search(r'^package\s+([\w.]+)', text, re.M)
        for name in re.findall(r'^(?:open\s+)?class\s+(\w*Test)\b', text, re.M):
            fqcn = f'{package[1]}.{name}' if package else name
            kind = 'integration' if '@Tag("integration")' in text else 'architecture' if '@Tag("architecture")' in text else 'api' if '@Tag("api-schema")' in text else 'unit'
            if whole or file.relative_to(root).as_posix() in changes or not domains or any(w in fqcn.lower() for w in keywords) or any(re.search(r'\b' + re.escape(s) + r'\b', text) for s in symbols):
                selections[kind].append(fqcn)
    return {'domains': sorted(domains), 'node': sorted(set(selected_node)), 'behavior': sorted(set(selected_behavior)),
            **{kind: sorted(set(names)) for kind, names in selections.items()}, 'conservative_full': whole,
            'task_documents': task_documents,
            'evidence': ['Nested Git staged/unstaged/untracked files; module cascades; JS reverse imports; Kotlin package/import references',
                         'Conservative full fast suite for unknown/shared changes' if whole else 'Selected affected modules']}


def coverage_gaps(root, changes, task=None):
    manifest = json.loads((task / 'test-plan.json').read_text()) if task and (task / 'test-plan.json').is_file() else {}
    gaps, reviewed = [], []
    for source in (p for p in changes if runtime_file(p)):
        matching = [e for e in manifest.get('coverage', []) if any(fnmatch.fnmatchcase(source, pattern) for pattern in e.get('sources', []))]
        valid = [e for e in matching if e.get('invariants') and e.get('tests') and
                 all((root / name).is_file() and is_test(name) for name in e['tests']) and any(name in changes for name in e['tests'])]
        if valid:
            reviewed.append({'source': source, 'tests': sorted({n for e in valid for n in e['tests']}), 'basis': 'reviewed invariants + changed tests'})
            continue
        exemptions = [e for e in manifest.get('exceptions', []) if source in e.get('sources', []) and len(e.get('reason', '').strip()) >= 30
                      and (not e.get('baseline_sha256') or ((root / source).is_file() and hashlib.sha256((root / source).read_bytes()).hexdigest() == e['baseline_sha256']))]
        if exemptions:
            reviewed.append({'source': source, 'exception': exemptions[0]['reason']})
        else:
            gaps.append(source)
    return gaps, reviewed
