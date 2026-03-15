import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const [
    agentCount,
    activeAgentCount,
    credentialCount,
    policyCount,
    recentLogs,
    credentialsByStatus,
  ] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.count({ where: { isActive: true } }),
    prisma.credential.count(),
    prisma.agentPolicy.count({ where: { isActive: true } }),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.credential.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
  ])

  const statusBreakdown: Record<string, number> = {}
  for (const row of credentialsByStatus) {
    statusBreakdown[row.status] = row._count.status
  }

  return NextResponse.json({
    success: true,
    data: {
      agents: { total: agentCount, active: activeAgentCount },
      credentials: { total: credentialCount, byStatus: statusBreakdown },
      policies: { active: policyCount },
      auditLogs: { last24h: recentLogs },
    },
  })
}
