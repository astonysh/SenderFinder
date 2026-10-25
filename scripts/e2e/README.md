# 浏览器端到端测试（合成数据）

把插件加载进无头 Chromium，用一张假的 Gmail 页面（`fake-gmail.html`，拦截 `mail.google.com`）和一个没有配置任何供应商 key 的服务端跑一遍：卡片注入、签名命中、个人邮箱跳过与"仍然查询"、设置弹窗测试连接、网页版五个页面截图。不发生任何付费调用。

```bash
# 1. 起一个测试服务端（独立端口、独立数据库、固定令牌）
PORT=3391 APP_TOKEN=smoke-token-0123456789abcdef DB_PATH=./data/e2e.db npm start &
# 2. 跑测试（需要本机有 playwright 包；没有的话 npm i -D playwright 或用 PLAYWRIGHT_MODULE 指向一个已安装的路径）
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/e2e/run.js
```

截图输出到 `output/playwright/`。
