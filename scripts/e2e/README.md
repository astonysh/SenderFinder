# 浏览器端到端测试（合成数据，不花钱）

把插件加载进无头 Chromium，用一张假的 Gmail 页面（`fake-gmail.html`，拦截 `mail.google.com`）在**没有配置任何 key** 的状态下跑一遍：
邮件页面只插入发件人旁的放大镜标记、侧边栏显示最新一封的发件人（个人邮箱→跳过）和线程里的其他人、点标记切换侧边栏的人、签名命中免费返回、无 key 时的提示、缓存复用、没有邮件时的空状态、设置页四个标签。
此外检查：侧边栏里的首字母头像和「加好友」按钮、未授权时打开的 linkedin.com 授权页（含备注预览）、LinkedIn 页面助手在一张假的 LinkedIn 主页（`fake-linkedin.html`，拦截 `www.linkedin.com`）上完成「建立联系 → 添加备注 → 填好备注」且**不点发送**、设置页的邀请备注模板预览。
三家供应商的域名被拦截，一旦有请求发出测试直接失败。

```bash
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright npm run e2e
```

截图输出到 `output/playwright/`。
