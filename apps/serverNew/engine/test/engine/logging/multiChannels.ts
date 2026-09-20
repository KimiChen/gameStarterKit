import { log } from '../../../src/logging/log'
import { Env, Output, Level, LogOptions } from '../../../src/logging/config'

// 初始化选项，会根据 Env 和 Output 进行缺省默认设置
const opts = <LogOptions>{
    env: Env.Dev,
    output: Output.Console,
    level: Level.Info,
    channels: [
        // 2 个文件通道，当然也可以添加 console 通道
        {
            name: 'game', // 没有指定 default 则第一个为默认
            dirname: './log',
        },
        {
            name: 'orm',
            filename: 'orm_redis.log',
            dirname: './log',
        },
        {
            name: 'console',
            level: Level.Warn, // 不能小于外层的 level
            output: Output.Console,
        },
    ],
}

// 初始化日志
log.init(opts)

// 输出到文件 game.log
log.info('a very simple and easy-to-use logger')
if (log.isInfoEnabled()) {
    log.debug('debugging with level enabled')
}

// 输出到文件 orm_redis.log
log.get('game').error('this is a orm log')

// 输出到控制台
log.get('console').warn('print into stderr')

// 关闭日志，确保文件正常完成
// 不是必须调用
log.close()
