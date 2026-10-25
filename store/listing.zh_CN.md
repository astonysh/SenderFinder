# 浏览器商店文案（简体中文）

适用于 Microsoft Edge 扩展商店和 Chrome 应用商店。

名称和一句话简介由 `extension/_locales/zh_CN/messages.json` 的 `ext_name`、`ext_description` 通过 manifest 提供；详细描述在开发者后台按语言分别填写。

## 名称
SenderFinder

## 一句话简介（来自 manifest）
在 Gmail 或 Outlook 中找到发件人的 LinkedIn 资料。让联系不止于邮件。开源，使用你自己的供应商 key。

## 类别
工作与规划（备选：通讯）

## 语言
简体中文（默认）。插件界面支持 10 种语言；商店详情页的翻译需在开发者后台分别添加。

## 详细描述

在 LinkedIn 上找到发件人。让联系不止于邮件。

打开邮件，找到发件人的 LinkedIn 资料。与对方建立联系，让这份联系延续下去。

在 Gmail（或 Outlook 网页版）打开一封邮件，侧边栏会显示发件人的头像、姓名、职位、公司、地点、当地时间、LinkedIn 资料链接，以及有的话 X / Twitter。线程里的其他人列在下面，点一下即可查询。邮件页面本身只会在发件人名字旁边增加一个小放大镜。

SenderFinder 是开源插件，延续 Rapportive / Clearbit Connect 的思路，适合销售、商务拓展、招聘、合作伙伴关系和创业团队。

工作原理
• 先免费：邮件正文只在本机扫描 LinkedIn 个人资料链接；找到后查询立即结束，费用为 $0。
• 然后按你配置的顺序调用数据供应商，找到匹配资料即停。每次调用前会核对单次上限和每日预算。
• 结果缓存在浏览器里，同一个地址不会重复付费查询。
• 只会自动查询当前打开邮件的发件人（每日次数可设置）；线程里的其他人需你点击。个人邮箱和职能邮箱默认跳过，除非你主动查询。

自带 key
没有 SenderFinder 账号，查询链路上也没有 SenderFinder 服务器。你把自己在数据供应商那里的 key 填进设置页，查询直接从你的浏览器发给供应商。填一个就能用：
• treg：只用邮箱反查（BlitzAPI、QuickEnrich、Village），每次命中最低约 $0.0005。
• Monid：可按邮箱查询 Hunter，或按邮箱 + 姓名 + 公司域名查询 Apollo（约 $0.03）。
• Firecrawl：可选的 LinkedIn 网页搜索，使用发件人姓名和公司关键词；之后由 Data Legion 兜底。
一把供应商 key 即可开始，添加其他供应商可增加查询途径。供应商服务可能单独收费；你可在插件中设置单次和每日预算。完整基准测试：https://senderfinder.com/email-enrichment-api-benchmark

LinkedIn 加好友
使用 LinkedIn 功能时，插件会使用你自己的 LinkedIn 登录会话读取关系度、头像和所选资料关联的公司链接。点击「加好友」后，插件打开对方主页；在邀请对话框中，插件会替你点击一次「Add a note」并填入你可编辑的模板。你自己点击「建立联系」和「发送」；插件不会替你点击这两个按钮。LinkedIn 访问权限为可选，可在设置里撤销。

数据会发送到哪里
• 供应商 key 保存在本机，只会在你发起查询时发送给对应供应商。
• 查询时，被查询者的邮箱、显示名和公司域名会发送给你配置的供应商；部分供应商可能按其条款转发给已披露的下游服务。
• 邮件正文只在本机扫描 LinkedIn 资料链接，不会保存或传输。插件只保留职业资料；供应商返回的电话和个人邮箱会被丢弃。
• 查询历史、缓存和花费账本保存在浏览器 IndexedDB，可在「数据」页导出或清空。
• 匿名的每日使用计数（查询次数与结果、供应商步骤计数、邮件客户端、取整后的花费、插件版本、界面语言和一个随机安装 ID；永远不含邮箱、姓名、域名、LinkedIn 链接、资料字段、key 或邮件正文）每天发送一次到项目的 Cloudflare Worker，帮助项目了解使用情况。默认开启，设置里一键关闭，关闭即删除安装 ID 和待发送数据；可随时预览将要发送的内容。

欧盟 / 英国团队
查询对象与供应商由你决定。隐私政策说明了数据最小化、默认 90 天保留期，以及如何响应被查询者的请求：https://senderfinder.com/privacy

推广链接
Monid 和 Firecrawl 的注册链接是推广链接。符合条件的注册或付费可能为维护者带来佣金，支持 SenderFinder。

开源
AGPL-3.0；本页说明均可在代码中核对：https://github.com/astonysh/SenderFinder
支持 Gmail；Outlook 网页版（outlook.live.com、outlook.office.com）尽力支持。SenderFinder 与 LinkedIn、Google、Microsoft 或任何数据供应商无关联。

## 链接
- 主页：https://senderfinder.com
- 支持：https://github.com/astonysh/SenderFinder/issues
- 隐私政策：https://senderfinder.com/privacy
