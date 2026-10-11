# 公开入口与访问恢复

## 权限失败页 `/forbidden`

招募档案资格与管理权限分别判定。守卫使用四种有限原因：`recruitment-required`、`recruitment-unavailable`、`admin-required`、`admin-unavailable`。前两者分别表示招募名单资格不足、资格读取失败；后两者分别表示管理权限不足、权限读取失败。未知原因或不可信来源使用通用提示。

`from` 只保留已注册的站内对应受保护路由，包含原 query/hash；外链、登录页、权限页、未知路径和不匹配的功能不提供重试导航。重试始终经过真实权限守卫，重复点击期间按钮禁用。权限查询失败不放行；查询期间取消导航或切换登录身份会取消旧导航。

## BOX `/operator/share/:token?`

既有解析器继续接受裸分享码与完整分享链接。匿名查看只读取分享投影与公共图鉴，不读取私人库存、备注、目标或登录信息。入口使用“BOX 分享码”名称；从链接进入或返回输入框后保留代码供纠错。

分享接口的 404 / `share_not_found` 表示代码不存在或已失效。图鉴接口的 404 和网络故障只表示图鉴暂不可用，提供重试，不判断分享码是否有效。空分享是有效空状态；旧请求结果不得覆盖新分享。

创建、重新生成、撤销与复制仍由已有分享管理组件负责。撤销或重新生成后旧代码失效；当前契约没有自动到期机制，不新增“过期”状态或改变分享格式。

## 演示 `/demo`

页面仅操作本地示例存档，不读写真实账号。化极复用星阶/节点格式化，选择目标时显示业务标签，内部编码仍保持 1–31。

优先密探先使用示例现有库存，按其目标计算缺口；心纸不能在密探之间抵扣，使用该密探独立的 30 日速度样本。任一缺口没有速度记录时，完整耗时显示无法估算；材料已备齐无需等待。总账材料速度与估算仍属于演示，不是生产养成算法或完成承诺。

## 宣传 `/promo`

私人存档保存不等于公共投稿。主动开启 BOX 分享后，持有代码或链接的人可免登录读取分享字段；个人 API 访问仍需要相应授权。公共图鉴与确认公开的社区资料按实际接口范围提供。生态关系、卡片和数据流保留示意标识，不宣称外部项目已接入或所有公共资料已开放 API。

## 主动安装 `/install`

安装是自愿任务。首次邀请提供“跟着做一次”与“直接使用 / 暂时关闭”；未参加者阅读、关闭或换页不会完成教程。邀请不使用遮罩，沿用只读页白名单与模态/导航避让；iOS 没有原生事件时不自动邀请。桌面与移动导航中的“添加到桌面”始终可重新进入。

Prompt 邀请参加，Quick Guide 只显示当前动作，`/install` 承载可恢复任务与真实调用失败的排障。取消、不可用入口和等待都不是错误；只有 `failed` 显示故障排查。系统请求单飞，每个阶段都有文本退出按钮与 Esc，关闭后保持真实表单、数据、原生事件及在途请求，不撤销系统安装。换到其它业务页暂停；转入 `/install` 接续。关闭后七天内不自动反复邀请；明确选择“以后不自动提示”才持久化 `disableAutoGuide`。所有暂停/禁用均允许手动继续。

| 平台/结果 | 真实任务与完成规则 |
| --- | --- |
| Android 有 beforeinstallprompt | 自愿开始 → 点击“立即添加到桌面” → 真实 requestPwaInstall → accepted 仅进入 waiting-for-install → appinstalled 或 standalone 才完成 |
| Android dismissed | 保留教程，等待新的原生事件或按浏览器菜单重试；可立即退出 |
| Android failed | 显示实际调用失败与菜单/系统权限排障；网页不能读取或开启浏览器系统权限 |
| Android 无原生事件 | 已识别 Chrome/Firefox 显示对应菜单；未确认的浏览器不杜撰菜单，建议换到支持浏览器。单纯快捷方式不证明 PWA 安装 |
| iPhone / iPad | 自动识别实际环境 → Safari 分享/添加到主屏幕的当前动作 → 等待站外操作 → 从桌面打开后 detectStandalone 为真才完成 |

`tutorialCompleted` 只由主动参加且当前未暂停的任务获得真实证据后写入；`dismissedForNow` 仅表示暂停；`disableAutoGuide` 仅为明确关闭自动提示。退出后迟到的 appinstalled 仍更新真实 installed，但不重开 UI 或把暂停教程算完成；手动继续可直接复用这份真实成果。

刷新恢复教程参与与等待状态，`focus`、`pageshow`、`visibilitychange` 和 display-mode change 重查独立运行。安装事实不从历史 stepIndex、accepted、旧推广偏好或历史完成记录推断；appinstalled 在当前页面可信，刷新后无法确认设备上是否仍安装，保持未确认并等待 standalone。历史 completed 不等于设备当前仍安装。系统菜单操作、OEM 权限、是否只创建了快捷方式，以及跨浏览器/独立 Web App 的存储隔离都不可由网页可靠观测。若新环境没有参与记录，只呈现真实 standalone 成果，不编造教学完成历史。

appinstalled 后仍在浏览器，显示“系统已确认 YuanHub 安装完成”，不会声称独立运行。仅 standalone 显示“你现在正从桌面版 YuanHub 运行。”

菜单路径核对依据：[Chrome Android 安装](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=zh-Hans)、[Firefox Android 安装](https://support.mozilla.org/en-US/kb/use-web-apps-firefox-android)、[Apple Safari 添加到主屏幕](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)。系统菜单名称仍需按真实版本核对。

本次安装变更的最小回归命令（在 `YuanHub` 执行）：

```bash
node --test test/pwaInstall.test.js test/pwaInstallResponsive.test.js test/pwaInstallExperience.test.js
npm run test:behavior -- behavior/pwaInstallPrompt.spec.js behavior/installPage.spec.js
```

真机验收：Android 分别检查 accepted 等待、取消后重试、真实 appinstalled 和桌面启动、调用失败排障；iPhone/iPad 检查分享菜单操作后仍在浏览器不完成、从桌面重入自动识别。每个平台在加载、取消、等待、站外操作前关闭，刷新后不重开邀请，再从“添加到桌面”继续并复用成果；不提交测试账号数据。检查 Tab/Esc、触屏退出、安全区域与横屏；视口覆盖 320/390/430/768/1024/1440px。回归/build/真机由用户执行，本次 Agent 仅定向源码编译与静态审查。

## 最小验收

在本 worktree 根目录执行以下受影响测试；本轮未代跑回归测试或完整构建。

```bash
node --test test/operatorShare.test.js test/demoScenario.test.js test/todayPage.test.js test/recruitmentAccess.test.js test/routeAccess.test.js test/betaAccess.test.js test/pwaInstallExperience.test.js
npm run test:behavior -- behavior/authStartupGuard.spec.js behavior/forbiddenPage.spec.js behavior/operatorSharePage.spec.js behavior/demoPage.spec.js behavior/installPage.spec.js behavior/pwaInstallPrompt.spec.js
```

手动验收使用授权的有效 BOX：查看、返回纠错、复制链接，以及撤销/重新生成后的旧码访问。撤销和重新生成会写账号数据，需要使用授权测试账号；本轮没有执行。手机验收覆盖支持/不支持原生安装、取消、独立启动和权限设置后返回；至少检查 390px、768px、1440px 下本次修改区域，另检查安装标签的键盘焦点。开发服务仍由工作区根目录 `./dev.sh` 管理，不重复启动或擅自重启现有服务。
