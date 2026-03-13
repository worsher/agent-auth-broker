import bcrypt from 'bcryptjs'
import { generateAgentToken } from '@broker/crypto'
import { prisma } from '../db/prisma'

export { generateAgentToken }

/**
 * 创建并存储新的 Agent Token
 * 返回明文 token（只显示一次），存储 bcrypt hash
 */
export async function createAgentToken(agentId: string): Promise<string> {
  const { token, prefix } = generateAgentToken()
  const tokenHash = await bcrypt.hash(token, 10)

  await prisma.agent.update({
    where: { id: agentId },
    data: { tokenHash, tokenPrefix: prefix },
  })

  return token
}

/**
 * 验证 Agent Token
 * 先用 prefix 快速定位 Agent，再 bcrypt.compare 验证
 */
export async function verifyAgentToken(token: string): Promise<string | null> {
  if (!token.startsWith('agnt_')) return null

  const prefix = token.substring(0, 12)

  const agent = await prisma.agent.findUnique({
    where: { tokenPrefix: prefix },
    select: { id: true, tokenHash: true, isActive: true },
  })

  if (!agent || !agent.isActive) return null

  const valid = await bcrypt.compare(token, agent.tokenHash)
  if (!valid) return null

  // 更新最后使用时间
  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastUsedAt: new Date() },
  })

  return agent.id
}

/**
 * 从 Authorization header 提取并验证 Agent Token
 */
export async function verifyBearerToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  return verifyAgentToken(token)
}
