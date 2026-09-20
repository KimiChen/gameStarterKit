import {Level, LogOptions, Output} from '../../../src/logging/config'
import {log} from '../../../src/logging/log'

// 初始化选项，会根据 Env 和 Output 进行缺省默认设置
const opts = <LogOptions>{
    output: Output.File,
    level: Level.Debug,
    channels: [
        // 2 个文件通道，当然也可以添加 console 通道
        {
            name: 'game', // 没有指定 default 则第一个为默认
            dirname: './log',
        },
        {
            name: 'console',
        },
    ],
}
global.SERVICE_NAME = 's9'
// 初始化日志
log.init(opts)
const num = 11
//第一个参数为函数
Log.console.debug(()=> num+'ss')
//函数参数有参数
Log.debug((nn:number)=> nn+'ss', num)
Log.console.debug('格式化%d,%s', 123, 456)
//其他参数
Log.console.debug([123,[333,444]])
Log.console.debug(Buffer.from([65,66,48]))
Log.isDebugEnabled() &&
Log.debug('Log debug1', 1, 2, 3)
Log.get('console').debug(`get('console')`)
// 使用全局 Log 访问 console 通道
// 等同于 Log.get('console').debug(xxx)
Log.console.debug('logging via global parameter')

// 使用全局 Log 访问默认通道打印 debug 级别日志
Log.debug('logging use default channel')
