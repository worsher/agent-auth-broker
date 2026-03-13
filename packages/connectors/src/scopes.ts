/**
 * 预定义的 scope 组，将一个 scope 名称展开为多个具体 actions
 * 格式：{ connectorId: { scopeName: [actions] } }
 */
const CONNECTOR_SCOPES: Record<string, Record<string, string[]>> = {
  github: {
    'github:read': [
      'github:list_repos',
      'github:get_repo',
      'github:list_issues',
      'github:get_issue',
      'github:list_prs',
      'github:get_file',
      'github:search_code',
    ],
    'github:write': [
      'github:create_issue',
      'github:comment_issue',
      'github:create_pr',
    ],
  },
}

/**
 * 展开 scope 组为具体 actions
 * - "*" 保持不变
 * - "github:read" 等 scope 名称展开为对应的 actions 列表
 * - 已经是具体 action（如 "github:list_repos"）则保持不变
 */
export function expandScopes(actions: string[]): string[] {
  if (actions.length === 1 && actions[0] === '*') return actions

  const expanded = new Set<string>()
  for (const action of actions) {
    // 检查是否是已知的 scope
    let found = false
    for (const scopes of Object.values(CONNECTOR_SCOPES)) {
      if (action in scopes) {
        for (const a of scopes[action]) {
          expanded.add(a)
        }
        found = true
        break
      }
    }
    if (!found) {
      expanded.add(action)
    }
  }
  return Array.from(expanded)
}

/**
 * 获取所有已知的 scope 名称
 */
export function listScopes(): Array<{ scope: string; actions: string[] }> {
  const result: Array<{ scope: string; actions: string[] }> = []
  for (const scopes of Object.values(CONNECTOR_SCOPES)) {
    for (const [scope, actions] of Object.entries(scopes)) {
      result.push({ scope, actions })
    }
  }
  return result
}
