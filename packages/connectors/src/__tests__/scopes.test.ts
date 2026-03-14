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
    expect(scopes.length).toBeGreaterThanOrEqual(2)

    const names = scopes.map(s => s.scope)
    expect(names).toContain('github:read')
    expect(names).toContain('github:write')
  })

  it('should include actions for each scope', () => {
    const scopes = listScopes()
    for (const s of scopes) {
      expect(s.actions.length).toBeGreaterThan(0)
    }
  })
})
