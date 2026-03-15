import { isIP } from 'node:net'

/**
 * 将 IPv4 地址转换为 32 位数字
 */
function ipv4ToLong(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/**
 * 检查 IP 是否匹配 CIDR 或精确 IP
 * 支持格式：
 * - 精确 IP：192.168.1.1
 * - CIDR：192.168.1.0/24
 * - IPv6 精确匹配（不支持 CIDR）
 */
function matchIp(clientIp: string, pattern: string): boolean {
  // CIDR 格式
  if (pattern.includes('/')) {
    const [network, prefixStr] = pattern.split('/')
    const prefix = parseInt(prefixStr, 10)

    // 仅支持 IPv4 CIDR
    if (isIP(network) !== 4 || isIP(clientIp) !== 4) return false
    if (prefix < 0 || prefix > 32) return false

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    return (ipv4ToLong(clientIp) & mask) === (ipv4ToLong(network) & mask)
  }

  // 精确匹配
  return clientIp === pattern
}

/**
 * 检查客户端 IP 是否在白名单中
 * @param clientIp 客户端 IP 地址
 * @param allowedIps 白名单列表（支持 CIDR 和精确 IP）
 */
export function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  return allowedIps.some(pattern => matchIp(clientIp, pattern))
}
