# Monorepo verification entrypoints

Run frontend commands from frontend/ and Gradle from backend/. The scripts/test.sh entry reads one Git root and maps changes to both components. --base names one monorepo ref; no second checkout or environment path is required for test:contract. The independent scripts under scripts/legacy-release and their fixtures remain historical release coverage; active deployment coverage uses the root workflows and backend deploy script.

# YuanHub local verification

The `./scripts/test.sh` command is the supported **optional** local test entrypoint. It is not a mandatory pre-completion pipeline for every change.

## Choose checks by risk

| Risk | Typical change | Suggested verification |
| --- | --- | --- |
| **L0** | copy, comments, static assets, pure visual/CSS changes with no behavior change | diff/relevant-file review only; no `./scripts/test.sh` command required |
| **L1** | local component/display behavior with no shared state | diff/relevant-file self-review; no new tests, test run or build required by default |
| **L2** | store/composable/API/data conversion/cache/polling/business branch | minimal risk-specific review/check; add or run targeted tests only for a concrete regression risk; elevate permissions/account isolation/data-loss risks to L3 |
| **L3** | auth/authorization, account isolation, API contract, router/global state, persistence/migration, transaction/concurrency, shared core | evidence for affected critical invariants via focused tests/contract checks or equivalent module-level verification; full suite is not the default |
| **L4** | build tooling, CI, test infrastructure, dependency/release/deploy, cross-repo shared infrastructure | risk-specific infrastructure checks; consider `./scripts/test.sh all` only when the affected scope warrants it |

`./scripts/test.sh quick` selects affected component checks and excludes database/mutation suites. **Do not use it by default for L0/L1 work.** Pure `.css`/Markdown edits need diff review, not automatic business tests; rule files (`AGENTS.md`) and this testing policy remain configuration inputs. Copy-only edits inside JS/Vue cannot be inferred from the filename and still need a human risk decision.

Available modes:

- `./scripts/test.sh quick --base <frozen-base-sha>` — affected component checks plus unit/component tests.
- `./scripts/test.sh smart` — diff-aware affected tests and required integration/API checks.
- `./scripts/test.sh all` — full frontend/backend, Mongo/Redis, architecture, OpenAPI, builds, mutation, plus the realistic fixture dataset.
- `./scripts/test.sh stress` — explicit large-data suite for scale-sensitive Mongo/index/query/import work.

For a committed PR, always supply its frozen base. A clean working tree without `--base` is an error for `quick/smart/plan`, not a request for a full suite. Local uncommitted work can omit it. Base refs are resolved to a commit at startup; deletion and both rename paths remain in the diff.

Unknown runtime paths expand only their own component; root/shared tooling expands both. Backend controller/request/response/DTO/OpenAPI/security/resource changes also select the frontend contract, while service-only changes do not automatically run frontend behavior tests. Literal `readFrontend/readBackend` inputs in `contract.test.js` also select that contract, including its page and route dependencies. The runner's own tests run only for `scripts/testing/**`, `scripts/test.sh`, or explicit `all/stress`. Gradle test tasks already compile their prerequisites, so targeted runs do not issue a separate `compileTestKotlin` first. Affected Kotlin lint still forces execution because the plugin does not fingerprint its file filter.

`--budget 900` is the default total command-execution budget, and `--timeout 900` is the per-command limit; each command receives the smaller remaining allowance. Explicit full suites can request a larger budget when justified. The first failure/timeout or invalid test discovery stops subsequent checks; reports retain `planned_checks`, `not_run`, exit codes, timings and source identity. Only the process group created for a timed-out command is terminated; detached/shared Gradle daemons or database services are never killed. If a daemon remains busy, inspect it rather than start a competing build.

JUnit suites use the Gradle task-specific `--rerun` option and discard that suite’s previous XML before execution, retaining compilation caches but requiring fresh test output. Reports bind HEAD/base, changed-file fingerprint, execution environment and per-command logs/timestamps. A changed tree during execution, zero discovered tests or skipped/failed tests cannot be reported as passing. Empty check selection means no automatic check was needed, not proof of runtime correctness. Without an optional task, missing Trellis coverage metadata does not fail `smart`. Optional Trellis coverage explanations remain required where that completion workflow is explicitly used; no task is created by these commands.

## Entry boundaries and prerequisites

| Working directory / entry | Selected checks and prerequisites | Evidence |
| --- | --- | --- |
| `frontend`: `npm test` / `npm run test:repo` | Repository Node tests, including recursive property and promo tests; no sibling backend. Existing Node/npm commands are retained pending the package-manager decision. | Node terminal output; collector `node scripts/run-node-tests.mjs --exclude test/contract.test.js --list` lists files without running them. |
| `frontend`: `npm run test:all` | Repository static + Node + Vitest/jsdom + build; installed frontend dependencies required; no cross-repository contract. | Individual stage output and `dist/`. |
| `frontend`: `npm run test:contract` | Node/Git and both complete source checkouts. Defaults to sibling `backend`; set `YUANHUB_BACKEND_ROOT` for another directory. Missing files fail. | Terminal logs both HEADs, clean/dirty state and operator v4/v5 versions. Dirty trees are not reproducible from HEAD alone. |
| `backend`: `./gradlew test --console=plain` | JDK 21/wrapper; ordinary unit/MockMvc/untagged contracts. Excludes integration, architecture, api-schema, realistic and stress tags. Explicit tasks and `check` dependencies are unchanged. | `build/test-results/test/` and `build/reports/tests/test/`. |
| Workspace: `./scripts/test.sh quick/smart/all/stress` | `all` runs repo + contract once; scoped fallback expands the affected component, with contracts selected separately. `stress` stays explicit; scale-only classes are not unit selections. Local MongoDB replica set and Redis are required by database suites; Docker is not required. | `.test-artifacts/runs/<stamp>-<mode>/`; separate `frontend-contract.log` records the pair when selected. |

PR CI uses root `.github/workflows/pr-ci.yml` to select affected components and aggregate their results into `PR merge gate`. Failed/cancelled selection or any required component that does not succeed blocks the gate; only explicitly unaffected components may be skipped. Run `python3 scripts/testing/test_monorepo_ci.py` for focused gate regressions. Branch protection rollout and selection rules are documented in [Monorepo operations](../monorepo-operations.md).

For backend-only PR source changes, the frontend reusable job uses `contract-only`: Node and the paired API contract, with no npm dependency install, repository tests or frontend build. Frontend/shared changes and push/manual runs retain the full frontend job. Backend CI executes the same `ktlintCheck test assemble` tasks in one Gradle invocation.

Full frontend CI runs static checks, repository Node tests, paired API contracts and build; full behavior tests run in the independent daily/manual `.github/workflows/frontend-regression.yml` via `npm run test:all`. Local full regression uses that same existing command. Regression failures may arrive after deployment; risk-specific developer checks still apply. Backend CI runs from the root `.github/workflows/backend-ci.yml`.

Scoped `smart` integration checks pass the selected class names to Gradle with `--tests`; `all` and unknown/full-backend scope retain the complete integration suite.

Regression/full execution remains user/CI-owned. Backend `architectureTest` and `apiSchemaTest` are separate entries; `all` also runs the existing representative dataset and mutation checks. Mongo script tests remain behind their owning JUnit isolated integration suites; no migration script is run against developer data by these changes. Existing standalone backend script-test commands are unchanged.

The backend script sources remain: `node --test scripts/migrations/20260907-level-catalog.test.js scripts/migrations/20261015-recruitment-duplicate-pools.test.js` from the backend root; `npm test` from `backend/scripts/beta`; and the two `.mongo-test.js` scripts bridged by `RecruitmentDuplicateRepairMongoTest` / `RecruitmentRemainderRepairMongoTest` under `integrationTest` (owned TestMongo plus `mongosh`). These are five source files, not five independent execution suites. This entry cleanup does not add the standalone script tests to existing CI.

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

This Monorepo defaults to `verification_owner=user` for regression/full validation. **Codex owns implementation and the smallest justified developer-side checks; the user independently invokes DSH for adversarial acceptance/testing** in a separate context. DSH starts from the original user requirement and final diff, looks for real-world counterexamples, and reports reproducible findings rather than trusting developer-authored tests. Neither agent should claim an unrun check passed.

Do not require new tests or a test run merely because a small change alters observable behavior or fixes a bug. For L0/L1, diff/relevant-file review normally suffices; for L2, choose targeted checks only with a concrete failure mode. When using an optional local task workflow, in its `test-plan.json`, record an honest risk-based exception rather than create artificial coverage. L3/L4 still require appropriate focused evidence for auth, account isolation, data correctness, persistence, migration and other critical invariants; delegating later review to DSH must not erase those safety checks.

DSH is not automatically dispatched by Codex, nor a completion gate for low-risk edits. Browser automation remains disabled unless explicitly authorized for the current task. Final developer reports should state the change scope, checks actually performed, unknowns and a **short DSH handoff**, not a generic CI checklist.

## Safety for database suites

Test data is synthetic, deterministic and disposable. Database suites use the existing local MongoDB replica set (127.0.0.1:27017) and Redis (127.0.0.1:6379), without Docker or Testcontainers. TestMongo only permits databases randomly allocated and registered by this JVM. TestRedis uses DB 15 and a per-JVM key serializer that scopes keys, Lua KEYS, and wildcard cleanup; Spring test StringRedisTemplate beans receive the same serializer. Direct test templates must use TestRedis.template(factory). Never bypass these fixtures, flush Redis, or access MaaBackend/HubBackend or production data. Missing infrastructure is a failure, not a skip. JVM shutdown cleans only registered databases and namespaced keys; forced termination may leave disposable data. Run bash backend/scripts/dev-up.sh for read-only service checks.

`all` uses a representative 200-user × 2-account dataset. `stress` rebuilds about 706,000 logical business objects in a random disposable Mongo database and validates counts, account isolation, pagination, embedded operator/star data, and scoped inventory idempotency indexes.

## Local-only workflow

`.dev/` and `.trellis/` are ignored and are never published. A clean clone or Worktree can run the component checks and `scripts/test.sh` without Trellis. An optional local task workflow may supply `--task .trellis/tasks/<task>` for reviewed coverage and completion evidence; it is not included in the clone. Without a task plan, `plan` does not perform the optional task coverage review; an empty gaps list is not proof of business coverage.
