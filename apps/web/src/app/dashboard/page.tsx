import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth/next-auth'
import { prisma } from '@/lib/db/prisma'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const [agentCount, credentialCount, recentLogs] = await Promise.all([
    prisma.agent.count({ where: { ownerId: session.user.id } }),
    prisma.credential.count({ where: { ownerId: session.user.id } }),
    prisma.auditLog.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { action: true, connectorId: true, permissionResult: true, createdAt: true },
    }) as Promise<Array<{ action: string | null; connectorId: string | null; permissionResult: string; createdAt: Date }>>,
  ])

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Agent Auth Broker</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>欢迎，{session.user.email}</p>
        </div>
        <a href="/api/auth/signout" style={{ fontSize: 14, color: '#64748b' }}>退出</a>
      </div>

      {/* 概览卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard title="注册 Agent" value={agentCount} href="/dashboard/agents" />
        <StatCard title="已连接凭证" value={credentialCount} href="/dashboard/credentials" />
        <StatCard title="今日调用" value="—" href="#" />
      </div>

      {/* 快速操作 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32 }}>
        <ActionCard
          title="连接 GitHub"
          description="授权 GitHub OAuth，让 Agent 访问你的仓库"
          href="/api/oauth/github/start"
        />
        <ActionCard
          title="注册新 Agent"
          description="为 Claude Code 或 OpenClaw Agent 创建访问凭证"
          href="/dashboard/agents"
        />
      </div>

      {/* 最近审计日志 */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>最近操作日志</h2>
        {recentLogs.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 14 }}>暂无记录</p>
        ) : (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '4px 0', fontWeight: 500 }}>操作</th>
                <th style={{ padding: '4px 0', fontWeight: 500 }}>结果</th>
                <th style={{ padding: '4px 0', fontWeight: 500 }}>时间</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 0' }}>{log.action ?? '-'}</td>
                  <td style={{ padding: '8px 0' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      background: log.permissionResult === 'ALLOWED' ? '#dcfce7' : '#fee2e2',
                      color: log.permissionResult === 'ALLOWED' ? '#16a34a' : '#dc2626',
                    }}>
                      {log.permissionResult}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0', color: '#94a3b8' }}>
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, href }: { title: string; value: number | string; href: string }) {
  return (
    <Link href={href} style={{
      display: 'block',
      background: 'white',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      transition: 'box-shadow .2s',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{value}</div>
      <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{title}</div>
    </Link>
  )
}

function ActionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a href={href} style={{
      display: 'block',
      background: 'white',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      border: '1px solid #e2e8f0',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title} →</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>{description}</div>
    </a>
  )
}
