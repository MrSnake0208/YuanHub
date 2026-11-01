import { chromium } from 'playwright'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const origin = 'http://127.0.0.1:5173'

export function sessionPaths(directory, role, session) {
  assert.ok(['user', 'admin'].includes(role) && /^[a-z0-9-]{1,24}$/.test(session))
  const work = join(directory, `browser-${role}-${session}`)
  return { work, state: join(work, 'state.json'), profile: join(work, 'profile') }
}

// This function also runs inside the real Vite page; tests inject only the auth boundary.
export async function establishSession({ identity, expectedId, force = false }, loadAuth = () => import('/src/store/auth.js')) {
  const { auth } = await loadAuth()
  if (auth.userInfo?.id && auth.userInfo.id !== expectedId) throw new Error('SESSION_WRONG_IDENTITY')
  let mode = 'login'
  if (!force && auth.accessToken) {
    if (await auth.refresh()) mode = 'refresh'
    else if (!auth.refreshRejected) throw new Error('SESSION_REFRESH_TEMPORARY')
  }
  if (mode === 'login') {
    try { await auth.login(identity.email, identity.password) }
    catch (error) {
      if (error.status === 401 || error.status === 403) throw new Error('SESSION_LOGIN_REJECTED: 账号未启用或凭据已变更；按 README 轮换专属环境')
      throw new Error('SESSION_LOGIN_UNAVAILABLE: 检查本地服务与受保护 backend.log 后重试')
    }
  }
  if (auth.userInfo?.id !== expectedId || !auth.accessToken) throw new Error('SESSION_IDENTITY_REJECTED')
  return { mode, userId: auth.userInfo.id }
}

async function api(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const { request } = await import('/src/api/request.js')
    try { return { status: 200, data: await request(path, { ...options, auth: true }) } }
    catch (error) { return { status: error.status || 0 } }
  }, { path, options })
}

async function ok(page, path, options) {
  const result = await api(page, path, options)
  if (result.status !== 200) throw new Error(`API_REJECTED ${path.split('?')[0]} status=${result.status}`)
  return result.data
}

function saveJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 })
  chmodSync(path, 0o600)
}

async function saveState(context, paths) {
  await context.storageState({ path: paths.state })
  chmodSync(paths.state, 0o600)
}

export async function ensureAccounts(apiCall, saved = {}) {
  const list = await apiCall('/v1/accounts')
  for (const game of ['代号鸢', '如鸢']) {
    const name = `Agent ${game}`
    const existing = list.find(a => a.id === saved[game]) || list.find(a => a.name === name)
    const account = existing || await apiCall('/v1/accounts', { method: 'POST', body: { name, game } })
    if (account.game !== game) throw new Error('FIXTURE_GAME_CHANGED')
    saved[game] = account.id
  }
  return saved
}

async function seed(page, role, data, directory) {
  const beta = await ok(page, '/v1/beta/me')
  assert.equal(beta.campaign_id, `yuanhub-beta-local-agent-${data.instance}`)
  assert.equal(beta.campaign.local_test_mode, true)
  if (!beta.can_use_beta_features) {
    await ok(page, '/v1/beta/join', { method: 'POST', body: {
      campaign_id: beta.campaign_id, rules_version: beta.campaign.rules_version, accepted_terms: true, accept_waitlist: true
    } })
  }
  const path = join(directory, `fixtures-${role}.json`)
  const fixtures = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { accounts: {}, plans: {}, events: {} }
  const call = (path, options) => ok(page, path, options)
  fixtures.accounts = await ensureAccounts(call, fixtures.accounts)
  saveJSON(path, fixtures)
  for (const [game, version] of [['代号鸢', 'daihao'], ['如鸢', 'ru']]) {
    const name = `Agent ${game} 示例`
    const plans = await call(`/hub/ledger/plan?version=${version}`)
    const plan = plans.find(p => p.id === fixtures.plans[game]) || plans.find(p => p.name === name) ||
      await call('/hub/ledger/plan', { method: 'POST', body: { name, version, exchange_rate: 7, initial_points: 100 } })
    fixtures.plans[game] = plan.id
    saveJSON(path, fixtures)
    if (role !== 'admin') continue
    const marker = `agent-test:${data.instance}:${version}`
    const entries = (await call(`/v1/admin/activity-calendar?game=${encodeURIComponent(game)}`)).items
    let event = entries.find(e => e.item.id === fixtures.events[game]) || entries.find(e => e.source_note === marker)
    if (!event) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      const end = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10)
      event = await call('/v1/admin/activity-calendar', { method: 'POST', body: {
        game, title: 'Agent 合成签到示例', category: 'LOGIN', start_date: today, end_date: end,
        source_note: marker, description: '仅专属隔离库中的合成活动'
      } })
    }
    fixtures.events[game] = event.item.id
    saveJSON(path, fixtures)
    const accountId = fixtures.accounts[game]
    const subscription = await api(page, `/v1/activity-calendar/subscriptions/${event.item.id}?account_id=${accountId}`)
    if (subscription.status === 404) {
      await call(`/v1/activity-calendar/subscriptions/${event.item.id}`, { method: 'PUT', body: {
        account_id: accountId, expected_version: null, subscribed: true
      } })
    } else assert.equal(subscription.status, 200)
  }
}

async function boundaries(page, role, expectedId) {
  const access = await ok(page, '/v1/admin/access/me')
  assert.deepEqual(access.roles, role === 'admin' ? ['ACTIVITY_CALENDAR_EDITOR'] : [])
  assert.equal(access.super_admin, false)
  assert.deepEqual(access.permissions, role === 'admin' ? ['activity_calendar:write'] : [])
  const accounts = await ok(page, '/v1/accounts')
  assert.ok(['代号鸢', '如鸢'].every(game => accounts.some(a => a.game === game)))
  assert.equal((await api(page, '/v1/admin/activity-calendar')).status, role === 'admin' ? 200 : 403)
  assert.equal((await api(page, '/v1/admin/recruitment-access')).status, 403)
  const recruitment = await ok(page, '/v1/recruitment/access/me')
  assert.equal(recruitment.can_access, false)
  assert.equal(recruitment.granted, false)
  assert.equal((await api(page, `/v1/recruitment/archive?account_id=${accounts[0].id}`)).status, 403)
  const current = await page.evaluate(async () => (await import('/src/store/auth.js')).auth.userInfo.id)
  assert.equal(current, expectedId)
  return { role, accounts: accounts.length, adminCalendar: role === 'admin', recruitment: 'denied' }
}

function cli(paths, name, args, show = false) {
  const result = spawnSync(process.execPath, [join(root, 'node_modules/playwright/cli.js'), 'cli', `-s=${name}`, ...args],
    { cwd: paths.work, encoding: 'utf8', env: process.env })
  if (result.status !== 0 || /^### Error/m.test(result.stdout || '')) throw new Error('CLI_FAILED: 检查命名会话或执行 login')
  if (show) process.stdout.write(result.stdout)
}

async function main() {
  process.umask(0o077)
  const command = process.argv[2]
  const manifest = process.env.AGENT_TEST_MANIFEST
  const directory = dirname(manifest)
  const data = JSON.parse(readFileSync(manifest, 'utf8'))
  const ready = JSON.parse(readFileSync(join(directory, 'ready.json'), 'utf8'))
  const roles = ['init', 'e2e'].includes(command) ? ['user', 'admin'] : [process.env.AGENT_TEST_ROLE]
  for (const role of roles) {
    const identity = data.users[role]
    const expectedId = ready.users[role]
    const paths = sessionPaths(directory, role, process.env.AGENT_TEST_SESSION)
    mkdirSync(paths.work, { recursive: true, mode: 0o700 })
    chmodSync(paths.work, 0o700)
    mkdirSync(join(paths.work, '.playwright'), { recursive: true, mode: 0o700 })
    const name = `yh-${data.instance.slice(0, 8)}-${role}-${process.env.AGENT_TEST_SESSION}`
    if (command === 'cli') {
      const args = process.argv.slice(3).filter(arg => arg !== '--')
      // Keep ordinary page operations; storage/network inspection can expose credentials.
      assert.ok(['snapshot', 'screenshot', 'click', 'fill', 'press', 'resize', 'reload', 'goto', 'close'].includes(args[0]))
      if (args[0] === 'goto') assert.ok(args[1]?.startsWith(origin + '/'))
      if (args[0] === 'screenshot') assert.equal(args.length, 1) // default stays in private work directory
      cli(paths, name, args, true)
      continue
    }
    if (command === 'check') {
      // Inspect the open browser, so manual logout cannot be hidden by an old state file.
      cli(paths, name, ['run-code', `async page => {
        const result = await page.evaluate(async () => {
          const {auth} = await import('/src/store/auth.js');
          if (!auth.accessToken) throw new Error('已退出登录，请执行 login');
          const {request} = await import('/src/api/request.js');
          await request('/v1/accounts', {auth:true});
          if (auth.userInfo.id !== ${JSON.stringify(expectedId)}) throw new Error('身份不符');
          return {loggedIn:true, role:${JSON.stringify(role)}};
        }); return result;
      }`], true)
      cli(paths, name, ['state-save', paths.state])
      chmodSync(paths.state, 0o600)
      continue
    }
    const browser = await chromium.launch({ channel: 'chrome' })
    let context
    try {
      context = await browser.newContext(existsSync(paths.state) ? { storageState: paths.state } : {})
      const page = await context.newPage()
      await page.goto(origin)
      await page.evaluate(establishSession, { identity, expectedId })
      if (command === 'init') await seed(page, role, data, directory)
      if (command === 'reset') {
        const path = join(directory, `fixtures-${role}.json`)
        const fixtures = JSON.parse(readFileSync(path, 'utf8'))
        const owned = await ok(page, '/v1/accounts')
        for (const id of Object.values(fixtures.accounts)) {
          if (owned.some(a => a.id === id)) await ok(page, `/v1/accounts/${id}`, { method: 'DELETE' })
        }
        for (const id of Object.values(fixtures.plans)) {
          const result = await api(page, `/hub/ledger/plan/${id}`)
          if (result.status === 200) await ok(page, `/hub/ledger/plan/${id}`, { method: 'DELETE' })
          else assert.equal(result.status, 404)
        }
        fixtures.accounts = {}; fixtures.plans = {}
        saveJSON(path, fixtures)
        console.log(`${role}: 仅已登记的私有示例账号/账房方案已重置；运行 init 补齐。`)
        continue
      }
      const result = await boundaries(page, role, expectedId)
      if (command === 'e2e') {
        const other = role === 'user' ? 'admin' : 'user'
        const foreign = JSON.parse(readFileSync(join(directory, `fixtures-${other}.json`), 'utf8'))
        assert.equal((await api(page, `/hub/ledger/plan/${Object.values(foreign.plans)[0]}`)).status, 404)
        const temporary = await ok(page, '/hub/ledger/plan', { method: 'POST', body: {
          name: `Agent E2E ${role}`, version: 'daihao', initial_points: 0, exchange_rate: 7
        } })
        try {
          assert.equal((await ok(page, `/hub/ledger/plan/${temporary.id}`)).name, `Agent E2E ${role}`)
        } finally {
          await ok(page, `/hub/ledger/plan/${temporary.id}`, { method: 'DELETE' })
        }
        await page.reload()
        await page.evaluate(establishSession, { identity, expectedId })
        const issuedToken = await page.evaluate(async () => (await import('/src/store/auth.js')).auth.accessToken)
        // Actual backend expiry, not a fabricated token or mocked response.
        await new Promise(resolve => setTimeout(resolve, 11000))
        const rejected = await page.evaluate(async issuedToken => {
          const response = await fetch('/v1/accounts', { headers: { Authorization: `Bearer ${issuedToken}` } })
          const body = await response.json()
          return response.status === 401 || body.status_code === 401
        }, issuedToken)
        assert.equal(rejected, true)
        await ok(page, '/v1/accounts')
        const renewed = await page.evaluate(async issuedToken => (await import('/src/store/auth.js')).auth.accessToken !== issuedToken, issuedToken)
        assert.equal(renewed, true)
        await page.evaluate(async () => (await import('/src/store/auth.js')).auth.logout())
        await page.waitForURL('**/login')
        const relogin = await page.evaluate(establishSession, { identity, expectedId })
        assert.equal(relogin.mode, 'login')
        const route = role === 'admin' ? '/calendar/admin' : '/operator/admin'
        await page.goto(origin + route)
        await page.evaluate(async () => (await import('/src/router/index.js')).default.isReady())
        await page.waitForURL(role === 'admin' ? '**/calendar/admin' : '**/forbidden?**')
        if (role === 'admin') assert.equal(new URL(page.url()).pathname, route)
        else assert.notEqual(new URL(page.url()).pathname, route)
        await page.goto(origin)
        await page.screenshot({ path: join(paths.work, 'home.png'), fullPage: true })
      }
      await saveState(context, paths)
      if (command === 'e2e') {
        await context.close()
        context = await browser.newContext({ storageState: paths.state })
        const reopened = await context.newPage()
        await reopened.goto(origin)
        await reopened.evaluate(establishSession, { identity, expectedId })
        await boundaries(reopened, role, expectedId)
        await saveState(context, paths)
      }
      console.log(JSON.stringify({ target: origin, ...result, check: command, network: 'real backend; no routes mocked' }))
    } finally {
      await browser.close()
    }
    if (command === 'login') {
      cli(paths, name, ['open', 'about:blank', '--browser=chrome', `--profile=${paths.profile}`])
      cli(paths, name, ['state-load', paths.state])
      cli(paths, name, ['goto', origin])
      console.log(`命名会话 ${name} 已打开；工作目录 ${paths.work}`)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Playwright errors can include evaluated arguments; never print raw stacks/payloads.
    const safe = /^(SESSION_|API_REJECTED|CLI_FAILED|FIXTURE_)/.test(error.message) ? error.message : '验证失败；检查服务、init、隔离配置或浏览器安装'
    console.error(safe)
    process.exitCode = 1
  })
}
