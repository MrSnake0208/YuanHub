# YuanHub 反馈与 MaaYuan 诊断 MCP

在支持本地 stdio MCP 的 AI 客户端里查询反馈工单和 MaaYuan 诊断。例如：“列出最近更新的未分派工单”，或“找出出现次数最多的三个待处理诊断，结合最近事件和截图解释第一个问题”。

## 接入

1. 在 YuanHub 仓库根目录安装依赖并取得本机启动路径。需要 Node.js 20 或更高版本。

   ```bash
   cd tools/yuanhub-feedback-mcp
   npm ci
   node -p "require('node:path').resolve('src/index.mjs')"
   ```

2. 配置需要的凭据。在运行 MCP 进程的用户目录创建或编辑 `~/.config/yuanhub-feedback-mcp/config.json`，仅允许本人读取。将 `base_url` 设为目标后端地址，按需填写一种或两种令牌。已有反馈配置可直接增加 `diagnostics_token`。

   ```json
   {
     "base_url": "https://your-yuanhub-backend.example",
     "integration_token": "<个人反馈集成令牌>",
     "diagnostics_token": "<个人 MaaYuan 诊断只读令牌>"
   }
   ```

   | 能力 | 凭据与授权 |
   |---|---|
   | 读取工单、流转记录、附件、已有分析 | 反馈集成令牌需要 `feedback:read`，工单范围由服务端按令牌和所有者权限校验。 |
   | 写入反馈分析 | 仅 `feedback_submit_analysis` 使用 `feedback:analysis:write`。只查看反馈时，使用仅有读取权限的令牌。 |
   | 读取 MaaYuan 问题、事件与截图 | 管理员授予「MaaYuan 诊断只读」后，开发者到「账号与连接码 → MaaYuan 诊断 AI 接入」创建个人令牌，范围为 `MAAYUAN` 和 `diagnostics:read`。 |

   也可通过客户端的密钥配置传入环境变量 `YUANHUB_INTEGRATION_TOKEN`、`YUANHUB_DIAGNOSTICS_TOKEN` 和 `YUANHUB_BASE_URL`，它们优先于文件里的对应值。自定义配置文件路径使用 `YUANHUB_FEEDBACK_MCP_CONFIG_FILE`。省略后端地址时连接 `http://127.0.0.1:8080`。将真实令牌保存在本机密钥配置中。

3. 在 MCP 客户端添加以下 stdio 服务，用第 1 步输出的路径替换示例。已配置 `yuanhub-feedback` 的客户端只需更新原条目的启动路径，保留原服务名和反馈凭据，然后重新连接。客户端与 MCP 进程在不同设备运行时，路径和凭据均以运行 MCP 的设备为准。

   ```json
   {
     "mcpServers": {
       "yuanhub-feedback": {
         "command": "node",
         "args": ["/absolute/path/to/YuanHub/tools/yuanhub-feedback-mcp/src/index.mjs"]
       }
     }
   }
   ```

   使用 TOML 配置的 Codex 客户端可填写同一条目：

   ```toml
   [mcp_servers.yuanhub-feedback]
   command = "node"
   args = ["/absolute/path/to/YuanHub/tools/yuanhub-feedback-mcp/src/index.mjs"]
   ```

## 工具与读取顺序

| 任务 | 工具 |
|---|---|
| 读反馈 | `feedback_list` → `feedback_get`，按需取 `feedback_get_events`、`feedback_get_attachment`、`feedback_get_analysis` |
| 保存反馈分析 | `feedback_submit_analysis` |
| 查诊断 | `diagnostics_list_issues` 按状态、原因或关键词分页。用 `sort=count` 找高频问题，再用返回的 `id` 调用 `diagnostics_get_issue` |
| 读诊断证据 | 用问题详情里的事件 ID 调用 `diagnostics_get_event`。选取 `status=ready` 且 `expired=false` 的图片，通过 `diagnostics_get_image(event_id, asset_id)` 按需获取截图 |

查询诊断需要目标后端已部署诊断授权版本。缺少某一令牌时，该组调用返回 `*_token_not_configured`。后端返回 401 时检查对应令牌是否已撤销或过期；403 时检查账号资格、板块和 scope。每次读取均请求后端。附件和截图共用单文件大小上限，默认 5 MiB，可用 `YUANHUB_MCP_MAX_ATTACHMENT_BYTES` 按字节调整。

维护时可在工具目录运行 `npm run smoke`。该命令用本地模拟 API 和测试令牌，经过真实 MCP stdio 客户端验证工具发现、读取、凭据隔离和撤权响应。
