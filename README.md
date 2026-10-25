# Email → LinkedIn

Rapportive 式的工具：给一个邮箱地址（可选加上显示名），找到这个人的 LinkedIn 资料。两种用法：

- **Chrome 插件**：在 Gmail / Outlook 网页版打开的邮件下方显示发件人的 LinkedIn 卡片（`extension/`）。
- **网页版**：单个查询、批量查询、历史、用量统计（`web/`，由服务端直接托管）。

两者都只和你自己的服务端（`server/`）通信。供应商 API key 只存在服务端 `.env` 里，插件和网页只拿到一个共享令牌。

## 查找顺序和成本

服务端按"最便宜的先试"的瀑布流查找，每一步都先读供应商目录价格，超过上限就不调；每天有总预算；命中后立刻停止并写入缓存，同一邮箱不会重复花钱。

| 顺序 | 步骤 | 走哪家 | 输入 | 命中价 | 未命中 | 目录观察命中率 |
|---|---|---|---|---:|---|---:|
| 1 | `signature` | 本地正则扫邮件签名里的 linkedin.com/in 链接 | 邮件正文 | $0 | — | — |
| 2 | `blitzapi` | treg `blitzapi.people.email.reverse` | 邮箱 | $0.0005 | 免费 | 21 % |
| 3 | `hunter` | MonID `hunterio /people/find` | 邮箱 | $0.0049 | 免费（404） | 46 % |
| 4 | `quickenrich` | treg `quickenrich.people.enrich` | 邮箱 | $0.0048 | 免费 | 11 % |
| 5 | `apollo` | MonID `apollo /people/match` | 邮箱 + 姓名 + 公司域名 | $0.026 | 免费，能挂到已知公司的空壳会计费 | — |
| 6 | `datalegion` | Firecrawl Alexandria `datalegion people/enrich-base-no-contact` | 邮箱 | 10 credits（≈ $0.008–0.032） | 免费 | — |

可选步骤（在 `.env` 的 `STEPS` 里加上即可）：`village`（treg，$0.02，专做邮箱反查）、`contactout`（MonID，$0.02）。价格为 2026-10-25 的目录价，服务端每次调用前会重新读取。

供应商返回的姓名和邮件显示名对不上时，结果只作为备选，后面的步骤继续跑，姓名匹配的答案优先；都对不上就标为"不确定"并显示两个名字（2026-10-25 实测 QuickEnrich 对同名不同人的邮箱返回过错误的人）。

个人邮箱域名（gmail.com、qq.com 等）和职能邮箱（info@、support@ 等）默认跳过付费查询，网页和插件上都有"仍然查询"按钮。

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

## 需要准备什么

1. **Node.js 22.13 以上**（本机是 25，内置 SQLite，不需要 `npm install`）。
2. **三个供应商的 key**，建议为本项目单独生成：
   - MonID：https://app.monid.ai → API keys → `MONID_API_KEY`
   - treg：https://treg.to → 账户 → token → `TREG_API_TOKEN`
   - Firecrawl（可选兜底）：https://www.firecrawl.dev/app → API keys → `FIRECRAWL_API_KEY`
3. 一个共享令牌 `APP_TOKEN`（`npm run token` 生成）。

## 启动

```bash
cd Email-Linkedin
cp .env.example .env        # 填 APP_TOKEN 和三个 key
npm run token               # 生成一个令牌，粘到 .env 的 APP_TOKEN
npm test                    # 16 个单元/接口测试，全部使用合成数据
npm run probe               # 免费：检查 key 是否有效、读当前目录价和命中率
npm start                   # http://127.0.0.1:3390
```

浏览器打开 `http://127.0.0.1:3390/`，在"设置"里填令牌即可使用网页版。

一次命令行查询（会在预算内花钱）：`npm run lookup -- jane@acme.com "Jane Doe"`。

## 安装 Chrome 插件

1. `chrome://extensions` → 打开"开发者模式" → "加载已解压的扩展程序" → 选 `extension/` 目录。
2. 点工具栏图标，填服务器地址（默认 `http://127.0.0.1:3390`）和 `APP_TOKEN`，点"测试连接"，再"保存"。
3. 打开 Gmail，点开任意一封邮件，发件人下方会自动出现 LinkedIn 卡片。默认打开邮件时自动查找（会产生费用，命中过的邮箱走缓存不再花钱）；在弹窗里取消"自动查找"即可改为手动点击"查 LinkedIn"。

Outlook 网页版（outlook.live.com / outlook.office.com）是尽力支持：它的页面结构经常变，如果卡片没出现，告诉我页面上发件人那块的结构即可调整。Outlook 桌面版、Apple Mail 等桌面客户端插件无法触达。

**尚未在真实 Gmail 页面上验证过**（本项目的测试全部用合成数据）。首次加载后请确认：卡片出现在发件人下方、名字和地址读对了、点击后能返回结果。

## 服务端接口

见 `docs/API.md`。核心是 `POST /api/lookup`，返回 `status`（found / not_found / uncertain / skipped）、`profile`、`match`（姓名是否匹配）、`cost`（每一步的费用和耗时）。

## 预算与安全

- `LOOKUP_MAX_USD`：单次查询上限（默认 $0.05）；`DAILY_CAP_USD`：每天上限（默认 $2，设 0 相当于关闭所有付费调用）。
- 每次付费调用前读供应商的当前价格，价格高于步骤上限就跳过；返回后按供应商报告的实际费用入账，报告缺失时按目录价保守入账。
- 调用从不自动重试：发出后丢失的回答记为"不确定"，不会重复扣费。
- 只有职业字段（姓名、职位、公司、地点、履历、LinkedIn 链接）会离开供应商适配层，不保存电话和个人邮箱。
- 服务端默认只监听 127.0.0.1；要给其他电脑用需要自己加反向代理和 HTTPS。

## 目录

```
server/            Node 服务：接口、SQLite、瀑布流、三家供应商客户端
  providers/       monid.js  treg.js  firecrawl.js  profile.js（统一字段）
extension/         Chrome MV3 插件（Gmail + Outlook 网页版内容脚本、后台、设置弹窗）
web/               网页版（纯静态，服务端在 / 托管）
scripts/           测试（node:test）、免费探测脚本、命令行查询、图标生成
docs/API.md        接口契约
```
