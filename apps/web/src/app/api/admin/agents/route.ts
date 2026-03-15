import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin, parsePagination, paginatedResponse } from '@/lib/auth/require-admin'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const params = request.nextUrl.searchParams
  const { page, pageSize, skip } = parsePagination(params)
  const search = params.get('search')?.trim()
  const isActive = params.get('isActive')
  const sortBy = params.get('sortBy') ?? 'createdAt'
  const sortOrder = (params.get('sortOrder') ?? 'desc') as 'asc' | 'desc'

  const where: Prisma.AgentWhereInput = {}
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (isActive === 'true') where.isActive = true
  if (isActive === 'false') where.isActive = false

  const allowedSort = ['createdAt', 'name', 'lastUsedAt'] as const
  const orderField = allowedSort.includes(sortBy as any) ? sortBy : 'createdAt'

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        lastUsedAt: true,
        tokenPrefix: true,
        tokenExpiresAt: true,
        allowedIps: true,
        createdAt: true,
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { policies: true, auditLogs: true } },
      },
      orderBy: { [orderField]: sortOrder },
      skip,
      take: pageSize,
    }),
    prisma.agent.count({ where }),
  ])

  return paginatedResponse(agents, total, page, pageSize)
}
