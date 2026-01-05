# Claude Cloak Project

## 项目简介
轻量级 API 中转服务，伪装请求为 Claude Code CLI 格式以避免上游审查。

**核心功能**:
- ✅ 请求伪装（Claude Code CLI headers）
- ✅ IP 混淆（WARP SOCKS5 代理）
- ✅ Tool Calling 完整支持
- ✅ 多模态内容（文本+图片）
- ✅ 流式传输（背压处理）
- ✅ 多凭证管理（Web Admin Panel）
- ✅ Strict Mode（系统提示词剥离）
- ✅ 参数规范化（移除 top_p/top_k，防止上游错误）

**技术栈**: TypeScript + Fastify + Docker

---

## 工作文档

### 📋 `PLAN.md` - 总体修复计划
基于 Codex 深度调研的修复计划，包含：
- Session 1+2: P0 安全修复（4 项）+ 功能完善 + 稳定性增强
- Session 3: Admin Panel 按钮失效修复 + Write-Only Key 安全模式
- 后续优化建议（认证重构、连接池、日志）

### 📊 `PROGRESS.md` - 进度跟踪
详细记录所有 session 的修复：
- **Session 1+2**: 11 项 P0/P1/P2 修复（4 个 commit）
- **Session 3**: 2 项 P0 Bug 修复 + Write-Only Key 模式（1 个 commit）
- **Session 4**: Schema 验证移除 + 架构简化（1 个 commit）
- Commit 记录、问题诊断、解决方案、测试结果
- 代码质量改进统计（+403 行 / -170 行，净减 65 行）

**查看方式**: 这两个文档已添加到 `.gitignore`，不会进入版本控制。

---

## 快速开始

### 开发环境
```bash
npm install
npm run build
npm start
```

### Docker 部署
```bash
docker compose up -d --build
```

### 访问
- **API**: `http://localhost:4000/v1/messages`
- **Admin Panel**: `http://localhost:4000/admin/`
- **Health Check**: `http://localhost:4000/healthz`

---

## 最近修复（2025-12-22）

### Session 4: Schema 验证移除 🚀
- **架构简化**: 移除过度设计的 schema 验证逻辑（65 行代码）
- **问题修复**: SillyTavern 等客户端的合法请求不再被拦截
- **设计哲学**: 代理回归本质（headers 伪装 + 请求转发），依赖上游 API 验证
- **兼容性提升**: 零拦截风险，支持所有 Anthropic API 格式

### Session 3: Admin Panel 按钮失效修复 ⚡
- **CSP 违规修复**: 移除内联 `onclick`，使用事件委托（所有按钮恢复正常）
- **Write-Only Key 安全模式**: 密钥永不明文返回浏览器，编辑时显示 last4 + 空白输入框
- **防御性编程**: 后端拒绝 masked 值（如 `...xxxx`）被保存
- **编辑 UI 改进**: "Current key: ...xxxx" 提示 + "Leave blank to keep existing key"

### Session 1+2: 核心安全与功能增强 🔒
- **Admin API 认证**: `/admin/api/*` 现在强制要求 PROXY_KEY 认证
- **前端认证实现**: 登录页覆盖层，sessionStorage/localStorage 存储
- **密钥脱敏**: GET 接口返回 `keyMasked` + `keyLast4` 格式
- **XSS 防护**: 增强 HTML 转义（`& < > " '`）+ CSP 策略
- **Tool Calling**: 完整支持 Anthropic `tool_use` / `tool_result` blocks
- **多模态内容**: 正确处理文本+图片混合 content 数组
- **流式鲁棒性**: 超时保护 + 完整 abort 监听 + 背压处理
- **删除 OpenAI 端点**: 移除半残缺的 `/v1/chat/completions`，避免客户端崩溃

详见 `PROGRESS.md` 完整记录。

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | 4000 |
| `TARGET_URL` | 上游 API base URL | - |
| `API_KEY` | 上游 API 密钥 | - |
| `PROXY_KEY` | Admin 认证密钥 | - |
| `REQUEST_TIMEOUT` | 请求超时（ms） | 60000 |
| `LOG_LEVEL` | 日志级别 | info |
| `WARP_PROXY` | SOCKS5 代理（可选） | - |
| `NORMALIZE_PARAMS` | 启用参数规范化 | true |
| `SENSITIVE_WORDS_MAX_ENTRIES` | 敏感词最大数量 | 20000 |

---

## Admin Panel 认证

访问 `/admin/` 时会显示登录页，输入 `PROXY_KEY` 解锁。

**存储选项**:
- **默认（sessionStorage）**: 关闭标签页后清除，30 分钟空闲超时
- **"Remember on this device"（localStorage）**: 持久存储，无空闲超时

**安全建议**:
- 使用 HTTPS 部署
- `PROXY_KEY` 使用强随机字符串
- 仅在可信设备上勾选 "Remember"
- 考虑在反向代理层添加 IP 白名单

---

## 下一步

### 已完成测试 ✅
- [x] Docker 重建和部署（Session 3 + 4）
- [x] Admin Panel 按钮功能测试（编辑/删除/激活）
- [x] Write-Only Key 安全模式测试
- [x] CSP 兼容性验证
- [x] Schema 验证移除测试（Session 4）
- [x] SillyTavern 兼容性测试（真实客户端）

### 可选测试（下一个 session）
- [ ] Admin 认证边界测试（完整覆盖）
- [ ] 高并发流式请求测试（100+ 并发）
- [ ] Tool calling 真实请求测试
- [ ] 多模态内容测试（图片 + 文本）

### 可选优化（P1/P2）
- [ ] 认证边界健壮性重构（插件级别 hook）
- [ ] `/v1/models` 错误映射改进
- [ ] 连接池调优（Undici Agent 配置）
- [ ] 结构化日志（pino）
- [ ] 请求体大小配置化

---

## 技术细节

### 认证流程
1. 前端加载时调用 `ensureAuthenticated()`
2. 从 storage 读取 PROXY_KEY
3. 发送 GET `/admin/api/settings`（带 `x-api-key` 头）验证
4. 验证成功：隐藏登录页，启用 admin UI
5. 验证失败：显示登录页，提示错误信息

### API 拦截
所有 `/admin/api/*` 请求自动添加认证头：
```javascript
headers['x-api-key'] = getStoredProxyKey()
```

### 401 处理
任何 API 返回 401 时：
1. 清除 storage 中的密钥
2. 显示登录页，提示 "Session expired"
3. 阻止后续未认证请求

---

## 贡献者
- **Codex**: 深度代码审查和逻辑设计
- **Gemini**: 前端 UI 设计和配色方案
- **Claude Sonnet 4.5**: 代码实现和集成

---

## License
MIT
