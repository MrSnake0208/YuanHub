# Agent 本地真实登录

入口：在 **YuanHub-All 根目录**运行 `python3 scripts/agent-test/agent.py`。
这是独立合成数据环境；普通开发数据库、远端副本和正式服务均不接入。

## 首次使用

需要 Python 3、Node 20+、JDK 21、Docker daemon、工作区已有 Playwright 1.63、Google Chrome，以及前后端已有依赖。
可先检查 `docker info`、`npx --no-install playwright --version`、`npx --no-install playwright cli --help`。
工具明确使用 `chrome` channel 与独立 profile，不访问日常 Chrome 个人资料；缺少 Chrome 时先安装 Google Chrome。

1. 确认没有 cloudflared，且 8080 / 5173 没有其它开发服务。工具会探测并拒绝冲突，**不会停止或重启现有服务**。已有服务需要由用户自行安排切换；不要为此直接运行 Vite/bootRun。
2. 创建专属容器与随机凭据：

   ```bash
   python3 scripts/agent-test/agent.py setup
   ```

3. 在一个终端保持服务运行。入口内部只调用根 `./dev.sh`，固定绑定 loopback，不使用 tunnel：

   ```bash
   python3 scripts/agent-test/agent.py start
   ```

4. 另一个终端初始化两种身份的示例数据，然后打开普通身份浏览器：

   ```bash
   python3 scripts/agent-test/agent.py init
   python3 scripts/agent-test/agent.py login user
   python3 scripts/agent-test/agent.py check user
   ```

`start` 只复用 `/version` 和私有 ready 证明都匹配本实例的前后端。后端启动期间请等日志显示就绪后再 `init`。
账号由后端启动时通过现有 `UserService.register/login` 创建和验活，密码使用现有 BCrypt；一次性验证码仅在专属 Redis 内生成并经现有校验消耗，不发邮件、不输出验证码。没有新增认证 HTTP 入口。

## 每个新 Agent 会话

```bash
python3 scripts/agent-test/agent.py login user
python3 scripts/agent-test/agent.py cli user snapshot
python3 scripts/agent-test/agent.py cli user goto http://127.0.0.1:5173/inventory
python3 scripts/agent-test/agent.py cli user screenshot
```

管理身份独立打开：

```bash
python3 scripts/agent-test/agent.py login admin
python3 scripts/agent-test/agent.py cli admin goto http://127.0.0.1:5173/calendar/admin
python3 scripts/agent-test/agent.py check admin
```

浏览器由官方 Playwright CLI 命名会话管理，使用 `open --profile`、`state-load`、`state-save`；实际版本与参数已通过本机 help 核对。
`login` 在真实 Vite 页面调用现有 `auth.refresh()` / `auth.login()`，由应用持久化 `yh_auth`，随后通过真实账号/权限 API 验活，保存官方 storage state 并加载到命名浏览器。
不会构造 JWT、注入 isAdmin 或拦截 API。仅打开自己的普通 Chrome 标签页不会自动登录；必须使用此入口管理的 profile/session。
官方说明：[认证状态](https://playwright.dev/docs/auth)、[命名会话与持久 profile](https://github.com/microsoft/playwright-cli)。

`check` 检查**当前打开的命名浏览器**，不使用旧快照掩盖退出登录。手工退出后它会失败；再次 `login` 明确恢复登录。`login` 会重新打开所选的命名浏览器，请先保存该浏览器中的未提交表单。
access JWT 在此沙箱设为 10 秒，真实页面按现有刷新逻辑续期；refresh 失效自动使用本机密码重新登录。临时网络故障拒绝继续，不视为有效登录，也不自动改密码。
CLI 包装入口允许 snapshot/screenshot/click/fill/press/resize/reload/goto/close；避免 storage/network/tracing 命令把 token 打到输出。截图留在私有目录，默认不要导出或提交。

## 数据与权限

| 身份 | 数据 | 权限 |
| --- | --- | --- |
| `agent-user-default@example.test` | 代号鸢、如鸢两个统一子账号；每游戏一个私有账房示例（100 初始积分） | 普通账号；通过本地 beta 正常报名；无管理角色、无招募 limited grant |
| `agent-admin-default@example.test` | 同样双游戏账号和账房；每游戏一个专属合成签到活动与订阅 | 仅 `ACTIVITY_CALENDAR_EDITOR`；可进入 `/calendar/admin`；不是 SUPER_ADMIN，不能管理招募授权 |

当前日历及订阅接口都要求管理能力，不能靠给普通账号隐藏授权来演示。招募仍为真实 LIMITED 规则，两个身份默认都无 grant，档案接口应拒绝。不自动发布招募卡池、反馈、共用目录或生产配置。
库存、密探、招募档案保持空白，可用真实页面检查空态；此次最小 fixture 选择双账号、账房、日历/订阅，没有复制生产目录或伪造密探对象。
`init` 使用正式业务 API/Service，只补缺失项目；fixture ID 清单保留改名后的对象，不覆盖已有数量、进度或日期。已有订阅被手工取消时不强制订回；活动日期过期也不自动延长。

多个 Agent 使用独立浏览器会话：

```bash
python3 scripts/agent-test/agent.py login user --session alice
python3 scripts/agent-test/agent.py cli user --session alice snapshot
```

同身份多浏览器仍共享业务数据；需要独立用户/库时，以 `--namespace alice` 为每个命令指定另一组容器、凭据与用户（标识限 1–10 位小写字母/数字/`-`）。当前服务器端口固定为 8080/5173，多个 namespace 的服务不能同时运行；它们可分别保留容器，再由用户安排切换服务。**同 namespace 的 init/reset/setup 串行执行**，没有引入并发调度平台。

## 重置、轮换与清理

```bash
# 只删除所选身份 fixture 清单中的双游戏子账号（业务级联）和账房方案
python3 scripts/agent-test/agent.py reset user --yes
python3 scripts/agent-test/agent.py init

# 关闭此命名浏览器，不影响其它 session
python3 scripts/agent-test/agent.py cli user close
```

重置不删除用户、权限、其它私有账号或公共活动；没有 dropDatabase/FLUSHDB 操作。
完整清理/轮换前，先关闭相关浏览器，并由用户停止此工作流启动的开发服务；然后：

```bash
python3 scripts/agent-test/agent.py cleanup --yes
python3 scripts/agent-test/agent.py setup
```

`cleanup` 逐个校验所有容器 ID/标签/挂载/端口，才移除**本实例容器**及本 namespace 私有配置；容器内仅有此实例合成数据，无持久化 volume。新 setup 生成新密码和 JWT secret，旧 token 对新实例失效。不要手改 manifest 密码，后端不会覆盖已有账号密码；不要运行通用 Compose `down -v` 或清理已有库。
容器采用 tmpfs + `--rm`：关闭 Docker/移除容器会丢失此专属合成数据。Docker daemon 重启后若容器已消失，工具拒绝冒认其它容器；可核对已记录 ID 均不存在后，自行移除对应 `.agent-test/<namespace>` 私有目录，再 setup。不要删除其它 namespace。

密码、JWT secret、token 快照、浏览器 profile、截图与日志只存于 Git 忽略的 `.agent-test/`，目录 0700、配置/state 0600。不要打印 manifest、yh_auth、HTTP Authorization、refresh 响应或认证 trace；不要把它们贴进任务日志、README、报告或 Git。
官方 CLI 的 daemon 元数据位于用户 Playwright 缓存中；浏览器 profile 和所有工作区输出通过私有工作目录隔离。关闭命名会话后可按官方 CLI 文档删除其 daemon 缓存，不要 `close-all/kill-all` 干扰其它 Agent。

## 故障排查与验收

| 诊断 | 操作 |
| --- | --- |
| `发现 cloudflared` | 用户先停止 tunnel，再 setup/start/init/login；工具不会停止它 |
| Docker 不可用 | 启动 Docker Desktop，再 `docker info`；禁止改接 localhost 27017/6379 |
| 缺少 manifest / ready | 先 setup/start；只在私有 `backend.log` 查看启动错误，不贴出敏感内容 |
| 服务/代理实例不匹配 | 当前开发服务属于另一个环境；用户安排停止/切换后再 start |
| Mongo/Redis marker、profile、配置不符 | 失败关闭；核对容器，重新创建此专属实例，禁止复制真实库或删除安全校验 |
| `SESSION_REFRESH_TEMPORARY` | 网络/服务暂时失败；检查服务再 login |
| `SESSION_LOGIN_REJECTED` | 账号停用或密码已修改；按上述完整清理流程轮换此专属环境 |
| check 显示未登录 / CLI 会话关闭 | 再执行相同角色和 session 的 login |
| init 遇到 403 或角色变化 | 查看 beta 是否候补/招募是否仍 LIMITED；不自动提权或重置全局活动 |

定向单元/Mock 验证（不访问开发数据库）：

```bash
python3 -m unittest discover -s scripts/agent-test -p 'test_*.py'
node --test scripts/agent-test/browser.test.mjs
(cd YuanHub && node --test test/viteTunnelConfig.test.js)
(cd backend && ./gradlew test --tests 'com.lhs.share.config.agent.*' --console=plain)
```

真实认证 E2E（仅在 setup/start/init 完成后）：

```bash
python3 scripts/agent-test/agent.py e2e
```

它针对 `http://127.0.0.1:5173` 的真实代理/后端，验证两身份、双游戏账号、普通/最小管理权限、招募拒绝、跨用户账房 404、私有账房创建/读回/删除、页面刷新、实际 access JWT 过期与续期、退出后重登、前端路由拒绝/允许及 storage state 重新开浏览器；截图保存在私有目录。成功输出仅含角色、账号数、访问目标和结果。
这个命令没有 Mock/API route 拦截。上述单元测试只能证明脚本/Service 边界逻辑，不能代替真实 E2E。
E2E 失败时不要宣布真实登录流程验收通过，也不要切换到普通开发库或合成登录页面掩盖失败。
