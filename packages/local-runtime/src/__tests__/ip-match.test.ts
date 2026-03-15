import { describe, it, expect } from 'vitest'
import { isIpAllowed } from '../ip-match'

describe('isIpAllowed', () => {
  it('should match exact IPv4', () => {
    expect(isIpAllowed('192.168.1.1', ['192.168.1.1'])).toBe(true)
    expect(isIpAllowed('192.168.1.2', ['192.168.1.1'])).toBe(false)
  })

  it('should match CIDR /24', () => {
    expect(isIpAllowed('10.0.0.1', ['10.0.0.0/24'])).toBe(true)
    expect(isIpAllowed('10.0.0.255', ['10.0.0.0/24'])).toBe(true)
    expect(isIpAllowed('10.0.1.0', ['10.0.0.0/24'])).toBe(false)
  })

  it('should match CIDR /16', () => {
    expect(isIpAllowed('172.16.0.1', ['172.16.0.0/16'])).toBe(true)
    expect(isIpAllowed('172.16.255.255', ['172.16.0.0/16'])).toBe(true)
    expect(isIpAllowed('172.17.0.1', ['172.16.0.0/16'])).toBe(false)
  })

  it('should match CIDR /32 (single host)', () => {
    expect(isIpAllowed('1.2.3.4', ['1.2.3.4/32'])).toBe(true)
    expect(isIpAllowed('1.2.3.5', ['1.2.3.4/32'])).toBe(false)
  })

  it('should match CIDR /0 (all IPs)', () => {
    expect(isIpAllowed('1.2.3.4', ['0.0.0.0/0'])).toBe(true)
    expect(isIpAllowed('255.255.255.255', ['0.0.0.0/0'])).toBe(true)
  })

  it('should match against multiple patterns', () => {
    const allowed = ['10.0.0.0/8', '192.168.1.100']
    expect(isIpAllowed('10.1.2.3', allowed)).toBe(true)
    expect(isIpAllowed('192.168.1.100', allowed)).toBe(true)
    expect(isIpAllowed('172.16.0.1', allowed)).toBe(false)
  })

  it('should match exact IPv6', () => {
    expect(isIpAllowed('::1', ['::1'])).toBe(true)
    expect(isIpAllowed('::1', ['::2'])).toBe(false)
  })

  it('should return false for empty allowedIps', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(false)
  })
})
