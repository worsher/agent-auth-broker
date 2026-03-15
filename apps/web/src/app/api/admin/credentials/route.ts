import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdmin, parsePagination, paginatedResponse } from '@/lib/auth/require-admin'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const params = request.nextUrl.searchParams
  const { page, pageSize, skip } = parsePagination(params)
  const status = params.get('status')
  const connectorId = params.get('connectorId')
  const search = params.get('search')?.trim()

  const where: Prisma.CredentialWhereInput = {}
  if (status) where.status = status as any
  if (connectorId) where.connectorId = connectorId
  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  const [credentials, total] = await Promise.all([
    prisma.credential.findMany({
      where,
      select: {
        id: true,
        name: true,
        connectorId: true,
        oauthScopes: true,
        expiresAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { policies: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.credential.count({ where }),
  ])

  return paginatedResponse(credentials, total, page, pageSize)
}
