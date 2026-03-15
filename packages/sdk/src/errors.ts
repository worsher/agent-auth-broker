/**
 * Broker SDK 错误基类
 */
export class BrokerError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'BrokerError'
    this.status = status
    this.code = code
  }
}

/**
 * 认证失败（401）：Agent Token 无效或缺失
 */
export class AuthenticationError extends BrokerError {
  constructor(message: string = 'Invalid or missing agent token') {
    super(message, 401, 'AUTHENTICATION_ERROR')
    this.name = 'AuthenticationError'
  }
}

/**
 * 权限拒绝（403）：Agent 没有执行该操作的权限
 */
export class PermissionDeniedError extends BrokerError {
  readonly permissionResult: string

  constructor(message: string, permissionResult: string) {
    super(message, 403, 'PERMISSION_DENIED')
    this.name = 'PermissionDeniedError'
    this.permissionResult = permissionResult
  }
}

/**
 * API 错误：Broker 返回的非 2xx 响应
 */
export class BrokerApiError extends BrokerError {
  constructor(message: string, status: number) {
    super(message, status, 'API_ERROR')
    this.name = 'BrokerApiError'
  }
}

/**
 * 网络错误：连接失败、超时等
 */
export class NetworkError extends BrokerError {
  constructor(message: string) {
    super(message, 0, 'NETWORK_ERROR')
    this.name = 'NetworkError'
  }
}
