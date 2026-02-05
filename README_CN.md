<h1 align="center">
  <img src="assets/logo.svg" width="28" height="28" alt="logo" style="vertical-align: middle;"/>
  Claude Cloak
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/隐身代理-0d9488?style=for-the-badge" alt="Stealth Proxy"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</p>

<p align="center">
  <em>轻量级反向代理，将 API 请求伪装为 Claude Code CLI 格式</em>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

---

## 功能特性

- **请求伪装**：将所有请求转换为 Claude Code CLI 格式
- **原生 Anthropic 格式**：完整支持 Anthropic API，包括工具调用和多模态内容
- **双重认证**：支持 `Authorization: Bearer` 和 `x-api-key` 头部
- **系统提示注入**：自动注入 Claude Code 身份标识
- **隐身请求头**：模拟真实的 Claude CLI 请求头
- **SSE 流式传输**：完整支持流式响应，带背压处理
- **多凭证管理**：存储多个上游 API 凭证，运行时切换
- **严格模式**：剥离所有用户系统消息，仅保留 Claude Code 提示
- **敏感词混淆**：自动混淆可配置的敏感词
- **参数规范化**：剥离不支持的参数（top_p/top_k）防止上游错误
- **管理面板**：Web UI 管理凭证、测试连接和设置（需要认证）
- **Docker 就绪**：一键 Docker Compose 部署

## 快速开始

```bash
# 克隆并配置
cd claude-cloak
cp .env.example .env
vim .env  # 编辑配置

# 部署
docker compose up -d

# 验证
curl http://localhost:4000/healthz
```

## Docker 镜像

预构建镜像已发布到 GitHub Container Registry，支持一键部署。

[![在 Zeabur 上部署](https://zeabur.com/button.svg)](https://zeabur.com/templates/0KHVFA?referralCode=waylon256yhw)

### 使用 Docker Run

```bash
docker run -d \
  --name claude-cloak \
  -p 4000:4000 \
  -e TARGET_URL=https://api.anthropic.com \
  -e API_KEY=sk-ant-xxx \
  -e PROXY_KEY=your-secret \
  -v ./data:/app/data \
  ghcr.io/waylon256yhw/claude-cloak:latest
```

### 云平台部署

适用于 Zeabur、ClawCloud、Railway 等平台：

| 配置项 | 值 |
|--------|-----|
| 镜像 | `ghcr.io/waylon256yhw/claude-cloak:latest` |
| 端口 | `4000` |
| 持久化存储 | 挂载到 `/app/data` |

**必需环境变量：**
- `TARGET_URL` - 上游 API 基础 URL（如 `https://api.anthropic.com`）
- `API_KEY` - 上游 API 凭证
- `PROXY_KEY` - 管理面板认证密钥

**可选环境变量：**
- `PORT` - 监听端口（默认：`4000`）
- `REQUEST_TIMEOUT` - 请求超时毫秒数（默认：`60000`）
- `LOG_LEVEL` - 日志级别：debug, info, warn, error（默认：`info`）
- `STRICT_MODE` - 剥离用户系统消息（默认：`true`）
- `NORMALIZE_PARAMS` - 规范化 API 参数（默认：`true`）
- `SENSITIVE_WORDS_MAX_ENTRIES` - 敏感词最大数量（默认：`20000`）

## 支持的客户端

任何支持 **Anthropic API 格式** 的客户端都可以使用此代理：

<table>
  <tr>
    <td align="center" width="200">
      <a href="https://github.com/SillyTavern/SillyTavern">
        <img src="https://github.com/SillyTavern/SillyTavern/raw/release/public/img/ai4.png" width="64" height="64" alt="SillyTavern"/><br/>
        <b>SillyTavern</b>
      </a><br/>
      <sub>Anthropic 格式</sub>
    </td>
    <td align="center" width="200">
      <a href="https://github.com/anthropics/anthropic-sdk-typescript">
        <img src="https://avatars.githubusercontent.com/u/77675888?s=200&v=4" width="64" height="64" alt="Anthropic SDK"/><br/>
        <b>Anthropic SDK</b>
      </a><br/>
      <sub>官方客户端</sub>
    </td>
    <td align="center" width="200">
      <a href="https://github.com/anthropics/claude-code">
        <img src="https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/assets/hero.png" width="64" height="64" alt="Claude Code CLI"/><br/>
        <b>Claude Code CLI</b>
      </a><br/>
      <sub>官方 CLI</sub>
    </td>
  </tr>
</table>

> **注意**：此代理仅支持 **Anthropic 原生格式**（`/v1/messages`），不支持 OpenAI 格式。

## 配置说明

```env
PORT=4000                              # 代理监听端口
TARGET_URL=https://api.example.com     # 上游 API 基础 URL（不含 /v1/...）
API_KEY=your-upstream-api-key          # 上游 API 密钥
PROXY_KEY=your-custom-key              # 客户端认证密钥
REQUEST_TIMEOUT=60000                  # 请求超时（毫秒）
LOG_LEVEL=info                         # 日志级别：debug, info, warn, error
STRICT_MODE=true                       # 剥离所有用户系统消息（默认：true）
```

## ⚠️ 重要限制

**避免在请求中使用 `system` 角色消息！**

Claude Cloak 会自动注入 Claude Code 系统提示。额外的 `system` 消息可能触发上游检测。

**严格模式（默认启用）** 自动剥离所有用户系统消息，仅保留 Claude Code 身份。禁用方式：
- 在 `.env` 中设置 `STRICT_MODE=false`，或
- 在管理面板（`/admin/`）中切换

严格模式 **启用**（默认）：所有用户系统消息被剥离，最大程度隐身。

严格模式 **禁用**：保留用户系统消息，但前置 Claude Code 提示。

## API 使用

### 标准请求

```bash
curl -X POST https://your-domain/v1/messages \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 流式请求

```bash
curl -X POST https://your-domain/v1/messages \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 端点列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/healthz` | 健康检查 |
| GET | `/health` | 详细健康信息 |
| GET | `/v1/models` | 列出可用模型 |
| POST | `/v1/messages` | Anthropic 原生格式（支持工具调用） |
| GET | `/admin/` | 管理面板（Web UI，需要认证） |

## 管理面板

访问 `/admin/` 的 Web 管理面板：
- **管理凭证**：添加、编辑、删除和切换多个上游 API 凭证
- **测试连接**：一键验证上游 API 连通性（显示延迟）
- **切换严格模式**：运行时启用/禁用系统消息剥离
- **监控状态**：查看代理健康状态和版本

> **安全提示**：管理 API 端点需要使用 `PROXY_KEY` 认证。

## 认证方式

支持两种认证方式（按顺序检查）：

1. **x-api-key 头部**：`x-api-key: YOUR_PROXY_KEY`
2. **Bearer 令牌**：`Authorization: Bearer YOUR_PROXY_KEY`

## 工作原理

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   客户端     │────▶│ Claude Cloak │────▶│   上游      │
│  (任意 SDK)  │     │              │     │   Claude    │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   伪装处理   │
                    │  - 请求头    │
                    │  - 系统提示  │
                    │  - 用户 ID   │
                    └─────────────┘
```

**伪装包括：**
- `User-Agent: claude-cli/2.0.55 (external, cli)`
- `x-app: cli`
- `anthropic-beta: claude-code-20250219,...`
- Claude Code 系统提示注入
- 生成假但有效的 `user_id`

## 项目结构

```
claude-cloak/
├── src/
│   ├── server.ts           # 入口文件
│   ├── config.ts           # 环境配置
│   ├── types.ts            # TypeScript 类型
│   ├── routes/
│   │   ├── health.ts       # 健康检查端点
│   │   ├── models.ts       # 模型端点
│   │   ├── proxy.ts        # 主代理逻辑
│   │   └── admin.ts        # 管理 API 路由
│   ├── services/
│   │   ├── auth.ts         # 认证服务
│   │   ├── headers.ts      # 隐身请求头
│   │   ├── transform.ts    # 格式转换
│   │   ├── stream.ts       # SSE 处理
│   │   ├── user.ts         # 用户 ID 生成
│   │   └── obfuscate.ts    # 敏感词混淆
│   ├── credentials/
│   │   ├── manager.ts      # 凭证 CRUD 操作
│   │   ├── storage.ts      # JSON 文件持久化
│   │   └── types.ts        # 凭证类型
│   └── settings/
│       └── manager.ts      # 运行时设置（严格模式）
├── public/                 # 管理面板前端
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                   # 持久化存储（Docker 卷）
├── Dockerfile              # Bun 运行时（默认）
├── Dockerfile.node         # Node.js 回退
├── docker-compose.yml
└── .env.example
```

## 开发

```bash
# 安装依赖
bun install

# 开发模式（热重载）
bun --watch src/server.ts

# 构建
bun run build

# 生产运行
bun start

# 备选：使用 Node.js
npm install
npm run build
npm run start:node
```

## Docker 部署

### 默认（Bun 运行时 - 推荐）

```bash
docker compose up -d --build
```

### Node.js 回退

如果遇到 Bun 流式传输问题，可使用 Node.js 镜像：

```bash
docker build -f Dockerfile.node -t claude-cloak:node .
docker run -d --name claude-cloak -p 4000:4000 \
  -e PROXY_KEY=your-secret \
  -v ./data:/app/data \
  claude-cloak:node
```

### Docker 命令

```bash
docker compose up -d      # 启动
docker compose down       # 停止
docker compose logs -f    # 查看日志
docker compose restart    # 重启
docker compose up -d --build  # 重建并启动
```

## 技术栈

- **运行时**：Bun（支持 Node.js 回退）
- **框架**：Fastify 5
- **语言**：TypeScript
- **容器**：Docker + Alpine

## 许可证

MIT
