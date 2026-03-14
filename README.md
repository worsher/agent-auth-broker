# Agent Auth Broker

[中文](README-zh.md)

A centralized credential management and authorization proxy for AI Agents. Agents never hold any API keys or OAuth tokens directly. Instead, they call the Broker, which handles permission enforcement, credential injection, execution, and audit logging.

---

## Architecture

```
AI Agent (Claude / OpenClaw / etc.)
  |
  |  broker_call(connector, action, params)
  v
MCP Server
  |
  |  Validates Agent Token
  v
Broker Core
  |  Permission check -> Credential decryption -> Execution
  v
Third-party API (GitHub, etc.)
  |
  |  Bearer Token injected by Broker, invisible to Agent
  v
Response returned to Agent
```

**Key benefits:**

- Agents never touch real credentials — token leakage risk is eliminated
- Operation-level fine-grained access control (e.g., allow `github:list_repos`, deny `github:create_issue`)
- Parameter constraints to scope operations (e.g., restrict access to a specific GitHub organization)
- Tamper-evident audit log chain (HMAC-SHA256)

---

## Repository Structure

```
agent-auth-broker/
├── apps/
│   ├── web/                    # Next.js 14 — Admin UI + Broker API (PostgreSQL)
│   │   └── prisma/schema.prisma
│   ├── mcp-server/             # MCP Server (stdio + Streamable HTTP transport)
│   └── cli/                    # CLI tool — broker init/serve/validate/ui
├── packages/
│   ├── local-runtime/          # Local runtime (YAML-driven, no database required)
│   ├── core/                   # Core business logic (database schema)
│   ├── connectors/             # Third-party service adapters (plugin-based dynamic loading)
│   ├── crypto/                 # AES-256-GCM encryption utilities
│   └── shared-types/           # Shared TypeScript type definitions
├── Dockerfile                  # Multi-stage Docker build
├── docker-compose.yml          # One-command web + postgres deployment
├── .github/workflows/          # CI/CD (build + typecheck + test + npm publish)
├── package.json                # pnpm monorepo root
└── turbo.json
```

---

## Features

**Security**
- AES-256-GCM two-layer encryption (MEK encrypts DEK, DEK encrypts credential data)
- ReDoS protection via safe-regex2 for all regex pattern validation
- Tamper-evident audit log chain (HMAC-SHA256 hash chain)
- Secure HTTP response headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- OAuth State persisted to database to prevent CSRF attacks
- Token authentication via SHA-256 hash comparison

**Permission Model**
- Operation-level access control
- Parameter regex constraints to limit operation scope
- Rate limiting with sliding window algorithm
- Policy expiration timestamps
- Scope groups for simplified permission configuration

**Observability**
- Structured logging via pino (configurable via `BROKER_LOG_LEVEL`)
- Audit log output to stdout or file
- `/api/health` endpoint for health checks

**Extensibility**
- Plugin-based Connector system (load from npm packages or local paths dynamically)
- `ConnectorAdapter` interface with optional `validateCredential` method
- Built-in GitHub Connector with 10 operations

---

## Operation Modes

| Mode | Use Case | External Dependencies | Configuration |
|------|----------|-----------------------|---------------|
| **File Mode** | Individual developers, single Agent | None | `broker.yaml` + environment variables |
| **Local Mode** | Small teams, local development | PostgreSQL | `.env` + database |
| **Remote Mode** | Production, multi-user | PostgreSQL + Web Server | Managed via Web UI |

**Mode selection priority (resolved automatically at MCP Server startup):**

```
BROKER_URL is set      -> Remote Mode (highest priority)
DATABASE_URL is set    -> Local Mode
BROKER_CONFIG is set   -> File Mode
```

---

## Installation

### Option 1: Global npm install (recommended)

```bash
npm install -g agent-auth-broker
broker --version
```

### Option 2: Run with npx (no installation required)

```bash
npx agent-auth-broker init
npx agent-auth-broker serve
```

### Option 3: Build from source

```bash
git clone https://github.com/your-org/agent-auth-broker.git
cd agent-auth-broker
pnpm install
pnpm build
node apps/cli/dist/index.js --version
```

---

## Quick Start: File Mode

The lightest-weight integration — requires only a YAML configuration file and environment variables, with no database or web server.

### Step 1: Initialize configuration

```bash
broker init
# or: npx agent-auth-broker init
```

Generated `broker.yaml`:

```yaml
version: "1"

agents:
  - id: my-agent
    name: My AI Agent

credentials:
  - id: github-main
    connector: github
    token: ${GITHUB_TOKEN}        # References an environment variable — credential never written to disk

policies:
  - agent: my-agent
    credential: github-main
    actions:
      - "*"                       # Allow all operations

audit:
  enabled: true
  output: stdout
```

### Step 2: Set environment variables

```bash
export GITHUB_TOKEN="ghp_your_personal_access_token"
```

### Step 3: Validate configuration

```bash
broker validate    # Validate configuration file format
broker diagnose    # Diagnose credential connectivity (calls the GitHub API to verify)
```

### Step 4: Configure the MCP Server

Add the following to `claude_desktop_config.json` or `.claude/settings.json`:

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

When running from source, replace `"command": "broker"` with:

```json
"command": "node",
"args": ["/path/to/agent-auth-broker/apps/cli/dist/index.js", "serve"]
```

---

## broker.yaml Configuration Reference

### Credential Configuration

**Option 1: Environment variable reference (recommended)**

Credentials are referenced via `${ENV_VAR}` syntax. No plaintext credentials are written to disk.

```yaml
credentials:
  - id: github-main
    connector: github
    token: ${GITHUB_TOKEN}
```

**Option 2: AES-256-GCM encrypted storage**

For scenarios requiring credential persistence, configure `encryption_key` and use encrypted storage:

```yaml
version: "1"
encryption_key: ${BROKER_MASTER_KEY}    # Master encryption key (64-char hex string)

credentials:
  - id: github-main
    connector: github
    encrypted: "base64-encrypted-string"
```

### Permission Policies

```yaml
policies:
  - agent: my-agent
    credential: github-main

    # Option 1: Allow all operations
    actions:
      - "*"

    # Option 2: Use scope groups (auto-expanded)
    # actions:
    #   - "github:read"    # Expands to 7 read-only operations
    #   - "github:write"   # Expands to 3 write operations

    # Option 3: Specify operations explicitly
    # actions:
    #   - "github:list_repos"
    #   - "github:create_issue"

    # Optional: Parameter constraints (regex matching)
    # param_constraints:
    #   repo:
    #     pattern: "^myorg/.*"    # repo parameter must start with myorg/

    # Optional: Rate limiting (sliding window algorithm)
    # rate_limit:
    #   max_calls: 100
    #   window_seconds: 3600

    # Optional: Policy expiration
    # expires_at: "2025-12-31T23:59:59Z"
```

### Scope Groups

| Scope | Expands To |
|-------|------------|
| `github:read` | `list_repos`, `get_repo`, `list_issues`, `get_issue`, `list_prs`, `get_file`, `search_code` |
| `github:write` | `create_issue`, `comment_issue`, `create_pr` |

### Audit Log Configuration

```yaml
audit:
  enabled: true
  output: stdout     # Outputs to stderr (appropriate for MCP stdio mode)
  # output: file
  # file: ./broker-audit.log
```

---

## CLI Reference

All commands support `-c, --config <path>` to specify the configuration file. By default, the CLI searches upward from the current directory for `broker.yaml`.

```bash
# Initialization
broker init                                        # Generate broker.yaml template
broker init --force                                # Overwrite existing configuration

# Validation and diagnostics
broker validate                                    # Validate configuration file format
broker diagnose                                    # Check environment variables and credential connectivity

# Agent management
broker agent create <id> [-n <name>]               # Create an Agent
broker agent list                                  # List all Agents
broker agent remove <id>                           # Remove an Agent

# Token management
broker token generate <agent-id>                   # Generate an Agent Token (displayed once)
broker token generate <agent-id> --force           # Overwrite existing Token
broker token revoke <agent-id>                     # Revoke a Token
broker token list                                  # List Token status for all Agents

# Credential management
broker credential add <connector> --env <VAR>      # Add a credential via environment variable reference
broker credential add <connector> --token <val>    # Add a credential with inline token (not recommended)
broker credential list                             # List all credentials
broker credential remove <id>                      # Remove a credential

# Policy management
broker policy set <agent> <credential> [--actions "*"]    # Set a policy
broker policy list                                        # List all policies
broker policy remove <agent> <credential>                 # Remove a policy

# Testing operations
broker test <connector> <action>                   # Test a Connector operation
broker test github list_repos                      # Example: list GitHub repositories
broker test github list_issues -p '{"repo":"owner/repo"}'  # With parameters
broker test github create_issue --dry-run          # Permission check only, no actual API call

# Start MCP Server
broker serve                                       # stdio mode (with config hot-reload)
broker serve --agent <id>                          # Specify Agent ID

# Web UI (File Mode visual management)
broker ui                                          # Start Web UI (default port 3200)
broker ui --port 8080                              # Custom port
```

### Token Authentication Flow

1. Generate a Token: `broker token generate my-agent` (Token is displayed once only)
2. The SHA-256 hash of the Token is automatically written to the `token_hash` field in `broker.yaml`
3. Pass the Token plaintext via the `BROKER_AGENT_TOKEN` environment variable in your MCP configuration
4. The MCP Server verifies Agent identity at startup via hash comparison

If `BROKER_AGENT_TOKEN` is not set, the Server falls back to the `--agent` parameter, or defaults to the first Agent in the configuration.

### Configuration Hot-Reload

`broker serve` automatically watches `broker.yaml` for changes. Configuration updates take effect without restarting the MCP Server:

- Uses `fs.watch` with 300ms debounce to prevent duplicate triggers
- On reload failure, the previous configuration is retained and an error is logged
- The file watcher is cleaned up automatically on process exit

### File Mode Web UI

`broker ui` starts a lightweight web interface (default: `http://localhost:3200`) for managing `broker.yaml` visually:

- Built on Node.js built-in `http` module — no external dependencies
- Supports create and delete operations for Agents, Credentials, and Policies
- YAML preview with automatic token redaction
- All changes are written to `broker.yaml` immediately

---

## MCP Server Configuration

### Streamable HTTP Transport (optional)

The default transport is stdio. To expose the MCP Server over HTTP (e.g., for multiple Agents sharing a single MCP Server), enable HTTP transport:

```bash
MCP_TRANSPORT=http MCP_PORT=3200 MCP_AUTH_TOKEN=your-secret broker serve
```

Clients must include the Bearer Token in requests:

```
Authorization: Bearer your-secret
```

### MCP Configuration by Mode

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

**Local Mode (direct PostgreSQL connection)**

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

**Remote Mode (HTTP call to Web Server)**

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

## Docker Deployment

Start the Web Server and PostgreSQL with a single command using docker-compose:

```bash
# Copy and configure environment variables
cp apps/web/.env.example apps/web/.env

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f web
```

`docker-compose.yml` includes:

- `web` service: Next.js 14 Admin UI + Broker API, port 3100
- `postgres` service: PostgreSQL 14, data persisted to a named volume

Multi-stage Docker build — the final image contains only production artifacts.

---

## Web UI (Local / Remote Mode)

### Requirements

- Node.js >= 20
- pnpm >= 9.15
- PostgreSQL >= 14

### Configuration

```bash
cp apps/web/.env.example apps/web/.env
```

Required fields in `apps/web/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/agent_auth_broker"
BROKER_MASTER_KEY="your-64-char-hex-string"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3100"
GITHUB_CLIENT_ID="your-github-oauth-app-client-id"
GITHUB_CLIENT_SECRET="your-github-oauth-app-client-secret"
```

### Initialize Database and Start

```bash
pnpm db:generate    # Generate Prisma Client
pnpm db:push        # Push schema (development)
# pnpm db:migrate   # Create migration files (production)

pnpm build
pnpm dev:web        # Visit http://localhost:3100
```

### Workflow

1. **Register an Agent**: Admin UI -> Agents -> Create Agent -> Copy Token (`agnt_xxxx`, displayed once)
2. **Connect credentials**: Admin UI -> Credentials -> Connect via OAuth -> Credentials are encrypted automatically
3. **Configure policies**: Admin UI -> Agent Policies -> Select credential, allowed operations, and parameter constraints
4. **Configure MCP Server**: Set the Agent Token in the `BROKER_AGENT_TOKEN` environment variable in your MCP configuration

---

## MCP Tools

The MCP Server exposes the following tools upon startup:

### Fixed Tools

| Tool | Description |
|------|-------------|
| `broker_call` | Universal invocation entry point: specify connector + action + params |
| `broker_list_tools` | List all tools the current Agent is authorized to use |

### Dynamic Named Tools

Generated automatically based on the Agent's permission policies, in the format `{connector}_{action}`:

| Tool | Equivalent Call |
|------|----------------|
| `github_list_repos` | `broker_call({ connector: "github", action: "list_repos" })` |
| `github_create_issue` | `broker_call({ connector: "github", action: "create_issue", ... })` |
| `github_search_code` | `broker_call({ connector: "github", action: "search_code", ... })` |

Agents only see tools they are authorized to use. Unauthorized tools are not included in the tool list.

---

## GitHub Connector Operations

| action | Description | Required Parameters |
|--------|-------------|---------------------|
| `list_repos` | List repositories for the authenticated user | — |
| `get_repo` | Get repository information | `repo` (format: `owner/repo`) |
| `list_issues` | List issues in a repository | `repo` |
| `get_issue` | Get details of a single issue | `repo`, `issue_number` |
| `create_issue` | Create an issue | `repo`, `title` |
| `comment_issue` | Add a comment to an issue | `repo`, `issue_number`, `body` |
| `list_prs` | List pull requests | `repo` |
| `create_pr` | Create a pull request | `repo`, `title`, `head`, `base` |
| `get_file` | Get file contents (Base64-decoded automatically) | `repo`, `path` |
| `search_code` | Search code | `q` |

---

## Permission Model

### Permission Check Flow

```
Request received
  |
  +--> Is the Agent active?                  -> DENIED_AGENT_INACTIVE
  |
  +--> Is there a matching policy?           -> DENIED_NO_POLICY
  |
  +--> Is the action in the allow list?      -> DENIED_ACTION_NOT_ALLOWED
  |
  +--> Do the parameters satisfy constraints? -> DENIED_PARAM_CONSTRAINT
  |
  +--> Has the credential expired?           -> DENIED_CREDENTIAL_EXPIRED
  |
  +--> Has the rate limit been exceeded?     -> DENIED_RATE_LIMIT
  |
  v
Execute operation
```

### Denial Reason Codes

| Code | Meaning |
|------|---------|
| `DENIED_AGENT_INACTIVE` | The Agent has been deactivated |
| `DENIED_NO_POLICY` | No policy matches this Agent and connector |
| `DENIED_ACTION_NOT_ALLOWED` | The operation is not in the allow list |
| `DENIED_PARAM_CONSTRAINT` | A parameter does not satisfy the configured constraint |
| `DENIED_CREDENTIAL_EXPIRED` | The credential has expired or been revoked |
| `DENIED_RATE_LIMIT` | The rate limit has been exceeded |

### Parameter Constraint Example

```yaml
param_constraints:
  repo:
    pattern: "^myorg/.*"    # repo parameter must start with myorg/
```

All regex patterns are validated with safe-regex2 on load to prevent ReDoS attacks.

---

## Encryption

Credentials are protected with **two-layer AES-256-GCM encryption**:

```
BROKER_MASTER_KEY (environment variable, never written to disk)
  |
  +--> Encrypts DEK (Data Encryption Key, unique per credential)
         |
         +--> Encrypts credential JSON (access_token and other sensitive fields)
                |
                +--> Ciphertext stored in database
```

- The MEK (Master Encryption Key) exists only as an environment variable and is never persisted
- The DEK is stored in the database (encrypted) in the `encryptionKeyId` field
- Credential plaintext never appears in logs or HTTP response bodies
- File Mode encrypted storage uses the same `BROKER_MASTER_KEY`

---

## Audit Logging

All operations — including denied requests — are recorded in the audit log.

**Log fields:**

- Agent ID, Connector, Action
- Permission check result (`permissionResult`)
- Redacted request summary (sensitive fields replaced with `[REDACTED]`)
- HTTP status code and error message
- IP address and User-Agent
- Timestamp and hash chain value

**Tamper-evidence:**

Audit logs use an HMAC-SHA256 hash chain. Each record includes the hash of the previous record, forming a chain that cannot be altered without detection. The application layer enforces INSERT-only access — UPDATE and DELETE operations on audit records are not permitted.

**Output configuration:**

```yaml
audit:
  enabled: true
  output: stdout     # Outputs to stderr in MCP stdio mode
  # output: file
  # file: ./broker-audit.log
```

---

## Extending Connectors

### Built-in Integration

Create a new directory under `packages/connectors/src/`, implement the `ConnectorAdapter` interface, and register it in `registry.ts`:

```typescript
// packages/connectors/src/slack/index.ts
export const slackConnector: ConnectorAdapter = {
  info: { id: 'slack', name: 'Slack', version: '1.0.0' },
  getActions() {
    return [
      { id: 'post_message', name: 'Post Message', params: [...] },
    ]
  },
  async execute(action, params, credential) {
    // Implementation
  },
  async validateCredential(credential) {
    // Optional: validate credential on load
  },
}

// packages/connectors/src/registry.ts
import { slackConnector } from './slack/index'

const connectors = new Map([
  ['github', githubConnector],
  ['slack', slackConnector],    // Register new Connector
])
```

### Plugin-based Dynamic Loading

Connectors can be loaded from npm packages or local paths at runtime, without modifying core code:

```typescript
import { loadConnectorPlugin } from '@agent-auth-broker/connectors'

// Load from npm package
await loadConnectorPlugin('my-broker-connector-slack')

// Load from local path
await loadConnectorPlugin('./plugins/my-connector')
```

Plugins must export a `ConnectorAdapter`-conforming object as their default export.

---

## Environment Variables

| Variable | Purpose | Mode |
|----------|---------|------|
| `BROKER_CONFIG` | Path to broker.yaml | File Mode |
| `DATABASE_URL` | PostgreSQL connection string | Local / Remote |
| `BROKER_MASTER_KEY` | Master encryption key (64-char hex string) | Local / Remote / File (encrypted storage) |
| `BROKER_AGENT_TOKEN` | Agent authentication token | All modes |
| `BROKER_AGENT_ID` | Specify Agent ID (used when no token is set) | File Mode |
| `BROKER_URL` | Web Server URL | Remote Mode |
| `MCP_TRANSPORT` | Transport type: `stdio` (default) or `http` | MCP Server |
| `MCP_PORT` | HTTP transport port (default: 3200) | MCP Server HTTP mode |
| `MCP_AUTH_TOKEN` | HTTP Bearer Token | MCP Server HTTP mode |
| `BROKER_LOG_LEVEL` | Log level (default: `info`) | All modes |
| `GITHUB_TOKEN` | GitHub Personal Access Token | File Mode |
| `NEXTAUTH_SECRET` | NextAuth.js secret | Web |
| `NEXTAUTH_URL` | Web application URL | Web |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | Web |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | Web |

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build individual packages
pnpm build:web
pnpm build:mcp
pnpm --filter=agent-auth-broker build

# Development mode (with hot reload)
pnpm dev
pnpm dev:web

# Database operations (Local / Remote Mode)
pnpm db:generate    # Generate Prisma Client
pnpm db:push        # Push schema (development)
pnpm db:migrate     # Create migration files (production)

# Linting
pnpm lint

# Run tests
pnpm test
```

---

## Testing

The project uses Vitest with 70+ test cases covering the following modules:

- Encryption and decryption (AES-256-GCM, including edge cases)
- Scope expansion logic (scope group parsing and deduplication)
- Configuration loading (environment variable substitution, format validation)
- Permission checking (all denial scenarios)
- Rate limiting (sliding window algorithm)
- Audit log hash chain (tamper-evidence verification)

```bash
pnpm test              # Run all tests
pnpm test --watch      # Watch mode
pnpm test --coverage   # Generate coverage report
```

---

## License

MIT
