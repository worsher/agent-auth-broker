import type { Prisma } from '@prisma/client'
import { getConnector } from '@broker/connectors'
import { getPrisma } from './db.js'
import { checkPermission } from './permission.js'
import { loadCredential } from './vault.js'

export interface ToolEntry {
  connector: string
  connectorName: string
  credentialName: string
  action: string
  actionName: string
  description: string
}

export interface BrokerCallResult {
  success: boolean
  data?: unknown
  error?: string
  permissionResult?: string
}

export async function listTools(agentId: string, connector?: string): Promise<ToolEntry[]> {
  const prisma = getPrisma()
  const policies = await prisma.agentPolicy.findMany({
    where: {
      agentId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      credential: { status: 'ACTIVE' },
    },
    include: {
      credential: { select: { connectorId: true, name: true } },
    },
  })

  const tools: ToolEntry[] = []

  for (const policy of policies) {
    const connectorId = policy.credential.connectorId
    if (connector && connectorId !== connector) continue

    const conn = getConnector(connectorId)
    if (!conn) continue

    const actions = conn.getActions()
    for (const action of actions) {
      const fullAction = `${connectorId}:${action.id}`
      if (policy.allowedActions.length > 0 && !policy.allowedActions.includes(fullAction)) continue

      tools.push({
        connector: connectorId,
        connectorName: conn.info.name,
        credentialName: policy.credential.name,
        action: action.id,
        actionName: action.name,
        description: action.description,
      })
    }
  }

  return tools
}

export async function callTool(
  agentId: string,
  connectorId: string,
  action: string,
  params: Record<string, unknown>
): Promise<BrokerCallResult> {
  const prisma = getPrisma()

  // 1. 权限检查
  const permCheck = await checkPermission({ agentId, connectorId, action, params })

  const logData = {
    agentId,
    connectorId,
    action: `${connectorId}:${action}`,
    requestSummary: sanitizeParams(params) as Prisma.InputJsonValue,
    permissionResult: permCheck.result,
  }

  if (permCheck.result !== 'ALLOWED' || !permCheck.credentialId) {
    await prisma.auditLog.create({
      data: { ...logData, responseStatus: 403 },
    })
    return {
      success: false,
      error: permCheck.message,
      permissionResult: permCheck.result,
    }
  }

  // 2. 获取 Connector
  const connector = getConnector(connectorId)
  if (!connector) {
    return { success: false, error: `未知的 connector: ${connectorId}` }
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

    return {
      success: result.success,
      data: result.data,
      error: result.error?.message,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    await prisma.auditLog.create({
      data: { ...logData, credentialId: permCheck.credentialId, responseStatus: 500, errorMessage: message },
    })
    return { success: false, error: message }
  }
}

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'secret', 'password', 'key', 'credential']
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      sensitiveKeys.some(s => k.toLowerCase().includes(s)) ? '[REDACTED]' : v,
    ])
  )
}
