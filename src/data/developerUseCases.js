// Product entries are separate from the document/asset allowlist.
export const developerUseCases = [
  { id: 'operator-read', title: '读取我的密探', summary: '等级、星级、化极等养成状态。', icon: 'BookUser', path: '/developers/use-cases/operator-read', action: '开始接入' },
  { id: 'inventory-read', title: '查看背包库存', summary: '物品和材料的当前数量。', icon: 'PackageOpen', path: '/developers/api/inventory', action: '查看 API 说明' },
  { id: 'calendar-read', title: '获取活动日历', summary: '游戏活动、订阅与日程。', icon: 'CalendarDays', path: '/developers/api/calendar#doc-活动日历', action: '查看 API 说明' },
  { id: 'daily-tasks-read', title: '获取今日历练', summary: '每日任务和完成状态。', icon: 'ListChecks', path: '/developers/api/calendar#doc-每日历练读取', action: '查看 API 说明' }
]

export const developerReferences = [
  { title: 'API 参考', summary: '接口、权限与响应约定', path: '/developers/api' },
  { title: '数据交换协议', summary: '格式、Schema 与支持矩阵', path: '/developers/protocols' },
  { title: '版本更新', summary: '协议与公开接口变化', path: '/developers/changelog' },
  { title: '历史兼容', summary: 'V2 / V3 / V4 等旧版约定', path: '/developers/protocols#doc-旧版兼容和迁移' }
]

export const operatorReadPrompt = `请为我开发一个读取本人 YuanHub 密探养成数据的最小工具，并给出实际运行命令与结果查看方式。优先使用项目现有技术栈；没有项目时，提供可在本机运行的简单命令行工具。

接口与权限：
- GET /open-api/operator/current，只需 operator:read 权限。
- 鉴权头：Authorization: Bearer <OpenAPI Token>。连接码就是用户自行授权的 OpenAPI Token，绑定一个游戏子账号，不需要也不能通过额外 account_id 切换账号。
- game 是可选查询参数；默认不传。需要按游戏筛选时，使用用户实际游戏值并正确 URL 编码。
- 这是只读工具，不调用导入、扫描提交或其他写接口，不要求写入或导出权限。

响应解析：
- 检查 HTTP 状态与普通响应的 status_code；成功为 200，业务内容在 data。
- data 是数组，每一项含 game、account_id、entries 等字段。用 Object.entries 或对应语言的映射遍历方式遍历每项 entries，键是密探 ID，值是养成记录，不能把 data 当对象或把 entries 当数组。
- 显示 level（等级）、star_level（星级）、elite（修为）及有值的 huaji（独立化极对象，含 owned、stage、awakened）。不要从 elite 推算独立化极或突破；缺失/null 字段显示“未知”，不要默认为零或未拥有。
- 需要密探名称时，读取无需 Token 的 GET /v1/operator/catalog，按其 data.operators 数组中的 id/name 匹配（当前目录 DTO 使用 operators，与 current 中的 entries 映射不同）；目录加载失败或未知 ID 时显示原始 ID，不得凭空生成名字。
- 该接口是当前档案 DTO，不是完整 V5 交换文档导出，不能当作可原样恢复的完整备份。

配置与安全：
- 用环境变量 BASE_URL 保存 API 后端根地址（末尾不带 /），OPENAPI_TOKEN 保存真实连接码；提供只含占位符的 .env.example，并把 .env 加入 .gitignore。
- 不要向我索要或让我粘贴真实 Token、登录密码、JWT 或刷新令牌到聊天。工具完成后由我在自己的本地运行环境填写连接码。不要把 Token 放在浏览器前端代码、URL、日志、截图或错误上报中。
- API 请求在本机脚本或服务端发起，不把密钥打包到公开网页中。

错误与验收：
- data=[] 或所有 entries 为空：显示“请求成功，该账号暂无密探数据”，不当作鉴权失败。
- HTTP 401：提示连接码无效、已失效或已撤销，停止重试并让用户重新授权。
- HTTP 403：提示检查 operator:read 权限及站点当前访问资格，不自动申请更多权限。
- 地址错误（例如 404、返回 HTML）、超时、断网或 5xx：给出可操作提示，不伪造数据，不无限重试，不输出鉴权头。
- 交付最少的文件、依赖安装方式（如需）、环境变量填写位置、实际启动命令，以及在哪里查看结果。用空数据和模拟错误验证，不需要真实 Token 即可完成开发。
`

export const operatorReadGuide = {
  id: 'operator-read',
  title: '读取我的密探',
  description: '让 AI 帮你做一个工具，查看自己的密探养成记录。',
  introduction: '你可以让自己制作的工具读取 YuanHub 中的密探养成状态，例如等级、星级、化极等记录。',
  boundaries: [
    '此操作只读取数据，不会修改 YuanHub 中的密探。',
    '连接码需要你自行授权，只能读取它绑定的游戏账号。',
    '读取的是当前养成记录，不代表能够读取完整 V5 交换备份。'
  ],
  connectionSteps: [
    '进入「个人中心 → 应用与数据连接」，未登录时先按站点提示登录。',
    '展开「开发者与第三方 API」，在「绑定游戏账号」中选择你要读取的账号；没有账号时先创建游戏账号。',
    '在「这个工具可以做什么」中仅勾选密探读取权限 operator:read，再创建连接码（OpenAPI Token）。',
    '把连接码保存在自己的本地运行环境。创建后返回本页，复制下一步的 AI 接入说明。'
  ],
  connectionPath: '/user/profile',
  prompt: operatorReadPrompt,
  curl: `# 在自己的终端设置环境变量，不要把真实连接码发给 AI。
export BASE_URL='https://YOUR_YUANHUB_API_ORIGIN'
printf 'OpenAPI Token: '
read -r -s OPENAPI_TOKEN
export OPENAPI_TOKEN
printf '\\n'
curl --fail-with-body --connect-timeout 10 --max-time 30 \\
  -H "Authorization: Bearer $OPENAPI_TOKEN" \\
  "$BASE_URL/open-api/operator/current"`,
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
    { name: 'data[].entries', description: '以密探 ID 为键的映射；每个值是一条养成记录，不是密探列表数组。示例 ID 为占位符。' },
    { name: 'level / star_level / elite', description: '依次表示等级、星级、修为。elite 不等于独立化极阶段。' },
    { name: 'huaji', description: '独立化极对象，含 owned、stage、awakened；缺失或 null 表示未知，不要自行推算。' },
    { name: '其他字段与名称', description: '真实记录还可包含命盘、星石、战斗数值、突破和时间字段；本示例省略可空字段。名称需按 ID 查询公共密探目录。' }
  ],
  faqs: [
    { title: '请求成功，但没有密探数据？', answer: 'HTTP 与 status_code 为 200，data 为 [] 或其中 entries 为空，表示读取成功。先确认连接码绑定了正确的游戏账号，再检查该账号是否已有同步到 YuanHub 的密探记录；不要把空数据当成 Token 无效。' },
    { title: '提示连接码无效（401）？', answer: '连接码可能填写错误、已失效或被撤销。在个人中心确认连接仍有效，必要时重新创建，并更新本地环境变量。不要改用登录密码或 JWT。' },
    { title: '提示权限不足（403）？', answer: '检查连接码是否拥有 operator:read，并确认站点当前访问资格。不需要为读取数据增加写入权限。' },
    { title: '地址错误或网络请求失败？', answer: '404 或返回网页 HTML 时，核对后端根地址与 /open-api/operator/current 路径；超时、断网或 5xx 时，检查网络或稍后再试。API 地址不是 /developers 文档地址，不要在错误截图中包含连接码。' }
  ],
  referencePath: '/developers/api/operator'
}
