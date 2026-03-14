import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter } from '../rate-limiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter()
  })

  it('should allow requests within limit', () => {
    const config = { max_calls: 3, window_seconds: 60 }

    expect(limiter.check('agent1', 'cred1', config)).toEqual({ allowed: true })
    expect(limiter.check('agent1', 'cred1', config)).toEqual({ allowed: true })
    expect(limiter.check('agent1', 'cred1', config)).toEqual({ allowed: true })
  })

  it('should deny requests exceeding limit', () => {
    const config = { max_calls: 2, window_seconds: 60 }

    limiter.check('agent1', 'cred1', config)
    limiter.check('agent1', 'cred1', config)

    const result = limiter.check('agent1', 'cred1', config)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0)
    }
  })

  it('should track different agent-credential pairs independently', () => {
    const config = { max_calls: 1, window_seconds: 60 }

    expect(limiter.check('agent1', 'cred1', config)).toEqual({ allowed: true })
    expect(limiter.check('agent2', 'cred1', config)).toEqual({ allowed: true })
    expect(limiter.check('agent1', 'cred2', config)).toEqual({ allowed: true })

    // Now agent1:cred1 should be denied
    expect(limiter.check('agent1', 'cred1', config).allowed).toBe(false)
  })

  it('should allow requests after window expires', () => {
    const config = { max_calls: 1, window_seconds: 1 }

    vi.useFakeTimers()
    limiter.check('agent1', 'cred1', config)
    expect(limiter.check('agent1', 'cred1', config).allowed).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(1100)
    expect(limiter.check('agent1', 'cred1', config)).toEqual({ allowed: true })

    vi.useRealTimers()
  })

  it('should reset all counters', () => {
    const config = { max_calls: 1, window_seconds: 60 }

    limiter.check('agent1', 'cred1', config)
    expect(limiter.check('agent1', 'cred1', config).allowed).toBe(false)

    limiter.reset()
    expect(limiter.check('agent1', 'cred1', config)).toEqual({ allowed: true })
  })

  it('should return correct retryAfterMs', () => {
    const config = { max_calls: 1, window_seconds: 60 }

    vi.useFakeTimers()
    limiter.check('agent1', 'cred1', config)

    vi.advanceTimersByTime(10_000) // 10 seconds later
    const result = limiter.check('agent1', 'cred1', config)

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      // Should be ~50 seconds remaining
      expect(result.retryAfterMs).toBeGreaterThan(49_000)
      expect(result.retryAfterMs).toBeLessThanOrEqual(50_000)
    }

    vi.useRealTimers()
  })
})
