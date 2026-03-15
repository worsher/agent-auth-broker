const counters = new Map<string, number>()
const histograms = new Map<string, number[]>()
const startedAt = Date.now()

export const METRIC = {
  REQUEST_TOTAL: 'request.total',
  REQUEST_ERROR: 'request.error',
  PERMISSION_ALLOWED: 'permission.allowed',
  PERMISSION_DENIED: 'permission.denied',
  TOKEN_REFRESH_SUCCESS: 'token_refresh.success',
  TOKEN_REFRESH_FAILURE: 'token_refresh.failure',
  TOKEN_REFRESH_DEDUP: 'token_refresh.dedup',
  CREDENTIAL_ACCESS: 'credential.access',
  CREDENTIAL_INACTIVE: 'credential.inactive',
  TOOL_CALL_SUCCESS: 'tool_call.success',
  TOOL_CALL_ERROR: 'tool_call.error',
  REQUEST_DURATION_MS: 'request.duration_ms',
  TOOL_CALL_DURATION_MS: 'tool_call.duration_ms',
} as const

export function incrementCounter(name: string, delta = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + delta)
}

export function recordHistogram(name: string, value: number): void {
  let arr = histograms.get(name)
  if (!arr) {
    arr = []
    histograms.set(name, arr)
  }
  arr.push(value)
  if (arr.length > 1000) {
    arr.splice(0, arr.length - 1000)
  }
}

function computeStats(values: number[]) {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const count = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    count,
    min: sorted[0],
    max: sorted[count - 1],
    avg: Math.round(sum / count),
    p50: sorted[Math.floor(count * 0.5)],
    p95: sorted[Math.floor(count * 0.95)],
    p99: sorted[Math.floor(count * 0.99)],
  }
}

export interface MetricsSnapshot {
  uptimeSeconds: number
  counters: Record<string, number>
  histograms: Record<string, ReturnType<typeof computeStats>>
}

export function getMetrics(): MetricsSnapshot {
  const counterObj: Record<string, number> = {}
  for (const [k, v] of counters) counterObj[k] = v

  const histObj: Record<string, ReturnType<typeof computeStats>> = {}
  for (const [k, v] of histograms) histObj[k] = computeStats(v)

  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: counterObj,
    histograms: histObj,
  }
}

export function resetMetrics(): void {
  counters.clear()
  histograms.clear()
}
