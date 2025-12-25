# Zeabur 用户更新指南 v1.2.0

## 🎉 新功能：参数规范化

v1.2.0 版本新增**参数规范化**功能，自动移除 `top_p` 和 `top_k` 参数，防止上游 API 返回 400 错误（如 "temperature and top_p cannot both be specified"）。

---

## 📦 更新方式

根据你的部署方式选择对应的更新方法：

### 方式一：通过 Docker 镜像部署（推荐）

如果你的服务使用 `ghcr.io/waylon256yhw/claude-cloak:latest` 镜像：

1. **进入 Zeabur 控制台**
   - 访问 https://zeabur.com/
   - 选择你的项目 → 选择 claude-cloak 服务

2. **触发重新部署**
   - 点击服务右上角的"重新部署"按钮
   - 或者点击 "Redeploy" 按钮（英文界面）
   - Zeabur 会自动拉取最新的 `latest` 镜像

3. **等待部署完成**
   - 部署通常需要 1-2 分钟
   - 查看日志确认服务正常启动

4. **验证更新**
   - 访问 `https://your-domain/admin/`
   - 在 Settings 区域应该能看到新增的 "Normalize Parameters" 开关
   - 默认为开启状态

---

### 方式二：通过 GitHub 仓库部署

如果你的服务连接到 GitHub 仓库：

1. **更新本地仓库**（如果你 fork 了项目）
   ```bash
   # 添加上游仓库
   git remote add upstream https://github.com/waylon256yhw/Claude-Cloak.git

   # 拉取最新代码
   git fetch upstream
   git merge upstream/main

   # 推送到你的仓库
   git push origin main
   ```

2. **Zeabur 控制台重新部署**
   - Zeabur 会自动检测到新的 commit
   - 或手动点击"重新部署"按钮

3. **验证更新**
   - 访问 Admin Panel 查看新功能

---

### 方式三：通过 Zeabur 模板部署（新用户）

新用户通过模板一键部署会自动使用 v1.2.0：

1. 访问 Zeabur 模板市场
2. 搜索 "Claude Cloak"
3. 点击部署
4. 配置环境变量后一键部署

**新增环境变量**：
- `NORMALIZE_PARAMS`: 启用参数规范化（默认：`true`）

---

## 🔧 环境变量说明

### 新增变量

| 变量名 | 说明 | 默认值 | 是否必填 |
|--------|------|--------|----------|
| `NORMALIZE_PARAMS` | 自动移除 top_p/top_k 参数 | `true` | 否 |

### 完整环境变量列表

| 变量名 | 说明 | 默认值 | 是否必填 |
|--------|------|--------|----------|
| `TARGET_URL` | 上游 API 地址 | - | 否* |
| `API_KEY` | 上游 API 密钥 | - | 否* |
| `PROXY_KEY` | Admin 面板认证密钥 | - | 是 |
| `PORT` | 监听端口 | 4000 | 否 |
| `LOG_LEVEL` | 日志级别 | info | 否 |
| `STRICT_MODE` | 严格模式（剥离系统提示词） | true | 否 |
| `NORMALIZE_PARAMS` | 参数规范化 | true | 否 |
| `WARP_PROXY` | SOCKS5 代理地址 | - | 否 |

\* 可以在 Admin Panel 中配置，无需设置环境变量

---

## ✨ 新功能使用方式

### Admin Panel 控制

1. 访问 `https://your-domain/admin/`
2. 使用 `PROXY_KEY` 登录
3. 在 **Settings** 区域可以看到：
   - **Strict Mode**: 剥离用户系统提示词
   - **Normalize Parameters**: 移除 top_p/top_k（新增）

4. 点击开关即可启用/禁用

### 环境变量控制

在 Zeabur 控制台设置环境变量：

```bash
# 启用参数规范化（默认）
NORMALIZE_PARAMS=true

# 禁用参数规范化
NORMALIZE_PARAMS=false
```

修改后需要重新部署服务。

---

## 🐛 常见问题

### Q1: 更新后功能不生效？

**解决方法**：
1. 检查镜像版本是否为 `latest` 或 `v1.2.0`
2. 清除浏览器缓存（Ctrl + Shift + R）
3. 查看 Zeabur 日志确认服务启动成功

### Q2: 参数规范化会影响现有请求吗？

**回答**：
- `top_p` 和 `top_k` 会被移除，但不影响其他参数
- `temperature` 等参数正常工作
- 如果你的客户端依赖这两个参数，可以通过 Admin Panel 关闭此功能

### Q3: 如何验证功能是否生效？

**验证方法**：
1. 发送带 `top_p` 和 `top_k` 的请求
2. 设置 `LOG_LEVEL=debug` 查看日志
3. 日志中应该看到 `"Normalized API parameters"` 记录

示例请求：
```bash
curl -X POST https://your-domain/v1/messages \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

如果功能开启，`top_p` 和 `top_k` 会被移除，只有 `temperature` 生效。

### Q4: 我不想自动移除这些参数怎么办？

**解决方法**：
1. 在 Zeabur 控制台添加环境变量 `NORMALIZE_PARAMS=false`
2. 重新部署服务
3. 或在 Admin Panel 中关闭 "Normalize Parameters" 开关

---

## 📝 版本历史

### v1.2.0 (2025-12-25)
- ✨ 新增参数规范化功能
- 🎛️ Admin Panel 添加控制开关
- 🐛 修复 logger 调用安全性问题
- 📚 更新 Zeabur 部署模板

### v1.1.1
- 🔒 移除 schema 验证
- 🎨 提升客户端兼容性

### v1.1.0
- 🔐 Admin API 认证
- 🔑 密钥脱敏
- 🛡️ XSS 防护增强

---

## 🔗 相关链接

- **GitHub 仓库**: https://github.com/waylon256yhw/Claude-Cloak
- **Docker 镜像**: ghcr.io/waylon256yhw/claude-cloak:v1.2.0
- **问题反馈**: https://github.com/waylon256yhw/Claude-Cloak/issues
- **Zeabur 官方文档**: https://zeabur.com/docs

---

## 💬 需要帮助？

如有问题，欢迎：
1. 提交 GitHub Issue
2. 查看项目文档 README.md
3. 加入社区讨论

**祝使用愉快！🎉**
