import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from './next-auth'
import { prisma } from '../db/prisma'

export interface AdminUser {
  userId: string
  role: string
}

/**
 * 验证当前请求是否来自管理员（OWNER 或 ADMIN）
 * 返回 AdminUser 或 NextResponse（401/403）
 */
export async function requireAdmin(): Promise<AdminUser | NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  })

  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 401 })
  }

  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
  }

  return { userId: user.id, role: user.role }
}

/**
 * 解析通用分页参数
 */
export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20))
  const skip = (page - 1) * pageSize
  return { page, pageSize, skip }
}

/**
 * 构造分页响应
 */
export function paginatedResponse(data: unknown[], total: number, page: number, pageSize: number) {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
