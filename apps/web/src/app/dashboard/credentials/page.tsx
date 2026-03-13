import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth/next-auth'
import { prisma } from '@/lib/db/prisma'

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string; login?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const credentials: Array<{
    id: string
    name: string
    connectorId: string
    status: string
    oauthScopes: string[]
    expiresAt: Date | null
    createdAt: Date
    _count: { policies: number }
  }> = await prisma.credential.findMany({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      name: true,
      connectorId: true,
      status: true,
      oauthScopes: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { policies: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>凭证管理</h1>
        <a href="/dashboard" style={{ fontSize: 14, color: '#64748b' }}>← 返回</a>
      </div>

      {searchParams.success === 'github_connected' && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: 16, marginBottom: 24, color: '#16a34a' }}>
          ✓ GitHub 账号 @{searchParams.login} 已连接成功
        </div>
      )}
      {searchParams.error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: 16, marginBottom: 24, color: '#dc2626' }}>
          ✗ 连接失败：{searchParams.error}
        </div>
      )}

      {/* 连接新服务 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>连接新服务</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <a
            href="/api/oauth/github/start"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: '#24292e',
              color: 'white',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <span>GitHub</span>
          </a>
        </div>
      </div>

      {/* 凭证列表 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>已连接的凭证</h2>
        {credentials.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 14 }}>暂无凭证，请先连接一个服务</p>
        ) : (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>名称</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>服务</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>授权范围</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>状态</th>
                <th style={{ padding: '6px 0', fontWeight: 500 }}>使用中</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(cred => (
                <tr key={cred.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0' }}>{cred.name}</td>
                  <td style={{ padding: '10px 0' }}>
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      {cred.connectorId}
                    </span>
                  </td>
                  <td style={{ padding: '10px 0', color: '#64748b', fontSize: 12 }}>
                    {cred.oauthScopes.join(', ') || '—'}
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      background: cred.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                      color: cred.status === 'ACTIVE' ? '#16a34a' : '#dc2626',
                    }}>
                      {cred.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 0', color: '#64748b' }}>{cred._count.policies} 个 Agent</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
