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

有可用原生事件时提供一键入口；没有事件时提供手动步骤，不将“没有入口”解释成系统权限错误。取消、入口不可用、系统调用失败和意外异常分别提示恢复方法；已记录安装或独立运行时不再次提供安装按钮。系统菜单与权限名称需按真实平台版本确认。

Android / iOS 标签支持方向键、Home、End，并关联对应面板。当前说明以手机/平板为主，不据此宣称已验收某个最低浏览器版本。自动安装提示沿用现有路由白名单，BOX、演示、宣传、权限页及主动安装页均不邀请；无需增加 route meta。

## 最小验收

在本 worktree 根目录执行以下受影响测试；本轮未代跑回归测试或完整构建。

```bash
node --test test/operatorShare.test.js test/demoScenario.test.js test/todayPage.test.js test/recruitmentAccess.test.js test/routeAccess.test.js test/betaAccess.test.js test/pwaInstallExperience.test.js
npm run test:behavior -- behavior/authStartupGuard.spec.js behavior/forbiddenPage.spec.js behavior/operatorSharePage.spec.js behavior/demoPage.spec.js behavior/installPage.spec.js behavior/pwaInstallPrompt.spec.js
```

手动验收使用授权的有效 BOX：查看、返回纠错、复制链接，以及撤销/重新生成后的旧码访问。撤销和重新生成会写账号数据，需要使用授权测试账号；本轮没有执行。手机验收覆盖支持/不支持原生安装、取消、独立启动和权限设置后返回；至少检查 390px、768px、1440px 下本次修改区域，另检查安装标签的键盘焦点。开发服务仍由工作区根目录 `./dev.sh` 管理，不重复启动或擅自重启现有服务。
