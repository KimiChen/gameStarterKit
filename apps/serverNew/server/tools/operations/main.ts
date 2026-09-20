import { E_APP_TYPE } from '@arthropoda/game-engine'
import { program } from 'commander'
import * as commands from './commands'
import { initializeApplication } from '../../src/startup/initializeApplication'

program.option('-c | --cmd <string>', '命令', '')

async function start() {
    await initializeApplication({ appType: E_APP_TYPE.DEFAULT })
    await toolMain()
}
start().catch((err) => Log.error(err))

function helpTip() {
    const tip = `
Version 0.0.1
Usage:
    pnpm operations -- -p bearjoy -v dev -c [item of Command list]
    -c    执行对应的命令 
    -p    平台 (对应游戏的platform)
    -v    环境 (对应游戏的version)
Command list:
    migrationRun    执行数据库迁移 
    errorLogPush    启动进程日志推送到企业微信
    repair          执行修复脚本
`
    console.log(tip)
}

async function toolMain() {
    program.parse()
    // 初始化平台和版本
    const functionName = program.getOptionValue('cmd')
    if (!functionName) {
        helpTip()
        return
    }

    if (typeof (commands as any).functionName == 'function') {
        console.log(`commands:${functionName} 不存在`)
        return
    }
    await (commands as any)[functionName]()
}
