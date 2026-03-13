# Agent Auth Broker

AI Agent 的集中式凭证管理与授权代理服务。Agent 不直接持有任何 API Key 或 OAuth Token，而是通过 Broker 发起调用，Broker 负责权限校验、凭证注入、执行代理和审计日志。

## 核心思路

```
Agent (Claude / OpenClaw)
  ↓  broker_call(connector, action, params)
MCP Server
  ↓  验证 Agent Token
Broker Core（权限检查 → 凭证解密 → 执行）
  ↓  Bearer token 注入
第三方 API（GitHub 等）
```

**优势：**
- Agent 永远不接触真实凭证，token 泄露风险为零
- 细粒度权限控制，精确到操作级别（如只允许 `github:list_repos`，不允许 `github:create_issue`）
- 完整的不可篡改审计日志
- 支持参数级约束（如只能操作特定 org 下的仓库）

---

## 项目结构

```
agent-auth-broker/
├── apps/
│   ├── web/                    # Next.js 14 — Admin UI + Broker API
│   │   └── prisma/schema.prisma
│   ├── mcp-server/             # MCP Server（stdio 传输）
│   │   └── skills/broker-auth/ # OpenClaw / Claude Code Skill 文件
│   └── cli/                    # CLI 工具 — broker init/serve/validate
├── packages/
│   ├── local-runtime/          # 纯本地运行时（YAML 驱动，无需数据库）
│   ├── core/                   # 核心业务逻辑（数据库模式）
│   ├── connectors/             # 第三方服务适配器
│   ├── crypto/                 # AES-256-GCM 加密工具
│   └── shared-types/           # 共享类型定义
├── package.json                # pnpm monorepo 根
└── turbo.json
```

---

## 三种运行模式

| 模式 | 适用场景 | 外部依赖 | 配置方式 |
|------|---------|---------|---------|
| **File Mode** | 个人开发者、单 Agent | 无 | `broker.yaml` + 环境变量 |
| **Local Mode** | 小团队本地开发 | PostgreSQL | `.env` + 数据库 |
| **Remote Mode** | 生产 / 多用户 | PostgreSQL + Web Server | Web UI 管理 |

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
git clone <repo-url>
cd agent-auth-broker
pnpm install
pnpm build
# 使用 node 直接运行
node apps/cli/dist/index.js --version
```

---

## 快速开始：File Mode（推荐）

最轻量的接入方式，只需一个 YAML 配置文件和环境变量，无需数据库、无需 Web Server。

### 1. 初始化配置

```bash
broker init
# 或使用 npx：npx agent-auth-broker init
# 或从源码：node apps/cli/dist/index.js init
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
  output: stdout                  # stdout 或 file
```

### 2. 设置环境变量

```bash
export GITHUB_TOKEN="ghp_your_personal_access_token"
```

### 3. 验证和诊断

```bash
broker validate    # 验证配置文件格式
broker diagnose    # 诊断凭证连接（会尝试调用 GitHub API）
```

### 4. 配置 MCP Server

在 `claude_desktop_config.json` 或 `.claude/settings.json` 中：

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/agent-auth-broker/apps/mcp-server/dist/index.js"],
      "env": {
        "BROKER_CONFIG": "/path/to/broker.yaml",
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

或使用 CLI 的 `serve` 命令启动：

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/agent-auth-broker/apps/cli/dist/index.js", "serve"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

**触发条件：** `BROKER_CONFIG` 环境变量已设置，且 `BROKER_URL` 和 `DATABASE_URL` 未设置。

---

## broker.yaml 配置详解

### 凭证配置

支持两种凭证存储方式：

**方式一：环境变量引用（推荐）**

凭证通过 `${ENV_VAR}` 语法引用环境变量，明文不写入配置文件：

```yaml
credentials:
  - id: github-main
    connector: github
    token: ${GITHUB_TOKEN}
```

**方式二：AES-256-GCM 加密存储**

适合凭证需要持久化的场景，需要配置 `encryption_key`：

```yaml
version: "1"
encryption_key: ${BROKER_MASTER_KEY}    # 主加密密钥（64 位十六进制）

credentials:
  - id: github-main
    connector: github
    encrypted: "base64-encrypted-string"  # 加密后的密文
```

### 权限策略

```yaml
policies:
  - agent: my-agent
    credential: github-main
    actions:
      - "*"                               # 允许所有操作
    # 或精确指定：
    # actions:
    #   - "github:list_repos"
    #   - "github:create_issue"

    # 可选：参数约束
    # param_constraints:
    #   repo:
    #     pattern: "^myorg/.*"            # repo 参数必须以 myorg/ 开头

    # 可选：速率限制
    # rate_limit:
    #   max_calls: 100
    #   window_seconds: 3600

    # 可选：策略过期时间
    # expires_at: "2025-12-31T23:59:59Z"
```

### 审计日志

```yaml
audit:
  enabled: true
  output: stdout          # 输出到 stderr（适合 MCP stdio 模式）
  # output: file          # 输出到文件
  # file: ./broker-audit.log
```

---

## CLI 命令参考

所有命令支持 `-c, --config <path>` 指定配置文件路径，默认从当前目录向上查找 `broker.yaml`。

```bash
# 初始化
broker init                                      # 生成 broker.yaml 模板
broker init --force                              # 覆盖已有配置

# 验证和诊断
broker validate                                  # 校验配置文件格式
broker diagnose                                  # 检查环境变量和凭证连接

# Agent 管理
broker agent create <id> [-n name]               # 创建 Agent
broker agent list                                # 列出所有 Agent
broker agent remove <id>                         # 移除 Agent

# 凭证管理
broker credential add <connector> --env <VAR>    # 添加环境变量引用凭证
broker credential add <connector> --token <val>  # 直接指定 token（不推荐）
broker credential list                           # 列出所有凭证
broker credential remove <id>                    # 移除凭证

# 策略管理
broker policy set <agent> <credential> [--actions "*"]    # 设置策略
broker policy list                                        # 列出所有策略
broker policy remove <agent> <credential>                 # 移除策略

# 启动 MCP Server
broker serve                                     # stdio 模式
broker serve --agent <id>                        # 指定 Agent ID
```

> **提示：** 未全局安装时使用 `node apps/cli/dist/index.js` 替代 `broker`。

---

## Local Mode 和 Remote Mode

如果需要多用户管理、OAuth 授权流程或 Web UI，可以使用 Local Mode 或 Remote Mode。

### 环境要求

- Node.js >= 20
- pnpm >= 9.15
- PostgreSQL >= 14

### 安装和配置

```bash
# 配置环境变量
cp apps/web/.env.example apps/web/.env
```

`apps/web/.env` 必填项：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/agent_auth_broker"
BROKER_MASTER_KEY="your-64-char-hex-string"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3100"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

```bash
# 初始化数据库
pnpm db:generate
pnpm db:push        # 开发环境
# pnpm db:migrate   # 生产环境

# 构建
pnpm build
```

### 启动 Web 服务

```bash
pnpm dev:web         # 访问 http://localhost:3100
```

### 使用流程

1. **注册 Agent**：Admin UI → Agents → 创建 Agent → 复制 Token（`agnt_xxxx`，仅显示一次）
2. **连接凭证**：Admin UI → Credentials → 通过 OAuth 连接 → 凭证自动加密存储
3. **配置策略**：Admin UI → Agent Policies → 选择凭证、操作列表、参数约束
4. **配置 MCP Server**

### MCP Server 配置

#### Local Mode（直连数据库）

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

**触发条件：** `DATABASE_URL` 已设置且 `BROKER_URL` 未设置。

#### Remote Mode（HTTP 调用）

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/apps/mcp-server/dist/index.js"],
      "env": {
        "BROKER_URL": "http://localhost:3100",
        "BROKER_AGENT_TOKEN": "agnt_xxxxxxxxxxxx"
      }
    }
  }
}
```

**触发条件：** `BROKER_URL` 已设置（最高优先级）。

### 模式优先级

```
BROKER_URL → Remote Mode
  ↓ 未设置
DATABASE_URL → Local Mode
  ↓ 未设置
BROKER_CONFIG → File Mode
```

---

## MCP 工具说明

MCP Server 启动后自动暴露以下工具：

### 固定工具

| 工具 | 说明 |
|------|------|
| `broker_call` | 通用调用入口，指定 connector + action + params |
| `broker_list_tools` | 列出当前 Agent 被授权的所有工具 |

### 动态命名工具

根据 Agent 的权限策略自动生成，格式为 `{connector}_{action}`，例如：

| 工具 | 等价调用 |
|------|---------|
| `github_list_repos` | `broker_call({ connector: "github", action: "list_repos" })` |
| `github_create_issue` | `broker_call({ connector: "github", action: "create_issue", ... })` |
| `github_list_prs` | `broker_call({ connector: "github", action: "list_prs", ... })` |

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

### 拒绝原因

| 错误码 | 含义 |
|--------|------|
| `DENIED_AGENT_INACTIVE` | Agent 已被停用 |
| `DENIED_NO_POLICY` | 该 Agent 没有针对此 connector 的策略 |
| `DENIED_ACTION_NOT_ALLOWED` | 操作不在允许列表中 |
| `DENIED_PARAM_CONSTRAINT` | 参数不满足约束条件 |
| `DENIED_CREDENTIAL_EXPIRED` | 凭证已过期或被撤销 |

### 参数约束示例

在策略的 `paramConstraints` 字段中配置 JSON Schema，限制参数范围：

```json
{
  "repo": {
    "pattern": "^myorg/.*"
  }
}
```

上述配置表示 `repo` 参数必须以 `myorg/` 开头，否则请求被拒绝。

---

## 加密方案

凭证数据采用 AES-256-GCM **双层加密**：

```
Master Encryption Key (MEK) — 来自环境变量 BROKER_MASTER_KEY
  └─ 加密 → DEK（Data Encryption Key，每条凭证独立）
              └─ 加密 → 凭证 JSON（含 access_token 等）
```

- MEK 仅存在于环境变量中，不落盘
- DEK 加密后存入数据库（`encryptionKeyId` 字段）
- 凭证明文从不进入日志或响应体

---

## 审计日志

所有操作（包括被拒绝的请求）均记录审计日志，应用层只允许 INSERT，不允许 UPDATE / DELETE。

日志包含：
- Agent ID、Connector、Action
- 权限检查结果（`permissionResult`）
- 脱敏后的请求摘要（敏感字段替换为 `[REDACTED]`）
- HTTP 状态码、错误信息
- IP 地址、User-Agent

---

## OpenClaw 集成

将 Skill 文件复制到 OpenClaw 的 rules/skills 目录：

```bash
cp apps/mcp-server/skills/broker-auth/SKILL.md /path/to/rules/skills/broker-auth/SKILL.md
```

在 `openclaw.json` 中注册 MCP Server（选择 Local 或 Remote 模式之一）。

---

## 开发命令

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 仅构建 Web / MCP Server / CLI
pnpm build:web
pnpm build:mcp
pnpm build --filter=@broker/cli

# 开发模式（热重载）
pnpm dev

# 数据库操作（Local/Remote Mode）
pnpm db:generate   # 生成 Prisma Client
pnpm db:push       # 推送 Schema（开发环境）
pnpm db:migrate    # 创建迁移（生产环境）

# CLI（File Mode）
node apps/cli/dist/index.js init
node apps/cli/dist/index.js validate
node apps/cli/dist/index.js diagnose
node apps/cli/dist/index.js serve

# 代码检查
pnpm lint
```

---

## 扩展 Connector

在 `packages/connectors/src/` 下新建目录，实现 `ConnectorAdapter` 接口，然后在 `registry.ts` 中注册：

```typescript
// packages/connectors/src/feishu/index.ts
export const feishuConnector: ConnectorAdapter = {
  info: { id: 'feishu', name: '飞书', ... },
  getActions() { return [...] },
  async execute(action, params, credential) { ... },
}

// packages/connectors/src/registry.ts
import { feishuConnector } from './feishu/index'
const connectors = new Map([
  ['github', githubConnector],
  ['feishu', feishuConnector],  // 注册新 connector
])
```
