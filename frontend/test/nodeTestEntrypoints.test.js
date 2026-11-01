import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const repoFiles = [
  'promo-site/test/promo.test.js',
  'test/nested/module.test.mjs',
  'test/ordinary.test.js',
  'test/property/rules.test.js',
  'test/require.test.cjs',
]

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'yuanhub-entry-'))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const root = join(parent, 'renamed-frontend')
  for (const name of ['scripts/run-node-tests.mjs', 'test/contract.test.js', ...repoFiles, 'test/helper.js']) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest))
  copyFileSync(new URL('../scripts/run-node-tests.mjs', import.meta.url), join(root, 'scripts/run-node-tests.mjs'))
  copyFileSync(new URL('./contract.test.js', import.meta.url), join(root, 'test/contract.test.js'))
  for (const name of repoFiles) writeFileSync(join(root, name), `console.log(${JSON.stringify('fixture:' + name)})\n`)
  writeFileSync(join(root, 'test/helper.js'), 'throw new Error("helper must not be discovered")\n')
  return root
}

function run(root, command, args, env = {}) {
  const childEnv = { ...process.env, YUANHUB_BACKEND_ROOT: '', ...env }
  // The fixture launches its own test runner; inheriting this marker makes Node skip it.
  delete childEnv.NODE_TEST_CONTEXT
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: childEnv,
  })
  assert.equal(result.error, undefined)
  return { ...result, output: result.stdout + result.stderr }
}

test('收集器递归发现 property/promo 和支持的扩展名，仅按入口排除契约', (t) => {
  const root = fixture(t)
  for (const excluded of [false, true]) {
    const args = ['scripts/run-node-tests.mjs', '--list', ...(excluded ? ['--exclude', 'test/contract.test.js'] : [])]
    const result = run(root, process.execPath, args)
    assert.equal(result.status, 0, result.output)
    assert.deepEqual(result.stdout.trim().split('\n'), [...repoFiles, ...(excluded ? [] : ['test/contract.test.js'])].sort())
    assert.doesNotMatch(result.output, /fixture:/)
  }
})

test('重命名单仓检出没有后端也能执行默认 test/test:repo，且实际执行全部本仓文件', (t) => {
  const root = fixture(t)
  for (const script of ['test', 'test:repo']) {
    const result = run(root, 'npm', ['run', script])
    assert.equal(result.status, 0, result.output)
    for (const name of repoFiles) assert.ok(result.stdout.includes('fixture:' + name), name)
    assert.doesNotMatch(result.output, /\[contract\]/)
  }
})

test('显式契约在默认或自定义后端缺失时均失败，显示读取路径和配置参数', (t) => {
  const root = fixture(t)
  for (const target of ['', join(root, 'custom-backend')]) {
    const result = run(root, 'npm', ['run', 'test:contract'], { YUANHUB_BACKEND_ROOT: target })
    assert.notEqual(result.status, 0, result.output)
    assert.ok(result.output.includes(target || join(dirname(root), 'BackEndV3-Share')), result.output)
    assert.match(result.output, /YUANHUB_BACKEND_ROOT/)
    assert.match(result.output, /跨仓契约无法读取/)
  }
})

test('本仓 test:all 聚合静态、Node、行为、构建，独立检出不加载跨仓契约', (t) => {
  const root = fixture(t)
  const config = structuredClone(manifest)
  for (const script of ['test:static', 'test:behavior', 'build']) {
    config.scripts[script] = `node -e "console.log('fixture:${script}')"`
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify(config))
  const result = run(root, 'npm', ['run', 'test:all'])
  assert.equal(result.status, 0, result.output)
  for (const script of ['test:static', 'test:behavior', 'build']) {
    assert.ok(result.stdout.includes('fixture:' + script), script)
  }
  for (const name of repoFiles) assert.ok(result.stdout.includes('fixture:' + name), name)
  assert.doesNotMatch(result.output, /\[contract\]/)
})

test('本仓子测试失败会传播到默认入口', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, 'test/property/rules.test.js'), 'throw new Error("fixture regression")\n')
  const result = run(root, 'npm', ['test'])
  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /fixture regression/)
})
