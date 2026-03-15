import { describe, it, expect } from 'vitest'
import { getConnector, listConnectors } from '../registry'
import { slackConnector } from '../slack/index'
import { notionConnector } from '../notion/index'
import { jiraConnector } from '../jira/index'
import { linearConnector } from '../linear/index'
import { googleConnector } from '../google/index'
import { discordConnector } from '../discord/index'
import { telegramConnector } from '../telegram/index'
import { feishuConnector } from '../feishu/index'

describe('connector registry', () => {
  it('should have all 9 connectors registered', () => {
    const connectors = listConnectors()
    const ids = connectors.map(c => c.info.id)
    expect(ids).toContain('github')
    expect(ids).toContain('slack')
    expect(ids).toContain('notion')
    expect(ids).toContain('jira')
    expect(ids).toContain('linear')
    expect(ids).toContain('google')
    expect(ids).toContain('discord')
    expect(ids).toContain('telegram')
    expect(ids).toContain('feishu')
    expect(connectors).toHaveLength(9)
  })

  it('should retrieve each connector by id', () => {
    expect(getConnector('slack')).toBe(slackConnector)
    expect(getConnector('notion')).toBe(notionConnector)
    expect(getConnector('jira')).toBe(jiraConnector)
    expect(getConnector('linear')).toBe(linearConnector)
    expect(getConnector('google')).toBe(googleConnector)
    expect(getConnector('discord')).toBe(discordConnector)
    expect(getConnector('telegram')).toBe(telegramConnector)
    expect(getConnector('feishu')).toBe(feishuConnector)
  })
})

describe('slackConnector', () => {
  it('should have correct info', () => {
    expect(slackConnector.info).toEqual({
      id: 'slack',
      name: 'Slack',
      description: 'Slack workspace channels, messages, and users',
      authType: 'oauth2',
    })
  })

  it('should expose 12 actions', () => {
    const actions = slackConnector.getActions()
    expect(actions).toHaveLength(12)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('list_channels')
    expect(ids).toContain('send_message')
    expect(ids).toContain('get_messages')
    expect(ids).toContain('get_thread')
    expect(ids).toContain('add_reaction')
    expect(ids).toContain('list_users')
    expect(ids).toContain('search_messages')
    expect(ids).toContain('update_message')
  })

  it('should return error for unknown action', async () => {
    const result = await slackConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = slackConnector.getActions()
    const sendMessage = actions.find(a => a.id === 'send_message')!
    expect(sendMessage.inputSchema).toHaveProperty('required')
    expect((sendMessage.inputSchema as { required: string[] }).required).toContain('channel')
    expect((sendMessage.inputSchema as { required: string[] }).required).toContain('text')
  })
})

describe('notionConnector', () => {
  it('should have correct info', () => {
    expect(notionConnector.info).toEqual({
      id: 'notion',
      name: 'Notion',
      description: 'Notion pages, databases, and blocks',
      authType: 'oauth2',
    })
  })

  it('should expose 10 actions', () => {
    const actions = notionConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('search')
    expect(ids).toContain('get_page')
    expect(ids).toContain('create_page')
    expect(ids).toContain('update_page')
    expect(ids).toContain('get_database')
    expect(ids).toContain('query_database')
    expect(ids).toContain('get_block')
    expect(ids).toContain('get_block_children')
    expect(ids).toContain('append_block_children')
    expect(ids).toContain('delete_block')
  })

  it('should return error for unknown action', async () => {
    const result = await notionConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = notionConnector.getActions()
    const createPage = actions.find(a => a.id === 'create_page')!
    expect((createPage.inputSchema as { required: string[] }).required).toContain('parent')
    expect((createPage.inputSchema as { required: string[] }).required).toContain('properties')
  })
})

describe('jiraConnector', () => {
  it('should have correct info', () => {
    expect(jiraConnector.info).toEqual({
      id: 'jira',
      name: 'Jira',
      description: 'Jira Cloud projects, issues, and workflows',
      authType: 'api_key',
    })
  })

  it('should expose 10 actions', () => {
    const actions = jiraConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('list_projects')
    expect(ids).toContain('get_project')
    expect(ids).toContain('search_issues')
    expect(ids).toContain('get_issue')
    expect(ids).toContain('create_issue')
    expect(ids).toContain('update_issue')
    expect(ids).toContain('add_comment')
    expect(ids).toContain('get_transitions')
    expect(ids).toContain('transition_issue')
    expect(ids).toContain('assign_issue')
  })

  it('should return error for unknown action', async () => {
    const result = await jiraConnector.execute(
      'unknown_action',
      {},
      { accessToken: 'test', extraData: { domain: 'test.atlassian.net' } }
    )
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = jiraConnector.getActions()
    const createIssue = actions.find(a => a.id === 'create_issue')!
    const required = (createIssue.inputSchema as { required: string[] }).required
    expect(required).toContain('projectKey')
    expect(required).toContain('summary')
    expect(required).toContain('issueType')
  })
})

describe('linearConnector', () => {
  it('should have correct info', () => {
    expect(linearConnector.info).toEqual({
      id: 'linear',
      name: 'Linear',
      description: 'Linear project management: issues, projects, teams, and cycles',
      authType: 'api_key',
    })
  })

  it('should expose 10 actions', () => {
    const actions = linearConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('list_issues')
    expect(ids).toContain('get_issue')
    expect(ids).toContain('create_issue')
    expect(ids).toContain('update_issue')
    expect(ids).toContain('add_comment')
    expect(ids).toContain('list_teams')
    expect(ids).toContain('list_projects')
    expect(ids).toContain('get_project')
    expect(ids).toContain('list_cycles')
    expect(ids).toContain('search_issues')
  })

  it('should return error for unknown action', async () => {
    const result = await linearConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = linearConnector.getActions()
    const createIssue = actions.find(a => a.id === 'create_issue')!
    const required = (createIssue.inputSchema as { required: string[] }).required
    expect(required).toContain('teamId')
    expect(required).toContain('title')
  })
})

describe('googleConnector', () => {
  it('should have correct info', () => {
    expect(googleConnector.info).toEqual({
      id: 'google',
      name: 'Google',
      description: 'Google Workspace: Gmail, Calendar, and Drive',
      authType: 'oauth2',
    })
  })

  it('should expose 10 actions across Gmail, Calendar, and Drive', () => {
    const actions = googleConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    // Gmail
    expect(ids).toContain('gmail_list_messages')
    expect(ids).toContain('gmail_get_message')
    expect(ids).toContain('gmail_send_message')
    expect(ids).toContain('gmail_list_labels')
    // Calendar
    expect(ids).toContain('calendar_list_events')
    expect(ids).toContain('calendar_get_event')
    expect(ids).toContain('calendar_create_event')
    // Drive
    expect(ids).toContain('drive_list_files')
    expect(ids).toContain('drive_get_file')
    expect(ids).toContain('drive_search')
  })

  it('should return error for unknown action', async () => {
    const result = await googleConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = googleConnector.getActions()
    const sendEmail = actions.find(a => a.id === 'gmail_send_message')!
    const required = (sendEmail.inputSchema as { required: string[] }).required
    expect(required).toContain('to')
    expect(required).toContain('subject')
    expect(required).toContain('body')

    const createEvent = actions.find(a => a.id === 'calendar_create_event')!
    const eventRequired = (createEvent.inputSchema as { required: string[] }).required
    expect(eventRequired).toContain('summary')
    expect(eventRequired).toContain('start')
    expect(eventRequired).toContain('end')
  })
})

describe('discordConnector', () => {
  it('should have correct info', () => {
    expect(discordConnector.info).toEqual({
      id: 'discord',
      name: 'Discord',
      description: 'Discord guilds, channels, and messages',
      authType: 'api_key',
    })
  })

  it('should expose 10 actions', () => {
    const actions = discordConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('list_guilds')
    expect(ids).toContain('get_guild')
    expect(ids).toContain('list_channels')
    expect(ids).toContain('get_channel')
    expect(ids).toContain('send_message')
    expect(ids).toContain('get_messages')
    expect(ids).toContain('edit_message')
    expect(ids).toContain('add_reaction')
    expect(ids).toContain('create_thread')
    expect(ids).toContain('list_members')
  })

  it('should return error for unknown action', async () => {
    const result = await discordConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = discordConnector.getActions()
    const sendMessage = actions.find(a => a.id === 'send_message')!
    const required = (sendMessage.inputSchema as { required: string[] }).required
    expect(required).toContain('channelId')
    expect(required).toContain('content')
  })
})

describe('telegramConnector', () => {
  it('should have correct info', () => {
    expect(telegramConnector.info).toEqual({
      id: 'telegram',
      name: 'Telegram',
      description: 'Telegram Bot API: messages, chats, and files',
      authType: 'api_key',
    })
  })

  it('should expose 10 actions', () => {
    const actions = telegramConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('get_me')
    expect(ids).toContain('send_message')
    expect(ids).toContain('edit_message')
    expect(ids).toContain('delete_message')
    expect(ids).toContain('get_chat')
    expect(ids).toContain('get_chat_members_count')
    expect(ids).toContain('send_document')
    expect(ids).toContain('get_file')
    expect(ids).toContain('pin_message')
    expect(ids).toContain('get_updates')
  })

  it('should return error for unknown action', async () => {
    const result = await telegramConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = telegramConnector.getActions()
    const sendMessage = actions.find(a => a.id === 'send_message')!
    const required = (sendMessage.inputSchema as { required: string[] }).required
    expect(required).toContain('chat_id')
    expect(required).toContain('text')
  })
})

describe('feishuConnector', () => {
  it('should have correct info', () => {
    expect(feishuConnector.info).toEqual({
      id: 'feishu',
      name: 'Feishu',
      description: 'Feishu (Lark) messages, chats, docs, and calendar',
      authType: 'api_key',
    })
  })

  it('should expose 10 actions', () => {
    const actions = feishuConnector.getActions()
    expect(actions).toHaveLength(10)
    const ids = actions.map(a => a.id)
    expect(ids).toContain('send_message')
    expect(ids).toContain('get_message')
    expect(ids).toContain('reply_message')
    expect(ids).toContain('list_chats')
    expect(ids).toContain('get_chat')
    expect(ids).toContain('search_docs')
    expect(ids).toContain('get_doc_content')
    expect(ids).toContain('list_events')
    expect(ids).toContain('create_event')
    expect(ids).toContain('get_user')
  })

  it('should return error for unknown action', async () => {
    const result = await feishuConnector.execute('unknown_action', {}, { accessToken: 'test' })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_ACTION')
  })

  it('should have required fields in action schemas', () => {
    const actions = feishuConnector.getActions()
    const sendMessage = actions.find(a => a.id === 'send_message')!
    const required = (sendMessage.inputSchema as { required: string[] }).required
    expect(required).toContain('receive_id_type')
    expect(required).toContain('receive_id')
    expect(required).toContain('msg_type')
    expect(required).toContain('content')
  })
})
