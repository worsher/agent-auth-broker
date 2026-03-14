# Agent Auth Broker

[English](README.md)

AI Agent 集中式凭证管理与授权代理服务。Agent 不直接持有任何 API Key 或 OAuth Token，而是通过 Broker 发起调用，Broker 负责权限校验、凭证注入、执行代理和审计日志。

---

## 架构概览

```
Agent（Claude / OpenClaw 等）
  |
  |  broker_call(connector, action, params)
  v
MCP Server
  |
  |  验证 Agent Token
  v
Broker Core
  |  权限检查 -> 凭证解密 -> 执行
  v
第三方 API（GitHub 等）
  |
  |  Bearer Token 由 Broker 注入，Agent 不可见
  v
响应结果返回给 Agent
```

**核心优势：**

- Agent 永远不接触真实凭证，Token 泄露风险为零
- 操作级别细粒度权限控制（如只允许 `github:list_repos`，禁止 `github:create_issue`）
- 参数约束，限制操作范围（如只允许访问特定组织的仓库）
- 完整的防篡改审计日志（HMAC-SHA256 哈希链）

---

## 项目结构

```
agent-auth-broker/
├── apps/
│   ├── web/                    # Next.js 14 — Admin UI + Broker API（PostgreSQL）
│   │   └── prisma/schema.prisma
│   ├── mcp-server/             # MCP Server（stdio + Streamable HTTP 传输）
│   └── cli/                    # CLI 工具 — broker init/serve/validate/ui
├── packages/
│   ├── local-runtime/          # 纯本地运行时（YAML 驱动，无需数据库）
│   ├── core/                   # 核心业务逻辑（数据库模式）
│   ├── connectors/             # 第三方服务适配器（支持插件化动态加载）
│   ├── crypto/                 # AES-256-GCM 加密工具
│   └── shared-types/           # 共享类型定义
├── Dockerfile                  # 多阶段 Docker 构建
├── docker-compose.yml          # web + postgres 一键部署
├── .github/workflows/          # CI/CD（build + typecheck + test + npm publish）
├── package.json                # pnpm monorepo
└── turbo.json
```

---

## 核心特性

**安全**
- AES-256-GCM 双层加密（MEK 加密 DEK，DEK 加密凭证数据）
- ReDoS 防护（safe-regex2 验证正则模式安全性）
- 审计日志哈希链防篡改（HMAC-SHA256）
- 安全响应头（X-Content-Type-Options、X-Frame-Options、CSP 等）
- OAuth State 数据库持久化，防 CSRF 攻击
- Token SHA-256 哈希比对认证

**权限模型**
- 操作级别权限控制
- 参数正则约束（限制操作范围）
- 速率限制（滑动窗口算法）
- 策略过期时间
- Scope 组简化权限配置

**可观测性**
- pino 结构化日志（支持 `BROKER_LOG_LEVEL` 配置）
- 审计日志输出到 stdout 或文件
- `/api/health` 健康检查端点

**扩展性**
- Connector 插件化（支持 npm 包或本地路径动态加载）
- `ConnectorAdapter` 接口含可选的 `validateCredential` 方法
- 内置 GitHub Connector（10 个操作）

---

## 三种运行模式

| 模式 | 适用场景 | 外部依赖 | 配置方式 |
|------|---------|---------|---------|
| **File Mode** | 个人开发者、单 Agent | 无 | `broker.yaml` + 环境变量 |
| **Local Mode** | 小团队本地开发 | PostgreSQL | `.env` + 数据库 |
| **Remote Mode** | 生产环境、多用户 | PostgreSQL + Web Server | Web UI 管理 |

**模式优先级（MCP Server 启动时自动判断）：**

```
BROKER_URL 已设置      → Remote Mode（最高优先级）
DATABASE_URL 已设置    → Local Mode
BROKER_CONFIG 已设置   → File Mode
```

---

## 安装

### 方式一：npm 全局安装（推荐）

```bash
npm install -g agent-auth-broker
broker --version
```

### 方式二：npx 直接使用（无需安装）

```bash
npx agent-auth-broker init
npx agent-auth-broker serve
```

### 方式三：从源码构建

```bash
git clone https://github.com/your-org/agent-auth-broker.git
cd agent-auth-broker
pnpm install
pnpm build
node apps/cli/dist/index.js --version
```

---

## 快速开始：File Mode

最轻量的接入方式，只需一个 YAML 配置文件和环境变量，无需数据库和 Web Server。

### 第一步：初始化配置

```bash
broker init
# 或：npx agent-auth-broker init
```

生成的 `broker.yaml`：

```yaml
version: "1"

agents:
  - id: my-agent
    name: My AI Agent

credentials:
  - id: github-main
    connector: github
    token: ${GITHUB_TOKEN}        # 引用环境变量，凭证不落盘

policies:
  - agent: my-agent
    credential: github-main
    actions:
      - "*"                       # 允许所有操作

audit:
  enabled: true
  output: stdout
```

### 第二步：设置环境变量

```bash
export GITHUB_TOKEN="ghp_your_personal_access_token"
```

### 第三步：验证配置

```bash
broker validate    # 验证配置文件格式
broker diagnose    # 诊断凭证连接（实际调用 GitHub API 验证）
```

### 第四步：配置 MCP Server

在 `claude_desktop_config.json` 或 `.claude/settings.json` 中添加：

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "broker",
      "args": ["serve"],
      "env": {
        "BROKER_CONFIG": "/path/to/broker.yaml",
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

从源码运行时，将 `"command": "broker"` 替换为：

```json
"command": "node",
"args": ["/path/to/agent-auth-broker/apps/cli/dist/index.js", "serve"]
```

---

## broker.yaml 配置详解

### 凭证配置

**方式一：环境变量引用（推荐）**

凭证通过 `${ENV_VAR}` 语法引用，明文不写入配置文件：

```yaml
credentials:
  - id: github-main
    connector: github
    token: ${GITHUB_TOKEN}
```

**方式二：AES-256-GCM 加密存储**

凭证需要持久化时，配置 `encryption_key` 后使用加密存储：

```yaml
version: "1"
encryption_key: ${BROKER_MASTER_KEY}    # 主加密密钥（64 位十六进制）

credentials:
  - id: github-main
    connector: github
    encrypted: "base64-encrypted-string"
```

### 权限策略

```yaml
policies:
  - agent: my-agent
    credential: github-main

    # 方式一：允许所有操作
    actions:
      - "*"

    # 方式二：使用 Scope 组（自动展开）
    # actions:
    #   - "github:read"    # 展开为 7 个只读操作
    #   - "github:write"   # 展开为 3 个写操作

    # 方式三：精确指定操作
    # actions:
    #   - "github:list_repos"
    #   - "github:create_issue"

    # 可选：参数约束（正则匹配）
    # param_constraints:
    #   repo:
    #     pattern: "^myorg/.*"    # repo 参数必须以 myorg/ 开头

    # 可选：速率限制（滑动窗口算法）
    # rate_limit:
    #   max_calls: 100
    #   window_seconds: 3600

    # 可选：策略过期时间
    # expires_at: "2025-12-31T23:59:59Z"
```

### Scope 组

| Scope | 展开为 |
|-------|--------|
| `github:read` | `list_repos`, `get_repo`, `list_issues`, `get_issue`, `list_prs`, `get_file`, `search_code` |
| `github:write` | `create_issue`, `comment_issue`, `create_pr` |

### 审计日志配置

```yaml
audit:
  enabled: true
  output: stdout     # stdout：输出到 stderr（适合 MCP stdio 模式）
  # output: file
  # file: ./broker-audit.log
```

---

## CLI 命令参考

所有命令支持 `-c, --config <path>` 指定配置文件路径，默认从当前目录向上查找 `broker.yaml`。

```bash
# 初始化
broker init                                        # 生成 broker.yaml 模板
broker init --force                                # 覆盖已有配置

# 验证和诊断
broker validate                                    # 校验配置文件格式
broker diagnose                                    # 检查环境变量和凭证连接

# Agent 管理
broker agent create <id> [-n <name>]               # 创建 Agent
broker agent list                                  # 列出所有 Agent
broker agent remove <id>                           # 移除 Agent

# Token 管理
broker token generate <agent-id>                   # 生成 Agent Token（仅显示一次）
broker token generate <agent-id> --force           # 覆盖已有 Token
broker token revoke <agent-id>                     # 撤销 Token
broker token list                                  # 列出所有 Token 状态

# 凭证管理
broker credential add <connector> --env <VAR>      # 添加环境变量引用凭证
broker credential add <connector> --token <val>    # 直接指定 Token（不推荐）
broker credential list                             # 列出所有凭证
broker credential remove <id>                      # 移除凭证

# 策略管理
broker policy set <agent> <credential> [--actions "*"]    # 设置策略
broker policy list                                        # 列出所有策略
broker policy remove <agent> <credential>                 # 移除策略

# 测试操作
broker test <connector> <action>                   # 测试 Connector 操作
broker test github list_repos                      # 示例：列出 GitHub 仓库
broker test github list_issues -p '{"repo":"owner/repo"}'  # 带参数
broker test github create_issue --dry-run          # 仅权限检查，不实际调用

# 启动 MCP Server
broker serve                                       # stdio 模式（支持配置热重载）
broker serve --agent <id>                          # 指定 Agent ID

# Web UI（File Mode 可视化管理）
broker ui                                          # 启动 Web UI（默认端口 3200）
broker ui --port 8080                              # 自定义端口
```

### Token 认证流程

1. 生成 Token：`broker token generate my-agent`（Token 仅显示一次）
2. Token 的 SHA-256 哈希自动写入 `broker.yaml` 的 `token_hash` 字段
3. 在 MCP 配置中通过环境变量 `BROKER_AGENT_TOKEN` 传入 Token 明文
4. MCP Server 启动时通过哈希比对确认 Agent 身份

未设置 `BROKER_AGENT_TOKEN` 时，退回到 `--agent` 参数或默认使用第一个 Agent。

### 配置热重载

`broker serve` 运行时自动监视 `broker.yaml` 变更，修改配置无需重启 MCP Server：

- 使用 `fs.watch` 监视文件，300ms 防抖避免重复触发
- 重载失败时保留旧配置并输出错误日志
- 进程退出时自动清理 watcher

### File Mode Web UI

`broker ui` 启动轻量级 Web 界面（默认 `http://localhost:3200`），方便可视化管理 `broker.yaml`：

- 使用 Node.js 内置 `http` 模块，零外部依赖
- 支持 Agent、Credential、Policy 的增删操作
- YAML 预览（Token 自动脱敏）
- 所有变更实时写入 `broker.yaml` 文件

---

## MCP Server 配置

### Streamable HTTP 传输（可选）

默认传输方式为 stdio。如需通过 HTTP 暴露 MCP Server（例如多 Agent 共享一个 MCP Server），可启用 HTTP 传输：

```bash
MCP_TRANSPORT=http MCP_PORT=3200 MCP_AUTH_TOKEN=your-secret broker serve
```

客户端请求时携带 Bearer Token：

```
Authorization: Bearer your-secret
```

### 三种模式的 MCP 配置

**File Mode**

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "broker",
      "args": ["serve"],
      "env": {
        "BROKER_CONFIG": "/path/to/broker.yaml",
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

**Local Mode（直连 PostgreSQL）**

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/apps/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/agent_auth_broker",
        "BROKER_MASTER_KEY": "your-64-char-hex-string",
        "BROKER_AGENT_TOKEN": "agnt_xxxxxxxxxxxx"
      }
    }
  }
}
```

**Remote Mode（HTTP 调用 Web Server）**

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/apps/mcp-server/dist/index.js"],
      "env": {
        "BROKER_URL": "https://your-broker-server.com",
        "BROKER_AGENT_TOKEN": "agnt_xxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Docker 部署

使用 docker-compose 一键启动 Web Server + PostgreSQL：

```bash
# 复制并修改环境变量
cp apps/web/.env.example apps/web/.env

# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f web
```

`docker-compose.yml` 包含：

- `web` 服务：Next.js 14 Admin UI + Broker API，端口 3100
- `postgres` 服务：PostgreSQL 14，数据持久化到 volume

多阶段 Docker 构建，最终镜像只包含生产所需文件。

---

## Web UI（Local / Remote Mode）

### 环境要求

- Node.js >= 20
- pnpm >= 9.15
- PostgreSQL >= 14

### 配置

```bash
cp apps/web/.env.example apps/web/.env
```

`apps/web/.env` 必填项：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/agent_auth_broker"
BROKER_MASTER_KEY="your-64-char-hex-string"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3100"
GITHUB_CLIENT_ID="your-github-oauth-app-client-id"
GITHUB_CLIENT_SECRET="your-github-oauth-app-client-secret"
```

### 初始化数据库并启动

```bash
pnpm db:generate    # 生成 Prisma Client
pnpm db:push        # 推送 Schema（开发环境）
# pnpm db:migrate   # 创建迁移文件（生产环境）

pnpm build
pnpm dev:web        # 访问 http://localhost:3100
```

### 使用流程

1. **注册 Agent**：Admin UI -> Agents -> 创建 Agent -> 复制 Token（`agnt_xxxx`，仅显示一次）
2. **连接凭证**：Admin UI -> Credentials -> 通过 OAuth 连接 -> 凭证自动加密存储
3. **配置策略**：Admin UI -> Agent Policies -> 选择凭证、操作列表、参数约束
4. **配置 MCP Server**：将 Token 填入 MCP 配置的 `BROKER_AGENT_TOKEN` 环境变量

---

## MCP 工具说明

MCP Server 启动后自动暴露以下工具：

### 固定工具

| 工具 | 说明 |
|------|------|
| `broker_call` | 通用调用入口，指定 connector + action + params |
| `broker_list_tools` | 列出当前 Agent 被授权的所有工具 |

### 动态命名工具

根据 Agent 的权限策略自动生成，格式为 `{connector}_{action}`：

| 工具 | 等价调用 |
|------|---------|
| `github_list_repos` | `broker_call({ connector: "github", action: "list_repos" })` |
| `github_create_issue` | `broker_call({ connector: "github", action: "create_issue", ... })` |
| `github_search_code` | `broker_call({ connector: "github", action: "search_code", ... })` |

Agent 只能看到自身被授权的工具，未授权的工具不会出现在工具列表中。

---

## GitHub Connector 操作列表

| action | 说明 | 必填参数 |
|--------|------|---------|
| `list_repos` | 列出已授权用户的仓库 | — |
| `get_repo` | 获取仓库信息 | `repo`（格式：`owner/repo`）|
| `list_issues` | 列出仓库的 Issue | `repo` |
| `get_issue` | 获取单个 Issue 详情 | `repo`, `issue_number` |
| `create_issue` | 创建 Issue | `repo`, `title` |
| `comment_issue` | 在 Issue 上添加评论 | `repo`, `issue_number`, `body` |
| `list_prs` | 列出 Pull Request | `repo` |
| `create_pr` | 创建 Pull Request | `repo`, `title`, `head`, `base` |
| `get_file` | 获取文件内容（自动 Base64 解码）| `repo`, `path` |
| `search_code` | 搜索代码 | `q` |

---

## 权限模型

### 权限检查流程

```
请求到达
  |
  +--> Agent 是否激活？              -> DENIED_AGENT_INACTIVE
  |
  +--> 是否有匹配的策略？             -> DENIED_NO_POLICY
  |
  +--> 操作是否在允许列表？           -> DENIED_ACTION_NOT_ALLOWED
  |
  +--> 参数是否满足约束？             -> DENIED_PARAM_CONSTRAINT
  |
  +--> 凭证是否过期？                -> DENIED_CREDENTIAL_EXPIRED
  |
  +--> 是否超出速率限制？             -> DENIED_RATE_LIMIT
  |
  v
执行操作
```

### 拒绝原因码

| 错误码 | 含义 |
|--------|------|
| `DENIED_AGENT_INACTIVE` | Agent 已被停用 |
| `DENIED_NO_POLICY` | 该 Agent 无匹配策略 |
| `DENIED_ACTION_NOT_ALLOWED` | 操作不在允许列表中 |
| `DENIED_PARAM_CONSTRAINT` | 参数不满足约束条件 |
| `DENIED_CREDENTIAL_EXPIRED` | 凭证已过期或被撤销 |
| `DENIED_RATE_LIMIT` | 超出速率限制 |

### 参数约束示例

```yaml
param_constraints:
  repo:
    pattern: "^myorg/.*"    # repo 参数必须以 myorg/ 开头
```

正则模式在加载时经过 safe-regex2 验证，防止 ReDoS 攻击。

---

## 加密方案

凭证数据采用 AES-256-GCM **双层加密**：

```
BROKER_MASTER_KEY（环境变量，不落盘）
  |
  +--> 加密生成 DEK（Data Encryption Key，每条凭证独立）
         |
         +--> 加密凭证 JSON（含 access_token 等敏感字段）
                |
                +--> 加密结果存入数据库
```

- MEK（Master Encryption Key）仅存在于环境变量，不落盘
- DEK 加密后存入数据库的 `encryptionKeyId` 字段
- 凭证明文从不进入日志或 HTTP 响应体
- File Mode 的 AES 加密存储同样使用 `BROKER_MASTER_KEY`

---

## 审计日志

所有操作（包括被拒绝的请求）均记录审计日志。

**日志字段：**

- Agent ID、Connector、Action
- 权限检查结果（`permissionResult`）
- 脱敏后的请求摘要（敏感字段替换为 `[REDACTED]`）
- HTTP 状态码、错误信息
- IP 地址、User-Agent
- 时间戳、哈希链值

**防篡改机制：**

审计日志采用 HMAC-SHA256 哈希链，每条记录包含前一条记录的哈希值，形成不可篡改的链式结构。应用层只允许 INSERT，不允许 UPDATE 或 DELETE 审计记录。

**输出配置：**

```yaml
audit:
  enabled: true
  output: stdout     # MCP stdio 模式下输出到 stderr
  # output: file
  # file: ./broker-audit.log
```

---

## 扩展 Connector

### 内置方式

在 `packages/connectors/src/` 下新建目录，实现 `ConnectorAdapter` 接口，并在 `registry.ts` 中注册：

```typescript
// packages/connectors/src/feishu/index.ts
export const feishuConnector: ConnectorAdapter = {
  info: { id: 'feishu', name: '飞书', version: '1.0.0' },
  getActions() {
    return [
      { id: 'send_message', name: '发送消息', params: [...] },
    ]
  },
  async execute(action, params, credential) {
    // 实现调用逻辑
  },
  async validateCredential(credential) {
    // 可选：验证凭证有效性
  },
}

// packages/connectors/src/registry.ts
import { feishuConnector } from './feishu/index'

const connectors = new Map([
  ['github', githubConnector],
  ['feishu', feishuConnector],    // 注册新 Connector
])
```

### 插件化动态加载

支持从 npm 包或本地路径动态加载 Connector，无需修改核心代码：

```typescript
import { loadConnectorPlugin } from '@agent-auth-broker/connectors'

// 从 npm 包加载
await loadConnectorPlugin('my-broker-connector-feishu')

// 从本地路径加载
await loadConnectorPlugin('./plugins/my-connector')
```

插件需导出符合 `ConnectorAdapter` 接口的对象作为默认导出。

---

## 环境变量参考

| 变量 | 用途 | 适用模式 |
|------|------|---------|
| `BROKER_CONFIG` | broker.yaml 文件路径 | File Mode |
| `DATABASE_URL` | PostgreSQL 连接串 | Local / Remote |
| `BROKER_MASTER_KEY` | 主加密密钥（64 位十六进制字符串） | Local / Remote / File（加密存储） |
| `BROKER_AGENT_TOKEN` | Agent 认证 Token | 所有模式 |
| `BROKER_AGENT_ID` | 指定 Agent ID（无 Token 时使用） | File Mode |
| `BROKER_URL` | Web Server URL | Remote Mode |
| `MCP_TRANSPORT` | 传输方式：`stdio`（默认）或 `http` | MCP Server |
| `MCP_PORT` | HTTP 传输端口（默认 3200） | MCP Server HTTP 模式 |
| `MCP_AUTH_TOKEN` | HTTP Bearer Token | MCP Server HTTP 模式 |
| `BROKER_LOG_LEVEL` | 日志级别（默认 `info`） | 所有模式 |
| `GITHUB_TOKEN` | GitHub Personal Access Token | File Mode |
| `NEXTAUTH_SECRET` | NextAuth.js 密钥 | Web |
| `NEXTAUTH_URL` | Web 应用 URL | Web |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | Web |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | Web |

---

## 开发命令

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 单独构建
pnpm build:web
pnpm build:mcp
pnpm --filter=agent-auth-broker build

# 开发模式（热重载）
pnpm dev
pnpm dev:web

# 数据库操作（Local / Remote Mode）
pnpm db:generate    # 生成 Prisma Client
pnpm db:push        # 推送 Schema（开发环境）
pnpm db:migrate     # 创建迁移文件（生产环境）

# 代码检查
pnpm lint

# 运行测试
pnpm test
```

---

## 测试

使用 Vitest 测试框架，包含 70+ 个测试用例，覆盖以下模块：

- 加密与解密（AES-256-GCM，包含边界情况）
- Scope 展开逻辑（scope 组解析与去重）
- 配置文件加载（环境变量替换、格式校验）
- 权限检查（所有拒绝场景）
- 速率限制（滑动窗口算法）
- 审计日志哈希链（防篡改验证）

```bash
pnpm test              # 运行所有测试
pnpm test --watch      # 监视模式
pnpm test --coverage   # 生成覆盖率报告
```

---

## License

MIT
