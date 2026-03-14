#!/usr/bin/env node

import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { validateCommand } from './commands/validate.js'
import { diagnoseCommand } from './commands/diagnose.js'
import { serveCommand } from './commands/serve.js'
import { credentialCommand } from './commands/credential.js'
import { agentCommand } from './commands/agent.js'
import { policyCommand } from './commands/policy.js'
import { uiCommand } from './commands/ui.js'
import { tokenCommand } from './commands/token.js'
import { testCommand } from './commands/test.js'

const program = new Command()

program
  .name('broker')
  .description('Agent Auth Broker CLI — AI Agent 凭证管理与授权代理')
  .version(PKG_VERSION)

program.addCommand(initCommand)
program.addCommand(validateCommand)
program.addCommand(diagnoseCommand)
program.addCommand(serveCommand)
program.addCommand(credentialCommand)
program.addCommand(agentCommand)
program.addCommand(policyCommand)
program.addCommand(uiCommand)
program.addCommand(tokenCommand)
program.addCommand(testCommand)

program.parse()
