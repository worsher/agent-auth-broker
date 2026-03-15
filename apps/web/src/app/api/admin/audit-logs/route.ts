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
  const connectorId = params.get('connectorId')
  const permissionResult = params.get('permissionResult')
  const startDate = params.get('startDate')
  const endDate = params.get('endDate')

  const where: Prisma.AuditLogWhereInput = {}
  if (agentId) where.agentId = agentId
  if (connectorId) where.connectorId = connectorId
  if (permissionResult) where.permissionResult = permissionResult

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = new Date(startDate)
    if (endDate) where.createdAt.lte = new Date(endDate)
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
        credential: { select: { id: true, name: true, connectorId: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  return paginatedResponse(logs, total, page, pageSize)
}
