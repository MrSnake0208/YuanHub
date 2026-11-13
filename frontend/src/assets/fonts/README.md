# BOX 导出字体

- 字体：Adobe Source Han Sans CN，可变 TrueType WOFF2 简体中文子集，官方 2.005 系列。
- 来源：https://github.com/adobe-fonts/source-han-sans/tree/release/Variable/WOFF2/TTF/Subset
- 下载文件：SourceHanSansCN-VF.ttf.woff2（2026-10-31 获取，文件内容未修改）。
- 许可：SIL Open Font License 1.1，见 SourceHanSans-LICENSE.txt。
- Source Han Sans 仅由 OperatorBoxImageSheet.vue 引用，导出前等待加载；不替换站点全局字体。

## 衬线补充字体（Noto Serif SC 缺字）

- 用途：补充 Google 版 Noto Serif SC 缺失的字符，经 `--font-s` 逐字回退。
- 来源：[notofonts/noto-cjk 的简体中文衬线字体](https://github.com/notofonts/noto-cjk/tree/main/Serif/OTF/SimplifiedChinese)，源字体版本均为 2.003。
- `NotoSerifCJKsc-SemiBold-ext.woff2`：字重 600，源文件 `NotoSerifCJKsc-SemiBold.otf`，SHA-256：`d627b53dbcde61e07de1498d2623a8b287f78585ffbc90cc0618d0caaa2ed6b0`。
- `NotoSerifCJKsc-Bold-ext.woff2`：字重 700，源文件 `NotoSerifCJKsc-Bold.otf`，SHA-256：`8af07d4b6c2e82bcc72a30e066eaf295f11b9424f4aad2eaa9fe0e9c3b38fc73`。
- `NotoSerifCJKsc-Black-ext.woff2`：字重 900，源文件 `NotoSerifCJKsc-Black.otf`，SHA-256：`2c2af226af6170ac28730be03b16ee7ffa6144fe54471d9ebe8a03de97b58160`。
- 许可：SIL OFL 1.1。
- 包含字符：稺（U+7A3A，密探徐稺）、䵋（U+4D4B，密探士䵋）、鵩（U+9D69，成就鵩鸟承尘）。
- 生成命令：将 `<字重>` 分别替换为 `SemiBold`、`Bold`、`Black`，各运行一次。

  ```sh
  pyftsubset NotoSerifCJKsc-<字重>.otf --text='稺䵋鵩' --flavor=woff2 --layout-features='vert,vrt2' --name-IDs='*' --output-file=NotoSerifCJKsc-<字重>-ext.woff2
  ```

- 补字流程：
  1. 确认缺字不在 fonts.loli.net 返回的 Noto Serif SC CSS 的 `unicode-range` 里。
  2. 在三个字重的 `--text` 中都追加该字并重新生成。
  3. 同步更新三条 `@font-face` 的 `unicode-range` 和本 README。
