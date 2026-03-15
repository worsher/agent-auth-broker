import { describe, it, expect } from 'vitest'
import { expandScopes, listScopes } from '../scopes'

describe('expandScopes', () => {
  it('should keep wildcard "*" as-is', () => {
    expect(expandScopes(['*'])).toEqual(['*'])
  })

  it('should expand github:read to all read actions', () => {
    const result = expandScopes(['github:read'])
    expect(result).toContain('github:list_repos')
    expect(result).toContain('github:get_repo')
    expect(result).toContain('github:list_issues')
    expect(result).toContain('github:get_issue')
    expect(result).toContain('github:list_prs')
    expect(result).toContain('github:get_file')
    expect(result).toContain('github:search_code')
    expect(result).toHaveLength(7)
  })

  it('should expand github:write to all write actions', () => {
    const result = expandScopes(['github:write'])
    expect(result).toContain('github:create_issue')
    expect(result).toContain('github:comment_issue')
    expect(result).toContain('github:create_pr')
    expect(result).toHaveLength(3)
  })

  it('should expand multiple scopes and deduplicate', () => {
    const result = expandScopes(['github:read', 'github:write'])
    expect(result).toHaveLength(10) // 7 read + 3 write
  })

  it('should expand slack:read to all read actions', () => {
    const result = expandScopes(['slack:read'])
    expect(result).toContain('slack:list_channels')
    expect(result).toContain('slack:get_channel')
    expect(result).toContain('slack:get_messages')
    expect(result).toContain('slack:get_thread')
    expect(result).toContain('slack:list_users')
    expect(result).toContain('slack:get_user')
    expect(result).toContain('slack:search_messages')
    expect(result).toHaveLength(7)
  })

  it('should expand slack:write to all write actions', () => {
    const result = expandScopes(['slack:write'])
    expect(result).toContain('slack:send_message')
    expect(result).toContain('slack:update_message')
    expect(result).toContain('slack:add_reaction')
    expect(result).toContain('slack:set_topic')
    expect(result).toContain('slack:upload_file')
    expect(result).toHaveLength(5)
  })

  it('should expand notion:read to all read actions', () => {
    const result = expandScopes(['notion:read'])
    expect(result).toContain('notion:search')
    expect(result).toContain('notion:get_page')
    expect(result).toContain('notion:get_database')
    expect(result).toContain('notion:query_database')
    expect(result).toContain('notion:get_block')
    expect(result).toContain('notion:get_block_children')
    expect(result).toHaveLength(6)
  })

  it('should expand notion:write to all write actions', () => {
    const result = expandScopes(['notion:write'])
    expect(result).toContain('notion:create_page')
    expect(result).toContain('notion:update_page')
    expect(result).toContain('notion:append_block_children')
    expect(result).toContain('notion:delete_block')
    expect(result).toHaveLength(4)
  })

  it('should expand jira:read to all read actions', () => {
    const result = expandScopes(['jira:read'])
    expect(result).toContain('jira:list_projects')
    expect(result).toContain('jira:get_project')
    expect(result).toContain('jira:search_issues')
    expect(result).toContain('jira:get_issue')
    expect(result).toContain('jira:get_transitions')
    expect(result).toHaveLength(5)
  })

  it('should expand jira:write to all write actions', () => {
    const result = expandScopes(['jira:write'])
    expect(result).toContain('jira:create_issue')
    expect(result).toContain('jira:update_issue')
    expect(result).toContain('jira:add_comment')
    expect(result).toContain('jira:transition_issue')
    expect(result).toContain('jira:assign_issue')
    expect(result).toHaveLength(5)
  })

  it('should expand linear:read to all read actions', () => {
    const result = expandScopes(['linear:read'])
    expect(result).toContain('linear:list_issues')
    expect(result).toContain('linear:get_issue')
    expect(result).toContain('linear:list_teams')
    expect(result).toContain('linear:list_projects')
    expect(result).toContain('linear:get_project')
    expect(result).toContain('linear:list_cycles')
    expect(result).toContain('linear:search_issues')
    expect(result).toHaveLength(7)
  })

  it('should expand linear:write to all write actions', () => {
    const result = expandScopes(['linear:write'])
    expect(result).toContain('linear:create_issue')
    expect(result).toContain('linear:update_issue')
    expect(result).toContain('linear:add_comment')
    expect(result).toHaveLength(3)
  })

  it('should expand google:gmail_read to Gmail read actions', () => {
    const result = expandScopes(['google:gmail_read'])
    expect(result).toContain('google:gmail_list_messages')
    expect(result).toContain('google:gmail_get_message')
    expect(result).toContain('google:gmail_list_labels')
    expect(result).toHaveLength(3)
  })

  it('should expand google:calendar_write to Calendar write actions', () => {
    const result = expandScopes(['google:calendar_write'])
    expect(result).toContain('google:calendar_create_event')
    expect(result).toHaveLength(1)
  })

  it('should expand google:drive_read to Drive read actions', () => {
    const result = expandScopes(['google:drive_read'])
    expect(result).toContain('google:drive_list_files')
    expect(result).toContain('google:drive_get_file')
    expect(result).toContain('google:drive_search')
    expect(result).toHaveLength(3)
  })

  it('should expand discord:read to all read actions', () => {
    const result = expandScopes(['discord:read'])
    expect(result).toContain('discord:list_guilds')
    expect(result).toContain('discord:get_guild')
    expect(result).toContain('discord:list_channels')
    expect(result).toContain('discord:get_channel')
    expect(result).toContain('discord:get_messages')
    expect(result).toContain('discord:list_members')
    expect(result).toHaveLength(6)
  })

  it('should expand discord:write to all write actions', () => {
    const result = expandScopes(['discord:write'])
    expect(result).toContain('discord:send_message')
    expect(result).toContain('discord:edit_message')
    expect(result).toContain('discord:add_reaction')
    expect(result).toContain('discord:create_thread')
    expect(result).toHaveLength(4)
  })

  it('should expand telegram:read to all read actions', () => {
    const result = expandScopes(['telegram:read'])
    expect(result).toContain('telegram:get_me')
    expect(result).toContain('telegram:get_chat')
    expect(result).toContain('telegram:get_chat_members_count')
    expect(result).toContain('telegram:get_file')
    expect(result).toContain('telegram:get_updates')
    expect(result).toHaveLength(5)
  })

  it('should expand telegram:write to all write actions', () => {
    const result = expandScopes(['telegram:write'])
    expect(result).toContain('telegram:send_message')
    expect(result).toContain('telegram:edit_message')
    expect(result).toContain('telegram:delete_message')
    expect(result).toContain('telegram:send_document')
    expect(result).toContain('telegram:pin_message')
    expect(result).toHaveLength(5)
  })

  it('should expand feishu:read to all read actions', () => {
    const result = expandScopes(['feishu:read'])
    expect(result).toContain('feishu:get_message')
    expect(result).toContain('feishu:list_chats')
    expect(result).toContain('feishu:get_chat')
    expect(result).toContain('feishu:search_docs')
    expect(result).toContain('feishu:get_doc_content')
    expect(result).toContain('feishu:list_events')
    expect(result).toContain('feishu:get_user')
    expect(result).toHaveLength(7)
  })

  it('should expand feishu:write to all write actions', () => {
    const result = expandScopes(['feishu:write'])
    expect(result).toContain('feishu:send_message')
    expect(result).toContain('feishu:reply_message')
    expect(result).toContain('feishu:create_event')
    expect(result).toHaveLength(3)
  })

  it('should keep concrete actions unchanged', () => {
    const result = expandScopes(['github:list_repos', 'github:create_issue'])
    expect(result).toEqual(['github:list_repos', 'github:create_issue'])
  })

  it('should mix scopes and concrete actions', () => {
    const result = expandScopes(['github:read', 'github:create_issue'])
    expect(result).toContain('github:list_repos')
    expect(result).toContain('github:create_issue')
    // github:create_issue 不重复
    const createIssueCount = result.filter(a => a === 'github:create_issue').length
    expect(createIssueCount).toBe(1)
  })

  it('should handle unknown actions as pass-through', () => {
    const result = expandScopes(['custom:action'])
    expect(result).toEqual(['custom:action'])
  })

  it('should handle empty array', () => {
    expect(expandScopes([])).toEqual([])
  })
})

describe('listScopes', () => {
  it('should return all predefined scopes', () => {
    const scopes = listScopes()
    expect(scopes.length).toBeGreaterThanOrEqual(19)

    const names = scopes.map(s => s.scope)
    expect(names).toContain('github:read')
    expect(names).toContain('github:write')
    expect(names).toContain('slack:read')
    expect(names).toContain('slack:write')
    expect(names).toContain('notion:read')
    expect(names).toContain('notion:write')
    expect(names).toContain('jira:read')
    expect(names).toContain('jira:write')
    expect(names).toContain('linear:read')
    expect(names).toContain('linear:write')
    expect(names).toContain('google:gmail_read')
    expect(names).toContain('google:calendar_read')
    expect(names).toContain('google:drive_read')
    expect(names).toContain('discord:read')
    expect(names).toContain('discord:write')
    expect(names).toContain('telegram:read')
    expect(names).toContain('telegram:write')
    expect(names).toContain('feishu:read')
    expect(names).toContain('feishu:write')
  })

  it('should include actions for each scope', () => {
    const scopes = listScopes()
    for (const s of scopes) {
      expect(s.actions.length).toBeGreaterThan(0)
    }
  })
})
