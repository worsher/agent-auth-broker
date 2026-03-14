import crypto from 'node:crypto'
import { prisma } from '../db/prisma'

/**
 * 创建 OAuth state（CSRF 防护）
 * 持久化到数据库，支持多实例和进程重启
 */
export async function createOAuthState(userId: string, connectorId: string): Promise<string> {
  const state = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 分钟过期

  await prisma.oAuthState.create({
    data: { state, userId, connectorId, expiresAt },
  })

  return state
}

/**
 * 消费 OAuth state（一次性使用）
 * 返回 userId 或 null（过期/不存在）
 */
export async function consumeOAuthState(state: string): Promise<{ userId: string; connectorId: string } | null> {
  const record = await prisma.oAuthState.findUnique({ where: { state } })

  if (!record) return null

  // 无论是否过期都删除（一次性使用）
  await prisma.oAuthState.delete({ where: { state } })

  if (record.expiresAt < new Date()) return null

  // 顺便清理过期的 state 记录
  await prisma.oAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => {}) // 清理失败不影响主流程

  return { userId: record.userId, connectorId: record.connectorId }
}
