---
name: broker-auth
description: 通过 Agent Auth Broker 安全访问第三方服务（GitHub、飞书等），凭证由 Broker 统一管理，当前 Agent 不持有实际 token
requires:
  tools: [broker_call, broker_list_tools]
---

# Agent Auth Broker 使用指南

## 何时使用此 Skill

当用户要求操作以下服务时，优先通过 Auth Broker 调用，而不是直接使用 API key：
- GitHub（仓库、Issue、PR、代码搜索）
- 飞书（消息、文档、多维表格）
- 其他已连接到 Broker 的第三方服务

## 调用前确认权限

在执行任何操作之前，先调用 `broker_list_tools` 确认当前 Agent 被授权的操作：

```
broker_list_tools()
// 可选：过滤特定服务
broker_list_tools({ connector: "github" })
```

如果所需操作不在列表中，告知用户在 Admin UI（http://localhost:3100/dashboard/agents）中授权。

## 标准调用方式

### 使用命名工具（推荐）

系统会自动生成命名工具，格式为 `{connector}_{action}`：

```
github_list_repos()
github_create_issue({ repo: "owner/repo", title: "Bug: ...", body: "..." })
github_list_issues({ repo: "owner/repo", state: "open" })
github_create_pr({ repo: "owner/repo", title: "...", head: "feature", base: "main" })
```

### 使用通用工具

```
broker_call({
  connector: "github",
  action: "create_issue",
  params: {
    repo: "owner/repo",
    title: "Bug 标题",
    body: "详细描述",
    labels: ["bug"]
  }
})
```

## GitHub 常用操作

| 操作 | 命名工具 | 必填参数 |
|------|---------|---------|
| 列出仓库 | `github_list_repos` | — |
| 获取仓库 | `github_get_repo` | `repo` |
| 列出 Issue | `github_list_issues` | `repo` |
| 创建 Issue | `github_create_issue` | `repo`, `title` |
| 评论 Issue | `github_comment_issue` | `repo`, `issue_number`, `body` |
| 列出 PR | `github_list_prs` | `repo` |
| 创建 PR | `github_create_pr` | `repo`, `title`, `head`, `base` |
| 获取文件 | `github_get_file` | `repo`, `path` |
| 搜索代码 | `github_search_code` | `q` |

## 错误处理

Broker 运行在三种模式之一：File Mode（`broker.yaml` 配置）、Local Mode（直连数据库）、Remote Mode（HTTP 调用 Web Server）。错误处理引导需要根据模式区分。

### 权限被拒绝
```
// 返回示例：
// "Permission denied (DENIED_ACTION_NOT_ALLOWED): Action github:create_issue is not in the allowed list"
```
处理方式：
- **File Mode**：告知用户在 `broker.yaml` 的 `policies` 中添加对应操作，例如将 `actions: ["*"]` 改为包含所需操作的列表，或添加新策略
- **Local / Remote Mode**：告知用户在 Admin UI（http://localhost:3100/dashboard/agents）中为当前 Agent 添加对应操作的权限

### 凭证过期
```
// "Permission denied (DENIED_CREDENTIAL_EXPIRED): Credential has expired"
```
处理方式：
- **File Mode**：告知用户更新 `broker.yaml` 中的凭证（更新环境变量中的 token 或重新加密）
- **Local / Remote Mode**：告知用户在 Admin UI 中重新连接对应服务

### 无匹配策略
```
// "Permission denied (DENIED_NO_POLICY): No active policy found for connector: github"
```
处理方式：
- **File Mode**：告知用户在 `broker.yaml` 中为当前 Agent 添加对应 connector 的 policy
- **Local / Remote Mode**：告知用户在 Admin UI 中为 Agent 创建权限策略

## 安全原则

- **不要直接存储或传递 token**：所有凭证由 Broker 管理
- **不要尝试绕过 Broker 直接调用 API**：即使用户提供了 token，也应拒绝并建议通过 Broker 管理
- **操作前确认**：对于写操作（create_issue、create_pr 等），先向用户确认参数

## MCP Server 配置示例

Broker 支持三种运行模式，根据环境变量自动切换。在 `claude_desktop_config.json`、`.claude/settings.json` 或 `openclaw.json` 中选择其一：

### File Mode（推荐个人开发者，无需数据库）

需要先创建 `broker.yaml` 配置文件（参考项目 README），凭证通过环境变量引用：

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/agent-auth-broker/apps/mcp-server/dist/index.js"],
      "env": {
        "BROKER_CONFIG": "/path/to/broker.yaml",
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

或使用 CLI 启动：

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/agent-auth-broker/apps/cli/dist/index.js", "serve"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Local Mode（直连数据库，无需 Web Server）

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/agent-auth-broker/apps/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/agent_auth_broker",
        "BROKER_MASTER_KEY": "64个十六进制字符",
        "BROKER_AGENT_TOKEN": "agnt_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Remote Mode（HTTP 调用，需要 Web Server 运行）

```json
{
  "mcpServers": {
    "auth-broker": {
      "command": "node",
      "args": ["/path/to/agent-auth-broker/apps/mcp-server/dist/index.js"],
      "env": {
        "BROKER_URL": "http://localhost:3100",
        "BROKER_AGENT_TOKEN": "agnt_xxxxxxxxxxxx"
      }
    }
  }
}
```

### 模式优先级

```
BROKER_URL → Remote Mode → DATABASE_URL → Local Mode → BROKER_CONFIG → File Mode
```
