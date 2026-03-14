import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/crypto',
  'packages/connectors',
  'packages/local-runtime',
])
