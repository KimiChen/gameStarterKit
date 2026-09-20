/**
 * 业务日志需要使用的通道需要在此定义
 * 主要用于全局 Log 对象 global.Log 代码提示
 * 例如：Log.console.debug('xxxxx')
 *
 * 也需要结合 platform 配置使用
 * 如此处枚举和 platform 配置不一致则：
 *  1. platform 配置不存在，打印入默认通道
 *  2. 此处枚举不存在，则无法通过代码提示使用
 *
 * 最终的名字，为了符合代码风格，会转换为小写
 */
export enum LogChannels {
    Console,
    Http,
    Game,
    Orm,
    Net,
    Redis,
    Monitor,
    WebAdjust,
    Exception,
    Pay,
}
