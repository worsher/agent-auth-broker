import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { verifyBearerToken } from '@/lib/auth/agent-token'
import { checkPermission } from '@/lib/permission/index'
import { loadCredential } from '@/lib/vault/index'
import { getConnector } from '@broker/connectors'
import { prisma } from '@/lib/db/prisma'
import type { BrokerCallInput } from '@broker/shared-types'

export async function POST(request: NextRequest) {
  const agentId = await verifyBearerToken(request.headers.get('authorization'))
  if (!agentId) {
    return NextResponse.json({ error: '无效的 Agent Token' }, { status: 401 })
  }

  let body: BrokerCallInput
  try {
    body = await request.json() as BrokerCallInput
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 })
  }

  const { connector: connectorId, action, params = {} } = body

  if (!connectorId || !action) {
    return NextResponse.json({ error: '缺少 connector 或 action 参数' }, { status: 400 })
  }

  // 1. 权限检查
  const permCheck = await checkPermission({ agentId, connectorId, action, params })

  // 记录审计日志
  const logData = {
    agentId,
    connectorId,
    action: `${connectorId}:${action}`,
    requestSummary: sanitizeParams(params) as Prisma.InputJsonValue,
    permissionResult: permCheck.result,
    ipAddress: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  }

  if (permCheck.result !== 'ALLOWED' || !permCheck.credentialId) {
    await prisma.auditLog.create({
      data: { ...logData, responseStatus: 403, credentialId: undefined },
    })
    return NextResponse.json(
      { success: false, error: permCheck.message, permissionResult: permCheck.result },
      { status: 403 }
    )
  }

  // 2. 获取 Connector
  const connector = getConnector(connectorId)
  if (!connector) {
    return NextResponse.json({ success: false, error: `未知的 connector: ${connectorId}` }, { status: 400 })
  }

  // 3. 解密凭证并执行
  try {
    const credential = await loadCredential(permCheck.credentialId)
    const result = await connector.execute(action, params, credential)

    await prisma.auditLog.create({
      data: {
        ...logData,
        credentialId: permCheck.credentialId,
        responseStatus: result.httpStatus ?? (result.success ? 200 : 500),
        errorMessage: result.success ? undefined : result.error?.message,
      },
    })

    return NextResponse.json({ success: result.success, data: result.data, error: result.error?.message })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    await prisma.auditLog.create({
      data: { ...logData, credentialId: permCheck.credentialId, responseStatus: 500, errorMessage: message },
    })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// 脱敏参数，不记录可能包含敏感信息的值
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'secret', 'password', 'key', 'credential']
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      sensitiveKeys.some(s => k.toLowerCase().includes(s)) ? '[REDACTED]' : v,
    ])
  )
}
