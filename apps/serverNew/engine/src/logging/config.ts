export class LoggingError extends Error {}

export interface LogOptions {
    /** 环境，默认为 dev */
    env?: Env
    /** 日志记录的时间所在时区,如果有配置，则会在输出的时间加上时差 */
    timeZone?: string
    /** 日志记录的时间所在时区时区偏移小时数，timeZone有配置这个就不需要配置  */
    timeZoneOffset?: number
    /** 缺省输出方式，默认为 console */
    output?: Output
    /** 缺省日志等级，默认为 debug */
    level?: Level
    /** 缺省日志编码方式，默认为 text */
    encoding?: Encoding
    /** 日志通道，需要包含 default 的名称 */
    channels?: Channel | Channel[]
    /** 默认日志通道，必须在 channels 中，如果 channels 为 undefined，则默认为 'default' */
    default?: string
    /** 获取通道不存在时，是否直接使用 defualt 通道，默认为 true */
    absentUseDefault?: boolean
    /** 是否打印调用者，目前无法定位准确，详见测试用例 */
    caller?: boolean
}

export interface Channel {
    /** 通道的名称 */
    name: string
    /** 通道自定义的日志等级，不能小于缺省等级 */
    level?: Level
    /** 通道自定义的输出方式 */
    output?: Output

    /** 以下配置仅在 output 为 file 时有效 */

    /** 日志输出的文件名，默认为 name */
    filename?: string
    /** 日志输出的文件夹 */
    dirname?: string
    /** 时间格式 */
    datePattern?: string
    /** 当日志文件的最大大小*/
    maxsize?: int
    /** 是否开启日志轮换，TODO 目前无用，待后续确认 */
    rotationFormat?: boolean
    /** 是否开启日志文件压缩 */
    zippedArchive?: boolean
    /** 同时保存的最大文件数  */
    maxFiles?: int
}

export enum Env {
    Dev = 'dev',
    Test = 'test',
    Prod = 'prod',
}

export enum Output {
    Console = 'console',
    File = 'file',
}

export enum Level {
    Debug = 'debug',
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
    Crit = 'crit',
}

export enum Encoding {
    Text = 'text',
    Json = 'json',
}
