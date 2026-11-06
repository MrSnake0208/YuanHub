"""Conservative monorepo impact selection. Evidence of relevance is not proof of test quality."""
from __future__ import annotations
import hashlib
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


def fingerprint(root, changes):
    digest = hashlib.sha256()
    for name in sorted(changes):
        if name.startswith('.trellis/'):
            continue
        path = root / name
        digest.update(name.encode('utf-8', errors='surrogateescape')); digest.update(b'\0')
        digest.update(path.read_bytes() if path.is_file() else b'<deleted>')
    return digest.hexdigest()


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


def component_scope(changes):
    """Unknown code expands its own component; shared tooling expands both."""
    active = [p for p in changes if not (
        p.endswith(('.md', '.css')) and p != 'docs/development/testing.md' and Path(p).name != 'AGENTS.md'
    )]
    shared = any(not p.startswith(('frontend/', 'backend/', 'docs/', '.trellis/')) or
                 p == 'docs/development/testing.md' for p in active)
    front = shared or any(p.startswith('frontend/') for p in active)
    back = shared or any(p.startswith('backend/') for p in active)
    full = {}
    for name, enabled in [('frontend', front), ('backend', back)]:
        paths = [p for p in active if p.startswith(name + '/')]
        full[name] = enabled and (shared or any(
            not p.startswith((name + '/src/', name + '/test/', name + '/behavior/')) or
            not any(w in p.lower() for words in WORDS.values() for w in words)
            for p in paths))
    # Protocol/config changes must still check both sides; service-only edits do not.
    contract = shared or any(
        p.startswith(('frontend/src/api/', 'backend/src/main/resources/')) or
        p == 'frontend/test/contract.test.js' or
        (p.startswith('backend/src/main/') and any(part in p.split('/') for part in
         ('controller', 'request', 'response', 'dto', 'openapi', 'security')))
        for p in active)
    runner = any(p == 'scripts/test.sh' or p.startswith('scripts/testing/') for p in active)
    return {'frontend': front, 'backend': back, 'full_frontend': full['frontend'],
            'full_backend': full['backend'], 'contract': contract, 'runner': runner}


def infer(root, changes):
    scope = component_scope(changes)
    contract_file = root / 'frontend/test/contract.test.js'
    if contract_file.is_file():
        dependencies = {component.lower() + '/' + path for component, path in re.findall(
            r"read(Frontend|Backend)\(['\"]([^'\"]+)['\"]\)", contract_file.read_text())}
        scope['contract'] |= bool(dependencies.intersection(changes))
    domains = {domain for path in changes for domain, words in WORDS.items() if any(w in path.lower() for w in words)}
    # Cascade once from directly changed domains; recursively closing account
    # edges would turn every small star edit into an unnecessary whole-app run.
    domains |= set().union(*(CASCADES.get(d, {d}) for d in list(domains))) if domains else set()
    front = root / 'frontend'
    nodes = sorted(p.relative_to(front).as_posix() for folder in ('test', 'promo-site/test') for p in (front / folder).rglob('*.test.js'))
    components = sorted(p.relative_to(front).as_posix() for p in (front / 'behavior').rglob('*.spec.js'))
    seeds = {p.removeprefix('frontend/') for p in changes if p.startswith('frontend/')}
    dependent = reverse_dependents(import_graph(front), seeds)
    keywords = {w for domain in domains for w in WORDS[domain]}
    selected_node = nodes if scope['full_frontend'] else [p for p in nodes if p in dependent or any(w in p.lower() for w in keywords)]
    selected_behavior = components if scope['full_frontend'] else [p for p in components if p in dependent or any(w in p.lower() for w in keywords)]
    if scope['frontend'] and any(p.startswith('src/') for p in seeds):
        selected_node = selected_node or nodes
        selected_behavior = selected_behavior or components
    if not scope['frontend']:
        selected_node, selected_behavior = [], []
    selected_node = [p for p in selected_node if p != 'test/contract.test.js']
    if scope['contract']:
        selected_node.append('test/contract.test.js')
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
            if scope['backend'] and (scope['full_backend'] or file.relative_to(root).as_posix() in changes or not domains or any(w in fqcn.lower() for w in keywords) or any(re.search(r'\b' + re.escape(s) + r'\b', text) for s in symbols)):
                selections[kind].append(fqcn)
    return {'domains': sorted(domains), 'node': sorted(set(selected_node)), 'behavior': sorted(set(selected_behavior)),
            **{kind: sorted(set(names)) for kind, names in selections.items()},
            'scope': scope, 'conservative_full': scope['full_frontend'] or scope['full_backend'],
            'evidence': ['Monorepo diff including deletions/renames; component scope; domain cascades; JS reverse imports; Kotlin references',
                         'Unknown paths expand only their component; shared tooling expands both; CSS/docs require diff review']}
