# Chrome 商店上架文案（简体中文）

名称和一句话简介由 `extension/_locales/zh_CN/messages.json` 的 `ext_name`、`ext_description` 自动带入；下面的详细描述在开发者后台切到"中文（简体）"后粘贴。

## 名称
SenderFinder

## 一句话简介（manifest，65 字）
在 Gmail / Outlook 网页版里显示发件人的 LinkedIn 资料。开源，自带供应商 key，数据只在你的浏览器里。

## 详细描述

不离开收件箱，找到发件人的 LinkedIn。

在 Gmail（或 Outlook 网页版）打开一封邮件，侧边栏就显示写信的人是谁：头像、姓名、职位、公司、地点、对方当地时间、LinkedIn 资料链接，有的话还有 X / Twitter。线程里的其他人列在下面，点一下就查。邮件页面本身只在发件人名字旁边多一个很小的放大镜。

SenderFinder 是 Rapportive / Clearbit Connect 这一思路的开源继承者，给整天泡在邮箱里的人用：销售、商务拓展、招聘、合作伙伴关系、创始人。

工作原理
• 先免费：在本机扫描邮件签名里的 linkedin.com/in 链接，命中即结束，$0。
• 然后按"最便宜的先试"的顺序调用数据供应商，命中即停。每次调用前都会用目录价核对你的单次上限和每日预算。
• 结果缓存在浏览器里，同一个地址不会花两次钱。
• 只有当前打开这封邮件的发件人会自动查（每天有次数上限，可改）；线程里其他人等你点。个人邮箱（gmail.com、qq.com 等）和职能邮箱（info@、support@ 等）默认跳过。

自带 key
没有 SenderFinder 账号，也没有 SenderFinder 服务器。你把自己在数据供应商那里的 key 填进设置页，查询直接从你的浏览器发给供应商。填一个就能用：
• treg：最便宜，只靠邮箱反查（BlitzAPI、QuickEnrich、Village），命中一次最低 $0.0005。
• Monid：覆盖最全，Hunter 按邮箱查，Apollo 按邮箱 + 姓名 + 公司域名查（约 $0.03）。
• Firecrawl：可选的最后兜底（Data Legion）。
两家都填就是完整瀑布流。在 50 个真实工作邮箱的基准测试中：96% 找到且姓名匹配，平均每个地址约 $0.011。

LinkedIn 加好友
"加好友"按钮会打开对方的 LinkedIn 主页，并按你的模板填好邀请备注（名字、公司）。"建立联系"、"添加备注"、"发送"都由你自己点，插件不会替你发送任何东西。这需要 linkedin.com 的访问权限，第一次使用时才申请，随时可撤销。

数据留在你手里
• key 只保存在本机扩展存储里，只发给它所属的供应商。
• 发给供应商的只有邮箱、显示名和公司域名，邮件正文从不发出。
• 只保留职业字段（姓名、职位、公司、地点、LinkedIn 链接），供应商返回的电话和个人邮箱会被丢弃。
• 历史、缓存和账本都在浏览器的 IndexedDB 里，可在"数据"页导出 JSON / CSV 或一键清空。
• 匿名的每日使用计数（跑了多少次查询、结果如何，从不包含地址、姓名或资料）每天发送一次，帮助项目了解使用情况；一个开关即可关闭，并可预览将要发送的内容。

欧盟 / 英国团队
你是查询行为的数据控制者；隐私政策说明了合法性基础、数据最小化、保留期（默认 90 天）以及如何响应被查询者的请求。https://senderfinder.com/privacy

开源
AGPL-3.0，本页的每一句话都能在代码里验证：https://github.com/astonysh/SenderFinder
支持 Gmail；Outlook 网页版（outlook.live.com、outlook.office.com）尽力支持。界面语言：英文、简体中文、繁体中文、日语、韩语、德语、法语、西班牙语、葡萄牙语（巴西）、意大利语。

SenderFinder 与 LinkedIn、Google、Microsoft 或任何数据供应商无关联。
