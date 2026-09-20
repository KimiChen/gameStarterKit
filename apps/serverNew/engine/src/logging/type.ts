import { LeveledLogMethod } from 'winston'
import { LogOptions } from './config'

type LevelEnabledMethod = () => boolean
/** 第一个参数可以为：
 * 1.字符串，args为其格式化参数%s%d,
 * 2.可以返回string的函数，args为其参数，
 * 3.其他可以直接转为string的数值，args没用
 * */
type LogMethod = (message: any|Function, ...args: any[]) => void

export interface Logger {
    crit: LogMethod
    /** 线上代码不会打印调用位置,最好带一个调用前缀方便定位bug,例如 Log.error("myInvoke:%s", your object) */
    error: LogMethod
    warn: LogMethod
    info: LogMethod
    debug: LogMethod

    isErrorEnabled: LevelEnabledMethod
    isWarnEnabled: LevelEnabledMethod
    isInfoEnabled: LevelEnabledMethod
    isDebugEnabled: LevelEnabledMethod
}

export type LowercaseChannelLogger<K extends keyof any> = {
    [P in K extends string ? Exclude<Lowercase<K>, keyof LogHandler> : never]: Logger
}

export interface LogHandler extends Logger{
    init: (options?: LogOptions) => void
    close: () => void
    get: (name: string) => Logger
}

export type LogProxy<T> = LogHandler & LowercaseChannelLogger<keyof T>
