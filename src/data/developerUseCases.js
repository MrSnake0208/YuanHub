// Product entries are separate from the document/asset allowlist.
export const developerUseCases = [
  { id: 'operator-read', title: '读取用户密探养成', summary: '在你的应用中展示用户的等级、星级、化极等养成状态。', access: '用户授权 · operator:read', icon: 'BookUser', path: '/developers/use-cases/operator-read', action: '开始接入' },
  { id: 'inventory-read', title: '读取用户背包库存', summary: '读取用户所选游戏账号的物品和材料数量。', access: '用户授权 · inventory:read', icon: 'PackageOpen', path: '/developers/api/inventory', action: '查看 API 说明' },
  { id: 'calendar-read', title: '接入活动日历', summary: '读取用户绑定账号所属游戏的活动与个人订阅；当前 OpenAPI 活动接口仍需授权。', access: '用户授权 · calendar:read', icon: 'CalendarDays', path: '/developers/api/calendar#doc-活动日历', action: '查看 API 说明' },
  { id: 'catalog-read', title: '使用公共游戏目录', summary: '为应用提供密探、物品、招募等目录及稳定 ID 映射。', access: '公开数据 · 无需用户授权', icon: 'ListChecks', path: '/developers/protocols/catalogs', action: '查看目录说明' }
]

export const developerReferences = [
  { title: '第三方接入指南', summary: '调试、逐用户连接与上线约束', path: '/developers/guide' },
  { title: 'API 参考', summary: '接口、权限与响应约定', path: '/developers/api' },
  { title: '数据交换协议', summary: '格式、Schema 与支持矩阵', path: '/developers/protocols' },
  { title: '版本更新', summary: '协议与公开接口变化', path: '/developers/changelog' },
  { title: '历史兼容', summary: 'V2 / V3 / V4 等旧版约定', path: '/developers/protocols#doc-旧版兼容和迁移' }
]

export const operatorReadPrompt = `我正在开发一款第三方应用，希望让我的用户连接 YuanHub，并在我的应用中查看他们各自的密探养成数据。请基于我现有项目的技术栈集成 YuanHub API。

先调查项目：
- 检查现有代码、技术栈、目标平台、登录体系、后端和凭据存储方式，找到实际集成位置并给出最小实施计划，再编写代码。
- 如果尚未提供第三方项目，先确认平台（微信小程序、网站、App 或桌面软件）和代码环境，等待必要信息；不要默认新建命令行工具或生成无关的大量脚手架。

接口与权限：
- GET /open-api/operator/current，只需 operator:read 权限。
- 鉴权头：Authorization: Bearer <OpenAPI Token>。连接码就是应用用户手动创建的 OpenAPI Token，绑定该用户的一个游戏子账号，不能通过额外 account_id 切换账号。
- 可先用 GET /open-api/operator/account（有效 Token 即可）核对绑定账号，再读取 current 验证 operator:read；未验证时不能显示“已连接”。
- game 是可选查询参数；默认不传。需要筛选时，使用用户实际游戏值并正确 URL 编码。
- 只读接入不调用导入、扫描提交或其他写接口，不要求写入或导出权限。

响应解析：
- 同时检查 HTTP 状态与普通响应的 status_code；成功为 200，业务内容在 data。支持 error.code/message 与 status_code/message 两种错误形式。
- data 是数组，每一项含 user_id、game、account_id、entries、updated_at 等字段。用 Object.entries 或对应语言的映射遍历方式遍历每项 entries，键是密探 ID，值是养成记录，不能把 data 当对象或把 entries 当数组。
- 显示 level（等级）、star_level（星级）、elite（修为）及有值的 huaji（独立化极对象，含 owned、stage、awakened）。不要从 elite 推算独立化极或突破；缺失/null 字段显示“未知”，不要默认为零或未拥有。
- 名称来自无需 Token 的 GET /v1/operator/catalog，按 data.operators 数组中的 id/name 匹配；目录失败或未知 ID 时显示原始 ID，不编造名字。公共目录缓存与用户私有数据分开。
- current 是当前档案 DTO，不是完整 V5 交换备份；Token export 当前仍是 V2，追加 version=5 不会获得完整 V5。

用户连接与隔离：
- 遵守现有手动模式：用户在 YuanHub 个人中心选择游戏子账号，仅勾选 operator:read，为本应用创建并复制连接码，再通过本应用受保护的连接入口提供。
- 不虚构 OAuth、一键登录授权、自动换取 Token 或自动读取其他账号。不要索要用户登录密码、JWT 或刷新令牌。
- 开发者自己的测试 Token 只能用于自己的测试账号，禁止打包进分发软件，禁止用单个 Token 为多个用户提供私有数据。
- 连接记录、凭据、请求、缓存、后台任务与返回结果均按第三方应用已认证的用户隔离；用户身份来自已验证的服务端会话，不信任请求体传来的用户 ID，不允许按任意 account_id 读取他人数据。
- 连接时核对账号和读取权限；401 后标为需重新连接，403 提示检查 Scope/Beta，网络错误不得误报撤销。换账号和断开时清理旧数据、停止任务，阻止未完成请求回写。
- “断开本应用”停止请求并删除本应用保存的凭据及相关私有缓存，不等于撤销 YuanHub Token。提示用户到 YuanHub 个人中心撤销对应连接；只有确认的撤销结果才可宣称已撤销，不能用 Token 代调需要 JWT 的管理接口。

平台与安全：
- 有后端的应用（包括微信小程序和网站）：用户通过 HTTPS 将连接码交给本应用后端，按应用用户隔离、加密存储，密钥由服务端单独管理；后端调用 YuanHub，客户端只接收所需数据。不得用全局 OPENAPI_TOKEN 环境变量存所有用户的凭据。
- 纯前端网站、无后端小程序、App 或桌面客户端：先说明长期凭据在客户端的泄漏风险。优先采用受控后端；必须直连时只使用该用户的凭据，评估平台网络/CORS 限制，桌面或 App 优先使用系统安全凭据库，本地存储不能提供服务器级安全保护。
- BASE_URL 是受控配置中的 API 后端根地址（末尾不带 /），不是文档地址，不接受任意用户输入的外部地址转发凭据。OPENAPI_TOKEN 环境变量仅用于开发者单账号调试；示例只含占位符，将 .env 加入 .gitignore。
- 不向聊天或 AI 提供真实 Token。禁止把 Token 写入前端公开包、应用内置常量、公开仓库、URL、日志、截图或错误上报；不记录 Authorization 请求头。
- 当前每游戏子账号最多 5 个 Token，长期有效至用户撤销；创建、修改 Scope 和 API 访问受 Token 所有者的 Beta 资格限制。500 名用户需各自授权并满足访问条件，不承诺已具备无门槛大规模第三方授权能力。

错误与交付：
- data=[] 或所有 entries 为空：显示“请求成功，该账号暂无密探数据”，不当作鉴权失败。
- HTTP 401：提示连接码无效或已撤销，停止重试并让对应用户重新连接。
- HTTP 403：提示检查 operator:read 权限及当前 Beta 资格，不自动扩大权限。
- 地址错误（404、返回 HTML）、超时、断网或 5xx：给出可操作提示，不伪造数据、不无限重试、不输出鉴权头。
- 交付实际代码、在现有项目的集成位置、配置步骤和运行命令、用户连接与断开流程，以及必要错误处理；列出当前平台仍需人工验证的事项。
- 使用合成凭据与模拟响应检查两个应用用户隔离、空数据、未知 ID、401/403、网络失败和断开后的旧响应，不需要真实 Token 即可开发验证。
`

export const operatorReadGuide = {
  id: 'operator-read',
  title: '第三方应用密探数据接入指南',
  description: '将密探养成数据接入你的小程序、网站、App 或桌面软件，让每位用户连接自己的 YuanHub 游戏账号。',
  introduction: 'GET /open-api/operator/current 需要 operator:read Scope，使用 Authorization: Bearer <OpenAPI Token>。它返回 Token 绑定游戏子账号的当前密探养成档案。',
  boundaries: [
    '第三方开发者编写与维护应用；应用用户拥有数据并自愿授权；YuanHub 校验 Token、Scope 和账号边界。',
    '开发者的测试 Token 只能访问自己的测试账号。500 名玩家各自授权、分别连接，不能共用开发者的 Token。',
    '本接口只读，不修改密探。当前档案 DTO 不是可原样恢复的完整 V5 交换备份；Token export 仍为 V2，完整 V5 备份仅支持站内 JWT。'
  ],
  connectionSteps: [
    '应用先说明读取目的、operator:read 权限和凭据保存方式，让用户知情、自愿连接。',
    '用户登录 YuanHub「个人中心 → 应用与数据连接」，展开「开发者与第三方 API」，选择自己的游戏子账号。',
    '在「这个工具可以做什么」中仅勾选 operator:read，填写能辨认本应用的连接名称，创建 API 访问凭证。',
    '用户复制连接码，通过本应用受保护的连接入口提供；有后端时通过 HTTPS 交给后端，不粘贴到聊天或 AI 中。',
    '应用按当前已登录用户保存独立凭据，调用 /open-api/operator/account 核对绑定账号，并成功读取 current 后显示已连接；空数据也是读取成功。'
  ],
  connectionPath: '/user/profile',
  prompt: operatorReadPrompt,
  curl: `# 仅用于开发者自己的测试账号，不要把真实连接码发给 AI。
export BASE_URL='https://YOUR_YUANHUB_API_ORIGIN'
printf 'Test OpenAPI Token: '
read -r -s OPENAPI_TOKEN
export OPENAPI_TOKEN
printf '\\n'
curl --fail-with-body --connect-timeout 10 --max-time 30 \\
  -H "Authorization: Bearer $OPENAPI_TOKEN" \\
  "$BASE_URL/open-api/operator/current"
# 调试完成后清除当前终端变量
unset OPENAPI_TOKEN`,
  serverExample: `// Node.js 服务端示例；credentialStore 是现有项目的凭据存储适配器，
// getForUser 必须只返回该应用用户的已解密凭据，不能用全局 Token 代替。
export async function readOperatorsForUser(authenticatedUserId, credentialStore) {
  if (!authenticatedUserId) throw new Error('请先登录本应用');
  // 用户 ID 必须来自已验证的服务端会话，不能取自请求体或 URL。
  const connection = await credentialStore.getForUser(authenticatedUserId);
  if (!connection?.token) throw new Error('请先连接 YuanHub');
  const baseUrl = process.env.BASE_URL; // 受控的后端配置
  if (!baseUrl) throw new Error('请配置 YuanHub API 后端根地址');
  const response = await fetch(baseUrl + '/open-api/operator/current', {
    headers: { Authorization: 'Bearer ' + connection.token },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
    cache: 'no-store'
  });
  if (response.status === 401) throw new Error('连接码无效或已撤销，请重新连接');
  if (response.status === 403) throw new Error('请检查 operator:read 与 Beta 资格');
  if (!response.ok) throw new Error('YuanHub 请求失败，请稍后重试');
  const body = await response.json();
  if (body.status_code !== 200 || !Array.isArray(body.data)) {
    throw new Error('YuanHub 返回业务错误或异常数据');
  }
  return body.data; // 空数组是成功；调用方仅返回给当前已认证用户
}`,
  example: {
    status_code: 200,
    data: [{
      user_id: 'example_user', account_id: 'example_account', game: '如鸢',
      entries: {
        EXAMPLE_OPERATOR_ID: {
          elite: 5, star_level: 3, level: 60,
          discs: [], star_stones: [], disc_loadouts: [], revision: 1,
          huaji: { owned: true, stage: 1, awakened: false }
        }
      },
      updated_at: '2026-10-18T00:00:00Z'
    }]
  },
  fields: [
    { name: 'status_code / data', description: '成功为 200；data 是档案数组。没有数据时可返回空数组 []。' },
    { name: 'data[].user_id / account_id / game / updated_at', description: 'YuanHub 用户、绑定游戏子账号、游戏和档案更新时间；它们不是第三方应用的登录身份，不可直接用于授权第三方请求。' },
    { name: 'data[].entries', description: '以密探 ID 为键的映射；每个值是一条养成记录，不是密探列表数组。示例 ID 为占位符。' },
    { name: 'level / star_level / elite', description: '依次表示等级、星级、修为。elite 不等于独立化极阶段。' },
    { name: 'huaji', description: '独立化极对象，含 owned、stage、awakened；缺失或 null 表示未知，不要自行推算。' },
    { name: '其他字段与名称', description: '真实记录还可包含命盘、星石、战斗数值、突破和时间字段；本示例省略可空字段。名称由公共密探目录 data.operators 的 id/name 映射，失败或未知 ID 时展示原始 ID。' }
  ],
  faqs: [
    { title: '请求成功，但没有密探数据？', answer: 'HTTP 与 status_code 为 200，data 为 [] 或其中 entries 为空，表示读取成功。请该用户确认连接码绑定了正确游戏账号，以及该账号是否已有同步到 YuanHub 的密探记录。' },
    { title: '提示连接码无效（401）？', answer: '连接码可能填写错误或已被撤销。停止该用户的自动重试，标记需重新连接，请用户在 YuanHub 确认连接并重新提供凭据。不要改用登录密码或 JWT。' },
    { title: '提示权限不足（403）？', answer: '请该用户检查 operator:read 与当前 Beta 资格。开发者具备资格不代表应用用户也具备资格；不要索取无关写权限。' },
    { title: '地址错误或网络请求失败？', answer: '404 或返回 HTML 时核对后端根地址和接口路径；超时、断网或 5xx 时显示可恢复错误，不误报撤销、不无限重试。错误日志和截图不得包含连接码或鉴权头。' }
  ],
  referencePath: '/developers/api/operator'
}
