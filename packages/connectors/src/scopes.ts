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
  slack: {
    'slack:read': [
      'slack:list_channels',
      'slack:get_channel',
      'slack:get_messages',
      'slack:get_thread',
      'slack:list_users',
      'slack:get_user',
      'slack:search_messages',
    ],
    'slack:write': [
      'slack:send_message',
      'slack:update_message',
      'slack:add_reaction',
      'slack:set_topic',
      'slack:upload_file',
    ],
  },
  notion: {
    'notion:read': [
      'notion:search',
      'notion:get_page',
      'notion:get_database',
      'notion:query_database',
      'notion:get_block',
      'notion:get_block_children',
    ],
    'notion:write': [
      'notion:create_page',
      'notion:update_page',
      'notion:append_block_children',
      'notion:delete_block',
    ],
  },
  jira: {
    'jira:read': [
      'jira:list_projects',
      'jira:get_project',
      'jira:search_issues',
      'jira:get_issue',
      'jira:get_transitions',
    ],
    'jira:write': [
      'jira:create_issue',
      'jira:update_issue',
      'jira:add_comment',
      'jira:transition_issue',
      'jira:assign_issue',
    ],
  },
  linear: {
    'linear:read': [
      'linear:list_issues',
      'linear:get_issue',
      'linear:list_teams',
      'linear:list_projects',
      'linear:get_project',
      'linear:list_cycles',
      'linear:search_issues',
    ],
    'linear:write': [
      'linear:create_issue',
      'linear:update_issue',
      'linear:add_comment',
    ],
  },
  google: {
    'google:gmail_read': [
      'google:gmail_list_messages',
      'google:gmail_get_message',
      'google:gmail_list_labels',
    ],
    'google:gmail_write': [
      'google:gmail_send_message',
    ],
    'google:calendar_read': [
      'google:calendar_list_events',
      'google:calendar_get_event',
    ],
    'google:calendar_write': [
      'google:calendar_create_event',
    ],
    'google:drive_read': [
      'google:drive_list_files',
      'google:drive_get_file',
      'google:drive_search',
    ],
  },
  discord: {
    'discord:read': [
      'discord:list_guilds',
      'discord:get_guild',
      'discord:list_channels',
      'discord:get_channel',
      'discord:get_messages',
      'discord:list_members',
    ],
    'discord:write': [
      'discord:send_message',
      'discord:edit_message',
      'discord:add_reaction',
      'discord:create_thread',
    ],
  },
  telegram: {
    'telegram:read': [
      'telegram:get_me',
      'telegram:get_chat',
      'telegram:get_chat_members_count',
      'telegram:get_file',
      'telegram:get_updates',
    ],
    'telegram:write': [
      'telegram:send_message',
      'telegram:edit_message',
      'telegram:delete_message',
      'telegram:send_document',
      'telegram:pin_message',
    ],
  },
  feishu: {
    'feishu:read': [
      'feishu:get_message',
      'feishu:list_chats',
      'feishu:get_chat',
      'feishu:search_docs',
      'feishu:get_doc_content',
      'feishu:list_events',
      'feishu:get_user',
    ],
    'feishu:write': [
      'feishu:send_message',
      'feishu:reply_message',
      'feishu:create_event',
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
