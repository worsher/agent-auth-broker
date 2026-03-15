import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin, parsePagination, paginatedResponse } from '@/lib/auth/require-admin'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const params = request.nextUrl.searchParams
  const { page, pageSize, skip } = parsePagination(params)
  const agentId = params.get('agentId')
  const credentialId = params.get('credentialId')
  const isActive = params.get('isActive')

  const where: Prisma.AgentPolicyWhereInput = {}
  if (agentId) where.agentId = agentId
  if (credentialId) where.credentialId = credentialId
  if (isActive === 'true') where.isActive = true
  if (isActive === 'false') where.isActive = false

  const [policies, total] = await Promise.all([
    prisma.agentPolicy.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
        credential: { select: { id: true, name: true, connectorId: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.agentPolicy.count({ where }),
  ])

  return paginatedResponse(policies, total, page, pageSize)
}
