// 简单内存 state 存储（生产环境应用 Redis 替代）
export const stateStore = new Map<string, { userId: string; expiresAt: number }>()
