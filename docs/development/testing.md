# Monorepo verification entrypoints

Run frontend commands from frontend/ and Gradle from backend/. The scripts/test.sh entry reads one Git root and maps changes to both components. --base names one monorepo ref; no second checkout or environment path is required for test:contract. The independent scripts under scripts/legacy-release and their fixtures remain historical release coverage; active deployment coverage uses the root workflows and backend deploy script.

# YuanHub local verification

The `./scripts/test.sh` command is the supported **optional** local test entrypoint. It is not a mandatory pre-completion pipeline for every change.

## Choose checks by impact

The [root AGENTS.md](../../AGENTS.md#最小充分验证) owns verification policy. Start with relevant source and diff review; choose focused checks for concrete failure risks and retain evidence for affected critical invariants. Build, CI and deployment changes need their corresponding infrastructure checks. Full suites are not the default.

`./scripts/test.sh quick` selects affected component checks and excludes database/mutation suites. Do not run it automatically for copy, styling or local interaction changes. Rule files (`AGENTS.md`) and this testing policy remain configuration inputs. Copy-only edits inside JS/Vue cannot be inferred from the filename and still need a human judgment.

Available modes:

- `./scripts/test.sh quick --base <frozen-base-sha>` — affected component checks plus unit/component tests.
- `./scripts/test.sh smart` — diff-aware affected tests and required integration/API checks.
- `./scripts/test.sh all` — full frontend/backend, Mongo/Redis, architecture, OpenAPI, builds, mutation, plus the realistic fixture dataset.
- `./scripts/test.sh stress` — explicit large-data suite for scale-sensitive Mongo/index/query/import work.

For a committed PR, always supply its frozen base. A clean working tree without `--base` is an error for `quick/smart/plan`, not a request for a full suite. Local uncommitted work can omit it. Base refs are resolved to a commit at startup; deletion and both rename paths remain in the diff.

Unknown runtime paths expand only their own component; root/shared tooling expands both. Backend controller/request/response/DTO/OpenAPI/security/resource changes also select the frontend contract, while service-only changes do not automatically run frontend behavior tests. Literal `readFrontend/readBackend` inputs in `contract.test.js` also select that contract, including its page and route dependencies. The runner's own tests run only for `scripts/testing/**`, `scripts/test.sh`, or explicit `all/stress`. Gradle test tasks already compile their prerequisites, so targeted runs do not issue a separate `compileTestKotlin` first. Affected Kotlin lint still forces execution because the plugin does not fingerprint its file filter.

`--budget 900` is the default total command-execution budget, and `--timeout 900` is the per-command limit; each command receives the smaller remaining allowance. Explicit full suites can request a larger budget when justified. The first failure/timeout or invalid test discovery stops subsequent checks; reports retain `planned_checks`, `not_run`, exit codes, timings and source identity. Only the process group created for a timed-out command is terminated; detached/shared Gradle daemons or database services are never killed. If a daemon remains busy, inspect it rather than start a competing build.

JUnit suites use the Gradle task-specific `--rerun` option and discard that suite’s previous XML before execution, retaining compilation caches but requiring fresh test output. Reports bind HEAD/base, changed-file fingerprint, execution environment and per-command logs/timestamps. A changed tree during execution, zero discovered tests or skipped/failed tests cannot be reported as passing. Empty check selection means no automatic check was needed, not proof of runtime correctness. The runner uses the Git diff, component boundaries, import dependencies and domain cascades; it does not read task documents or require a coverage manifest. Reports describe checks that actually ran, not permission to finish or archive work. Existing component coverage/mutation tools are unchanged; selection is not proof that every business invariant is covered.

## Entry boundaries and prerequisites

| Working directory / entry | Selected checks and prerequisites | Evidence |
| --- | --- | --- |
| `frontend`: `npm test` / `npm run test:repo` | Repository Node tests, including recursive property and promo tests; no sibling backend. Existing Node/npm commands are retained pending the package-manager decision. | Node terminal output; collector `node scripts/run-node-tests.mjs --exclude test/contract.test.js --list` lists files without running them. |
| `frontend`: `npm run test:all` | Repository static + Node + Vitest/jsdom + build; installed frontend dependencies required; no cross-repository contract. | Individual stage output and `dist/`. |
| `frontend`: `npm run test:contract` | Node/Git and the `frontend/` and `backend/` directories in the current Monorepo worktree. No separate checkout is required. `YUANHUB_BACKEND_ROOT` remains an optional override for another backend source directory. Missing files fail. | Terminal logs the source revision and clean/dirty state for each directory (the same Git HEAD in the default Monorepo layout), plus operator v4/v5 versions. Dirty trees are not reproducible from HEAD alone. |
| `backend`: `./gradlew test --console=plain` | JDK 21/wrapper; ordinary unit/MockMvc/untagged contracts. Excludes integration, architecture, api-schema, realistic and stress tags. Explicit tasks and `check` dependencies are unchanged. | `build/test-results/test/` and `build/reports/tests/test/`. |
| Workspace: `./scripts/test.sh quick/smart/all/stress` | `all` runs repo + contract once; scoped fallback expands the affected component, with contracts selected separately. `stress` stays explicit; scale-only classes are not unit selections. Local MongoDB replica set and Redis are required by database suites; Docker is not required. | `.test-artifacts/runs/<stamp>-<mode>/`; separate `frontend-contract.log` records the pair when selected. |

Daily push/PR/merge/tag events do not run CI or deploy. Owners may develop and push main without a PR; contributors use owner-reviewed PRs without automatic required checks. Developer checks follow the root verification policy.

`./release.sh --prepare` freezes main and dispatches `.github/workflows/release-check.yml`. It reuses frontend static/repo/build/contracts and full Node/Vitest/jsdom regression, backend ktlint/test/assemble plus isolated integration, schema, architecture, representative realistic and migration/beta script checks. `--stress` opts into scale-sensitive tests. This is not browser E2E authorization. Diagnostic component and affected-diff workflows remain manually callable. See [release operations](../monorepo-operations.md).

Only the completed successful centralized run for the exact SHA, component versions and run attempt can admit deployment. Failure, cancellation, skipped required jobs, expired evidence/artifacts or mismatched versions block publication; repaired code requires a new candidate. Evidence and artifacts expire after seven days. The concentrated Runner provides disposable Mongo/Redis, while the test fixtures retain their owned database/key protections.

Release infrastructure regression: `python3 -m unittest scripts.testing.test_monorepo_ci scripts.testing.test_monorepo_release scripts.testing.test_artifact_deploy scripts.testing.test_server_prebuild`. These isolated fixtures do not prove production behavior or remote permissions. Existing local test and mutation entries remain available; they are not daily mandatory pipelines.

Scoped `smart` integration checks pass the selected class names to Gradle with `--tests`; `all` and unknown/full-backend scope retain the complete integration suite.

Regression/full execution remains user/CI-owned. Backend `architectureTest` and `apiSchemaTest` are separate entries; `all` also runs the existing representative dataset and mutation checks. Mongo script tests remain behind their owning JUnit isolated integration suites; no migration script is run against developer data by these changes. Existing standalone backend script-test commands are unchanged.

The backend script sources remain: `node --test scripts/migrations/20260907-level-catalog.test.js scripts/migrations/20261015-recruitment-duplicate-pools.test.js` from the backend root; `npm test` from `backend/scripts/beta`; and the two `.mongo-test.js` scripts bridged by `RecruitmentDuplicateRepairMongoTest` / `RecruitmentRemainderRepairMongoTest` under `integrationTest` (owned TestMongo plus `mongosh`). These are five source files, not five independent execution suites. The concentrated release workflow includes the standalone Node/beta commands; their Mongo variants remain inside isolated JUnit integration suites.

For the B01 tag change, the user/CI should compare discovery reports using:

```sh
# Working directory: backend. These discover tests; they do not execute test bodies.
./gradlew test --test-dry-run --console=plain
./gradlew realisticTest --test-dry-run --console=plain
./gradlew stressTest --test-dry-run --console=plain
```

Each command writes its own `build/test-results/<task>/` and `build/reports/tests/<task>/`. Default discovery must exclude both `RealisticFixtureScaleTest` methods; each explicit task must discover its corresponding method. Dry-run skipped entries are discovery evidence only, never business-test passes. The actual default `test` and final CI-equivalent checks remain pending until executed.

Monorepo delivery boundary: root `scripts/test.sh`, `docs/development/testing.md` and `scripts/` are tracked together with frontend/backend. The active frontend/backend CI pipelines are under the monorepo root `.github/workflows/`; subdirectory workflows are retained source assets, not active GitHub entrypoints.

## Verification ownership

Regression/full validation remains user/CI-owned. **Codex owns implementation and the smallest justified developer-side checks; the user independently invokes DSH for adversarial acceptance/testing** in a separate context. DSH starts from the original user requirement and final diff, looks for real-world counterexamples, and reports reproducible findings rather than trusting developer-authored tests. Neither agent should claim an unrun check passed.

DSH is not automatically dispatched by Codex, nor a completion gate for low-risk edits. Browser automation remains disabled unless explicitly authorized for the current task. Final developer reports should state the change scope, checks actually performed, and unknowns; include a short DSH handoff only when needed.

Real-browser, device, touch, screenshot and viewport acceptance is performed manually by the user. Browser checklists and commands in standards or historical plans are optional user references, not Agent delivery gates. Existing browser scripts remain available; their presence and prior task authorizations do not authorize Agent execution in a new task. Keep focused non-browser checks for security, account isolation, contracts and data correctness; reuse existing tests and add coverage only for a concrete gap. Historical blanket test/build requirements do not create a mandatory daily pipeline; explicit release checks remain unchanged.

## Safety for database suites

Local development and debugging may use the shared development data in MaaBackend/HubBackend and Redis DB 0. Writes must stay within the authorized task; destructive operations still require confirmation. This permission does not extend to automated tests, which must use the isolated fixtures below and must never treat development records as test fixtures or cleanup targets.

Test data is synthetic, deterministic and disposable. Database suites use the existing local MongoDB replica set (127.0.0.1:27017) and Redis (127.0.0.1:6379), without Docker or Testcontainers. TestMongo only permits databases randomly allocated and registered by this JVM. TestRedis uses DB 15 and a per-JVM key serializer that scopes keys, Lua KEYS, and wildcard cleanup; Spring test StringRedisTemplate beans receive the same serializer. Direct test templates must use TestRedis.template(factory). Never bypass these fixtures, flush Redis, or access MaaBackend/HubBackend or production data. Missing infrastructure is a failure, not a skip. JVM shutdown cleans only registered databases and namespaced keys; forced termination may leave disposable data. Run python3 scripts/check_local_services.py for read-only service checks.

`all` uses a representative 200-user × 2-account dataset. `stress` rebuilds about 706,000 logical business objects in a random disposable Mongo database and validates counts, account isolation, pagination, embedded operator/star data, and scoped inventory idempotency indexes.

## Codex Native and optional local memory

Ordinary development starts directly in Codex. No PRD, Design, Task, Research, Remember, sub-agent or finish/archive phase is required. Complex work may use a native Plan. The root verification policy and data safeguards above remain binding; DSH and release CI retain their independent verification roles.

`./scripts/test.sh` keeps quick/smart/all/stress/plan/doctor, --base, --timeout and --budget. The retired --task option and task-completion report fields are removed; callers should select checks by risk and pass a frozen base for committed changes. Reports retain HEAD/base, changed-file fingerprints, environment, discovery counts, command logs, budgets and failures. A clean clone or Worktree needs no personal workflow, Mini-Trellis CLI or memory directory to run component checks and the public runner.

Mini-Trellis 0.3.5 is an optional local memory layer. Initialize only once at the current Git root with `mini-trellis init --codex -y` (uses git config user.name). Existing checkouts do not need reinitialization for ordinary work. `.trellis/` stays ignored; this checkout's generated `.codex/` and `.agents/` are local exclusions in `.git/info/exclude`, so other contributors do not inherit personal Hooks or Skills. Existing specialized Skills remain available on demand. Do not reference or automatically import the old YuanHub-All workspace.

Run memory commands at the Git root: `mini-trellis doctor`, `mini-trellis mem recall "<topic>"`; from a component directory, recall can use `--cwd "$(git rev-parse --show-toplevel)"`. Search only when prior decisions matter, record only confirmed reusable knowledge, and update the existing topic first. New installations have `session_auto_commit: false`. No historical knowledge has been imported by this setup; no search matches is a valid result.

The Codex SessionStart command resolves the current Git root before loading the memory entry, including when Codex starts in frontend/ or backend/. The local Hook's optional recording reminder does not impose session-end or compact write-back. Project trust and Hook trust are separate: review the new SessionStart in CLI `/hooks` or desktop Settings > Hooks, approve it, then start a new session. `doctor` can check files before approval but cannot establish that the model received Hook context. Global configuration is not changed. Review `mini-trellis refresh --dry-run` before updates, preserving the local root-resolution and optional-recording adjustments.
