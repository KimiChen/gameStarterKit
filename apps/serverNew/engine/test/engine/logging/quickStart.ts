import { log } from '../../../src/logging/log'
import { Output } from '../../../src/logging/config'

// 没有任何选项，初始化日志级别为 debug 的 default 通道的 logger
// 默认输出为控制台方式
// 关于 caller：只有在第 1，2 种方式可以准确定位
log.init({ output: Output.Console, timeZone: 'Asia/Tokyo' })
// 1. 使用 default 通道进行输出
log.debug('使用日本时区')
log.init({ output: Output.Console, timeZoneOffset: 8 })
// 1. 使用 default 通道进行输出
log.debug('使用UTC+8')
// 2. 使用日志级别判断后输出
if (log.isDebugEnabled()) {
    log.debug('debugging with level enabled')
    // 2023-08-25 18:50:24.830 debug quickStart.ts:12 : debugging with level enabled
}

// 3. 使用占位符动词的方式输出
// 此方法可以省略 log.isWarnEnable 方法判断
log.warn('%s And %s', 'Tom', 'Jerry')
// 2023-08-25 18:50:24.833 warn log.ts:64 : Tom And Jerry

// 4. 等同与 log.info
log.get('default').info('similar to log.info')
// 2023-08-25 18:50:24.835 info loader:1256 : similar to log.info

// 5. 必须要在 log.init 时进行指定
log.get('alice').info('hello, alice')
// LoggingError: get: 没有找到指定的 alice 通道
