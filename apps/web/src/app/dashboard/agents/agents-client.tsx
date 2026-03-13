'use client'
import { useState } from 'react'

type Agent = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  lastUsedAt: Date | null
  createdAt: Date
  tokenPrefix: string
  _count: { policies: number }
}

type Credential = {
  id: string
  name: string
  connectorId: string
}

export function AgentsClient({ agents: initialAgents, credentials }: { agents: Agent[]; credentials: Credential[] }) {
  const [agents, setAgents] = useState(initialAgents)
  const [newToken, setNewToken] = useState<{ agentId: string; token: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [policyCredentialId, setPolicyCredentialId] = useState('')
  const [policyActions, setPolicyActions] = useState('')

  async function createAgent() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    const data = await res.json() as { success: boolean; data: Agent }
    if (data.success) {
      setAgents(prev => [data.data, ...prev])
      setNewName('')

      // 立即生成 token
      const tokenRes = await fetch(`/api/agents/${data.data.id}/token`, { method: 'POST' })
      const tokenData = await tokenRes.json() as { success: boolean; data: { token: string } }
      if (tokenData.success) {
        setNewToken({ agentId: data.data.id, token: tokenData.data.token })
      }
    }
    setCreating(false)
  }

  async function addPolicy() {
    if (!selectedAgent || !policyCredentialId) return
    const actions = policyActions.split(',').map(s => s.trim()).filter(Boolean)
    await fetch(`/api/agents/${selectedAgent}/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: policyCredentialId, allowedActions: actions }),
    })
    setSelectedAgent(null)
    setPolicyCredentialId('')
    setPolicyActions('')
    alert('权限策略已添加')
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Agent 管理</h1>
        <a href="/dashboard" style={{ fontSize: 14, color: '#64748b' }}>← 返回</a>
      </div>

      {/* 创建 Agent */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>注册新 Agent</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Agent 名称，如 my-claude-code"
            style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
          />
          <button
            onClick={createAgent}
            disabled={creating || !newName.trim()}
            style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
          >
            {creating ? '创建中...' : '创建'}
          </button>
        </div>
      </div>

      {/* Token 显示（只显示一次） */}
      {newToken && (
        <div style={{ background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ 请立即复制此 Token（只显示一次）</p>
          <code style={{ display: 'block', background: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 13, wordBreak: 'break-all', border: '1px solid #fbbf24' }}>
            {newToken.token}
          </code>
          <p style={{ fontSize: 13, color: '#92400e', marginTop: 8 }}>
            在 openclaw.json 或 Claude Desktop 配置中使用 BROKER_AGENT_TOKEN 环境变量
          </p>
          <button onClick={() => setNewToken(null)} style={{ marginTop: 12, fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
            我已保存，关闭
          </button>
        </div>
      )}

      {/* Agent 列表 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>已注册 Agents</h2>
        {agents.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 14 }}>暂无 Agent</p>
        ) : (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>名称</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>Token 前缀</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>权限数</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>状态</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0' }}>{agent.name}</td>
                  <td style={{ padding: '10px 0' }}>
                    <code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{agent.tokenPrefix}...</code>
                  </td>
                  <td style={{ padding: '10px 0' }}>{agent._count.policies}</td>
                  <td style={{ padding: '10px 0' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: agent.isActive ? '#dcfce7' : '#f1f5f9', color: agent.isActive ? '#16a34a' : '#64748b' }}>
                      {agent.isActive ? '活跃' : '已禁用'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <button
                      onClick={() => setSelectedAgent(agent.id)}
                      style={{ fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      配置权限
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 权限配置面板 */}
      {selectedAgent && (
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            配置权限 — {agents.find(a => a.id === selectedAgent)?.name}
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>选择凭证</label>
            <select
              value={policyCredentialId}
              onChange={e => setPolicyCredentialId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            >
              <option value="">请选择凭证</option>
              {credentials.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.connectorId})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
              允许的操作（逗号分隔，留空=全部允许）
            </label>
            <input
              value={policyActions}
              onChange={e => setPolicyActions(e.target.value)}
              placeholder="github:list_repos, github:create_issue"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={addPolicy}
              style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
            >
              保存权限
            </button>
            <button
              onClick={() => setSelectedAgent(null)}
              style={{ padding: '10px 20px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
