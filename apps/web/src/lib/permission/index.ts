import type { PermissionCheckInput, PermissionCheckResult } from '@broker/shared-types'
import { checkPermission as coreCheckPermission } from '@broker/core'
import { prisma } from '../db/prisma'

/**
 * Web 端权限检查，委托给 @broker/core 并注入 web 的 prisma 实例
 */
export async function checkPermission(input: PermissionCheckInput): Promise<PermissionCheckResult> {
  return coreCheckPermission(input, prisma)
}
