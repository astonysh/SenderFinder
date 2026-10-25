# SenderFinder

[English](README.md)

Rapportive / Clearbit Connect 式的开源浏览器插件，支持 Chrome 和 Microsoft Edge 桌面版：在 Gmail（Outlook 网页版尽力支持）打开一封邮件，浏览器右侧的侧边栏显示发件人的 LinkedIn 资料：头像、姓名、职位、公司、地点、对方当地时间、资料链接，有的话还有 X / Twitter 链接。线程里的其他人（其他发件人、收件人、抄送）列在下面，点一下才查。邮件页面本身只在发件人名字旁边多一个很小的放大镜标记，不改动 Gmail 的布局；点标记可以切换侧边栏显示的人。

侧边栏第一次需要点一下工具栏里的插件图标（或邮件里的放大镜标记）打开，之后在这个标签页里一直开着，换邮件会自动更新。

侧边栏里的「加好友」按钮会在新标签页打开对方的 LinkedIn 主页。你自己点击「建立联系」后，插件会在邀请对话框里点击一次「Add a note」并填入可编辑的备注模板；**插件不会替你点击「建立联系」或「发送」**。关系度、头像和所选资料关联的公司链接会在你授权后通过你自己的 LinkedIn 登录会话读取。LinkedIn 权限为可选，只在插件打开的标签页中使用，可在设置里撤销。注意：LinkedIn 限制备注 300 字符，免费账号每月只有少量带备注的邀请。

头像可能来自数据供应商；如果你启用 LinkedIn 功能，插件也会用你自己的 LinkedIn 会话读取关系度和头像。资料查询之外不做批量抓取。X 链接来自同一次供应商查询；头像链接可能过期，失效时显示姓名首字母。当地时间优先用供应商给的时区（Hunter），否则按资料里的地点推测（城市 / 州 / 国家表，`extension/core/geo.js`），推测结果标为近似。

你把自己的供应商 key 填进插件设置，查询从浏览器直接发给对应供应商，结果缓存在本机的 IndexedDB 里。查询地址和结果不会发送给 SenderFinder。唯一发给项目的是匿名的每日使用计数（默认开启，一键可关，见下文）。

## 查找顺序和成本

插件按"最便宜的先试"的瀑布流查找，每一步都先读供应商目录价格，超过上限就不调；有单次上限和每天总预算；命中后立刻停止并写入缓存，同一邮箱不会重复花钱。

| 顺序 | 步骤 | 走哪家 | 输入 | 命中价 | 未命中 | 目录观察命中率 |
|---|---|---|---|---:|---|---:|
| 1 | `signature` | 本地正则扫邮件签名里的 linkedin.com/in 链接 | 邮件正文 | $0 | — | — |
| 2 | `blitzapi` | treg `blitzapi.people.email.reverse` | 邮箱 | $0.0005 | 免费 | 21 % |
| 3 | `hunter` | Monid `hunterio /people/find` | 邮箱 | $0.0049 | 免费（404） | 46 % |
| 4 | `quickenrich` | treg `quickenrich.people.enrich` | 邮箱 | $0.0048 | 免费 | 11 % |
| 5 | `apollo` | Monid `apollo /people/match` | 邮箱 + 姓名 + 公司域名 | $0.026 | 免费，能挂到已知公司的空壳会计费 | — |
| 6 | `datalegion` | Firecrawl Alexandria `datalegion people/enrich-base-no-contact` | 邮箱 | 10 credits（≈ $0.008–0.032） | 免费 | — |

可选步骤（在设置页勾选即可）：`village`（treg，$0.02，专做邮箱反查）、`contactout`（Monid，$0.02）。价格为 2026-10-25 的目录价，插件每次调用前会重新读取。步骤的顺序和开关都在设置页里改。

## 只接一家供应商也能用

插件只认三把 key，每把 key 是一个聚合网关，背后挂着几个数据源。瀑布流会自动跳过没填 key 的步骤（记为 `not_configured`，不报错），所以**填任意一把就能把整个流程跑完**；设置页按供应商分组，每组下面列出这把 key 能解锁的步骤和价格。

| 只填这一家 | 能跑的步骤 | 典型单价 | 覆盖 | 适合 |
|---|---|---:|---|---|
| **treg** | `blitzapi` → `quickenrich`（可再开 `village`） | $0.0005–0.005 | 只靠邮箱，基准样本里约一半到六成 | 预算敏感、量大 |
| **Monid** | `hunter` → `apollo`（可再开 `contactout`） | $0.005–0.026 | Apollo 带姓名 + 公司域名兜底，基准样本里 19/19 命中 | 要命中率 |
| **Firecrawl** | 只有 `datalegion` | 10 credits | 没有命中率数据 | 不建议单独用，只做兜底 |

两家都填就是默认瀑布流：treg 的便宜步骤先试，Monid 的 Apollo 兜底。Apollo、Hunter、ContactOut 都是经 Monid 代理调用，BlitzAPI、QuickEnrich、Village 经 treg，插件不直连任何数据源，所以 Apollo 自己的 API key 填进来没用。

不需要 key 的部分：签名扫描（本地）、缓存、LinkedIn 关系 / 头像 / 加好友（用你自己的 LinkedIn 登录态，可选权限）。

供应商返回的姓名和邮件显示名对不上时，结果只作为备选，后面的步骤继续跑，姓名匹配的答案优先；都对不上就标为"不确定"并显示两个名字（2026-10-25 实测 QuickEnrich 对同名不同人的邮箱返回过错误的人）。

个人邮箱域名（gmail.com、qq.com 等）和职能邮箱（info@、support@ 等）默认跳过付费查询，侧边栏里有"仍然查询"按钮。

## 实测基准（2026-10-25，50 个真实工作邮箱）

样本来自 WizLeads 2026 邮箱基准公开表（Clay 的 LinkedIn 关注者，姓名 + SMTP 验证过的工作邮箱，661 个不同域名），按固定随机种子抽 50 条，带姓名查询：`npm run bench -- data/bench/wizleads-sample-50.csv`。

| 指标 | 结果 |
|---|---|
| 找到并姓名匹配 | 48 / 50（96 %） |
| 姓名不符（标为不确定） | 2 |
| 未找到 | 0 |
| 总花费 | $0.555，平均每条 $0.011 |
| 各步骤命中率 | BlitzAPI 50 %（$0.0005）、Hunter 18 %（$0.0049）、QuickEnrich 17 %（$0.0048）、Apollo 19/19（$0.026） |
| 回答来源 | BlitzAPI 24、Apollo 17、Hunter 5、QuickEnrich 4 |

结论：一半的地址由最便宜的 BlitzAPI 解决；Apollo 作为带姓名和公司域名的兜底几乎必中，但占了总花费的近九成。这个样本偏向英语市场的销售/增长岗位，和自己的客户群分布可能不同，建议再用真实收件箱的发件人补一轮。

<a name="install-from-source"></a>
## 安装（从源码加载）

Chrome 商店上架前，这样装：

1. 下载或克隆本仓库。
2. `chrome://extensions` → 打开"开发者模式" → "加载已解压的扩展程序" → 选 `extension/` 目录。
3. 首次安装会自动打开设置页。去拿 key，填一个就能用：
   - **Monid**：https://app.monid.ai → API keys。一个 key 覆盖 Hunter、Apollo、ContactOut。
   - **treg**：https://treg.to → 账户 → token。一个 token 覆盖 BlitzAPI、QuickEnrich、Village。
   - Firecrawl（可选兜底）：https://firecrawl.link/sf → API keys。
4. 点"测试 key（免费）"确认有效，然后打开 Gmail 点开任意一封邮件。

默认行为：打开邮件时**只自动查当前这封的发件人**，线程里其他人列出来等你点；每天自动查找有次数上限（默认 30），超过后全部改手动；单次上限 $0.05，每天上限 $2。都在设置页改。

Outlook 网页版（outlook.live.com / outlook.office.com）是尽力支持：它的页面结构经常变，如果放大镜标记没出现，开 issue 贴一下发件人那块的 DOM 即可。Outlook 桌面版、Apple Mail 等桌面客户端插件无法触达。

### Microsoft Edge 桌面版

Edge 与 Chrome 共用这份 Chromium MV3 扩展代码。开发者模式安装时，在 `edge://extensions` 打开「开发人员模式」→「加载解压缩的扩展」并选择 `extension/`；发布到 Microsoft Edge Add-ons 时运行 `npm run zip:edge`，上传生成的 `output/senderfinder-edge-<版本>.zip`。Edge 中的设置、API key 和缓存独立保存在 Edge 配置文件里，需要单独配置；数据页导出的 JSON 可用于迁移非 key 数据。

## 界面语言

插件界面跟随浏览器语言，英文为默认。目前内置 10 种：英文（`en`）、简体中文（`zh_CN`）、繁体中文（`zh_TW`）、日语（`ja`）、韩语（`ko`）、德语（`de`）、法语（`fr`）、西班牙语（`es`）、葡萄牙语（巴西，`pt_BR`）、意大利语（`it`），都在 `extension/_locales/`。浏览器语言不在列表里时显示英文。

新增或修改文案时每个 `messages.json` 都要改；`npm test` 里的 `scripts/locales.test.js` 会检查所有语言的 key、占位符（`$1`、`$$`）和商店描述长度是否一致。`npm run e2e` 跑的是英文；`npm run e2e:locales` 会把每种语言的侧边栏和设置页截图到 `output/playwright/locales/`，用来看长语言的换行。阿拉伯语等从右向左的语言需要先做 RTL 布局，暂未支持。

## 固定的插件 ID（更新不丢设置）

key、缓存、历史都存在 Chrome 给这个插件 ID 分配的存储里。未打包加载时，ID 由目录路径算出：换个目录加载，或者先"移除"再"加载已解压"，就是另一个 ID，设置自然是空的。为避免这种情况，`manifest.json` 里带了一个固定的 `key`（公钥），无论从哪个目录加载 ID 都一样；日常更新只需在 `chrome://extensions` 点"重新加载"，或者覆盖目录里的文件。

配套的私钥 `extension-key.pem` 不进 git，自己备份好，也绝不能放进商店或 release 压缩包。首次上传用 `npm run zip -- --store`；商店生成扩展 ID 后，从开发者后台复制公钥到 `manifest.json`，之后本地构建即可沿用商店 ID。

## 设置页

点插件图标 → "打开设置与历史"，四个标签：

- **设置**：key、步骤顺序和开关、单次 / 每日 / 自动查找上限、是否跳过个人邮箱。
- **历史**：查一个邮箱、搜索历史、重查、删除、导出 CSV。
- **统计**：今天 / 本月 / 累计，最近 30 天柱状图，按供应商的调用、命中率、花费。
- **数据**：导出 / 导入 JSON（换电脑用），清理过期缓存，清空全部。

缓存默认保留 90 天、最多 5000 条。导出文件不包含 key。

## 隐私

- 查询请求（邮箱地址、显示名、公司域名）直接发给你配置的供应商；部分供应商可能按其披露的条款转发给下游服务。目录价格也直接从对应供应商读取。
- 邮件正文只在本机扫描 `linkedin.com/in` 链接，不会保存或传输。
- 你启用 LinkedIn 功能并授权后，插件会用你自己的 LinkedIn 会话读取关系度和头像；邀请对话框里只替你点击一次「Add a note」并填入备注，不会点击「建立联系」或「发送」。
- 匿名使用统计默认开启，可在设置里一键关闭。开启时项目统计服务每天收到一份汇总（查询结果计数、供应商步骤、邮件客户端、花费、版本、语言和随机安装 ID），不含查询地址、姓名、域名、资料、key 或邮件内容。
- 供应商返回的字段里，只有职业信息（姓名、职位、公司、地点、履历、LinkedIn 链接）会被保留，电话和个人邮箱在适配层就丢掉。
- 调用从不自动重试：发出后丢失的回答记为"不确定"，不会重复扣费。

## 合规（GDPR / UK GDPR / Chrome 商店）

完整说明见 https://senderfinder.com/privacy ，这里是摘要：

- **你是查询行为的数据控制者。** 查谁、用哪家供应商、结果存多久都由你决定；查询地址和供应商结果不会发送给 SenderFinder。匿名使用统计（默认开启，可关闭）只含计数，不含任何个人数据。欧洲用户对工作邮箱发件人做一次性查询，通常的合法性基础是正当利益（GDPR 第 6(1)(f) 条），请在组织的隐私声明里提一句"使用联系人补全服务识别商务往来对象"（第 14 条的透明义务）。
- **最小化与保留。** 只发送邮箱、显示名和公司域名；只保留职业字段，电话和个人邮箱在适配层丢弃；结果默认缓存 90 天、最多 5000 条，可随时在"数据"页一键清空，"历史"页可逐条删除，用来响应当事人的请求。
- **跨境传输。** 查询直接从你的浏览器发到供应商，它们可能在欧洲以外。传输保障（SCC、DPF 等）属于你和供应商之间的协议，添加 key 前请看它们的条款和 DPA。
- **个人邮箱默认跳过。** 不要对私人身份做查询；gmail.com、qq.com 等个人域名默认不发出。
- **匿名使用统计的控制者**：Tony Li（tony@senderfinder.com）。统计默认开启；每日汇总只含计数和一个随机安装 ID，可在设置中预览和一键关闭，关闭会删除本机 ID 和待发送数据。
- **Chrome 商店用户数据政策。** 邮件正文仅在本机扫描 LinkedIn 链接，不用于广告。查询字段会发给你选定的供应商（以及其披露的下游服务）；匿名使用计数发给项目统计服务，可随时关闭（Limited Use）。

## 开发

Chrome 商店上架所需的截图、宣传图、文案和逐项填写指南都在 `store/`（见 `store/README.md`），`npm run store:assets` 重新生成图片，`npm run zip -- --store` 打上传包。Edge Add-ons 使用 `npm run zip:edge` 生成独立命名的上传包。

```bash
npm test                    # 18 个单元测试（瀑布流、存储、匹配），全部合成数据，Node 22.13+
npm run e2e                 # 无头 Chromium 加载插件跑一遍假 Gmail 页面，不配置 key、拦截供应商域名，截图到 output/playwright/
npm run probe               # 免费：用 .env 里的 key 检查有效性、读目录价
npm run lookup -- a@b.com   # 命令行查一个（会花钱，缓存在 data/cli-cache.json）
npm run bench -- data/bench/x.csv   # 跑基准（会花钱）
npm run migrate:sqlite      # 把 v0.1 服务端版本的 SQLite 转成插件可导入的 JSON
npm run zip                 # 打包 output/senderfinder-<version>.zip
npm run zip:edge            # 打包 Edge Add-ons: output/senderfinder-edge-<version>.zip
```

`npm run e2e` 需要本机有 playwright 包：`PLAYWRIGHT_MODULE=/path/to/node_modules/playwright npm run e2e`。

```
extension/
  core/            平台无关的逻辑：waterfall.js、store.js（IndexedDB / 内存）、identity.js、signature.js、providers/
  lib/settings.js  设置读写、从设置构建查询服务
  background.js    Service worker：唯一持有 key、运行瀑布流的地方
  content/         Gmail / Outlook 内容脚本和发件人旁边的放大镜标记（chip.js）
  sidepanel.*      侧边栏：当前这个人的资料、线程里的其他人、今日用量和开关
  _locales/        界面文案：en（默认）、zh_CN、zh_TW、ja、ko、de、fr、es、pt_BR、it
  lib/i18n.js      chrome.i18n 封装和 data-i18n 页面本地化
  options.*        设置 / 历史 / 统计 / 数据
site/              官网（纯静态，部署到 Cloudflare Pages，见 site/README.md）
scripts/           测试、e2e、探测、CLI、基准、迁移、打包
```

v0.1 的服务端 + 网页版保留在 git tag `v0.1-server`。

## 匿名使用统计（默认开启，可关闭）

插件设置页里有一个"发送匿名使用统计"的开关，安装后默认开启，介意的话一键关闭。开启时每天发送一份前一天的汇总计数（查询次数、各状态数量、各步骤调用与命中次数、来源、花费合计、插件版本、界面语言、一个随机安装 ID），永远不含邮箱、姓名、域名、LinkedIn 链接、资料字段、key 或邮件内容。设置页的"查看将发送的数据"按钮显示完整文档；关闭开关会删除安装 ID 和未发送的数据。接收端是 `telemetry/` 里的一个 Cloudflare Worker + D1 表，不记录 IP，部署步骤见 `telemetry/README.md`。

项目指标（stars、商店用户数、匿名统计、网站访问）用 `node scripts/metrics-report.js` 汇总并追加到 `docs/metrics/LOG.md`，配置项见脚本头部注释。

## 协议

代码以 **GNU AGPL-3.0** 发布（见 `LICENSE`）。你可以自由使用、修改和分发；分发修改版或基于它对外提供服务时，必须同样公开源码。需要在 AGPL 之外的条款下使用（例如闭源集成），请联系作者获取商业授权。

贡献代码前请阅读 `CONTRIBUTING.md`，首次提交 PR 需同意其中的贡献者许可协议（CLA）。
