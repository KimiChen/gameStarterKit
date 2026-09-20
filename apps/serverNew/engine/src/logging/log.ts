import { Logger as WLogger, LoggerOptions, createLogger, format, transports, LeveledLogMethod } from 'winston'
const { combine, colorize, printf, prettyPrint, splat, errors, json } = format

import Transport from 'winston-transport'
import { Format } from 'logform'
import 'winston-daily-rotate-file'

import moment from 'moment-timezone'

import { LogOptions, Env, Output, Level, Encoding, Channel, LoggingError } from './config'
import { LogProxy, Logger, LogHandler } from './type'

const all: { [name: string]: LogWrap } = {}
let def: LogWrap
const prototypes: LogWrap[] = []

export class LogWrap {
    def: WLogger

    constructor(def: WLogger) {
        this.def = def
    }

    crit(message: any, ...args: any[]): void {
        if (typeof message === 'function') {
            this.def.crit(message(...args))
        } else {
            this.def.crit(message, ...args)
        }
    }

    error(message: any, ...args: any[]): void {
        if (typeof message === 'function') {
            this.def.error(message(...args))
        } else {
            this.def.error(message, ...args)
        }
    }

    warn(message: any, ...args: any[]): void {
        if (this.def.isWarnEnabled()) {
            if (typeof message === 'function') {
                this.def.warn(message(...args))
            } else {
                this.def.warn(message, ...args)
            }
        }
    }

    info(message: any, ...args: any[]): void {
        if (this.def.isInfoEnabled()) {
            if (typeof message === 'function') {
                this.def.info(message(...args))
            } else {
                this.def.info(message, ...args)
            }
        }
    }

    debug(message: any, ...args: any[]): void {
        if (this.def.isDebugEnabled()) {
            if (typeof message === 'function') {
                this.def.debug(message(...args))
            } else {
                this.def.debug(message, ...args)
            }
        }
    }

    isErrorEnabled(): boolean {
        return this.def.isErrorEnabled()
    }

    isWarnEnabled(): boolean {
        return this.def.isWarnEnabled()
    }

    isInfoEnabled(): boolean {
        return this.def.isInfoEnabled()
    }

    isDebugEnabled(): boolean {
        return this.def.isDebugEnabled()
    }

    close() {
        this.def.close()
    }
}

/** 与系统时区比，日志记录的偏移小时数 */
let hourOffset = 0

class LogDefault extends LogWrap implements LogHandler {
    options: LogOptions = {}

    init(options?: LogOptions): void {
        if (!options) {
            options = {}
        }
        fillOptions(options)
        this.options = { ...options }

        for (const chan of options.channels as Channel[]) {
            const opts: LoggerOptions = {
                level: options.level,
                format: combineFormat(options),
            }

            opts.transports = createTransport(chan)
            const logger = createLogger(opts)
            const log = new LogWrap(logger)
            if (chan.name == options.default) {
                this.def = logger
                def = log
            }
            all[chan.name] = log
            prototypes.push(log)
        }
        global.Log = log as any
        const oldHourOffset = -new Date().getTimezoneOffset() / 60
        if (options.timeZone) {
            options.timeZoneOffset = moment().tz(options.timeZone).utcOffset() / 60
            hourOffset = options.timeZoneOffset - oldHourOffset
            log.warn(
                '记录日志时间使用时区:' +
                options.timeZone +
                ', UTC' +
                (options.timeZoneOffset >= 0 ? '+' : '') +
                options.timeZoneOffset,
            )
        } else if (options.timeZoneOffset !== undefined) {
            hourOffset = options.timeZoneOffset - oldHourOffset
            log.warn('记录日志时间使用时区偏移:UTC' + (options.timeZoneOffset >= 0 ? '+' : '') + options.timeZone)
        }
    }

    close() {
        if (prototypes.length > 0) {
            for (const logger of prototypes) {
                logger.close()
            }
        }
    }

    get(name: string): Logger {
        const logger = all[name]
        if (!logger && !this.options.absentUseDefault) {
            throw new LoggingError(`logging: channel '${name}' not found`)
        }
        return (logger || def) as unknown as Logger
    }
}

// @ts-ignore
const logProxy = new LogDefault(undefined)

export const log = new Proxy<LogProxy<{}>>(logProxy as LogProxy<{}>, {
    get(target, arg) {
        if (arg in target) {
            return target[arg as keyof LogProxy<{}>]
        }
        return target.get(arg as string)
    },
})

function fillOptions(options: LogOptions) {
    if (!options.env || !Object.values(Env).includes(options.env)) {
        // printDefaultLog('Env', Env.Dev, options.env)
        options.env = Env.Dev
    }
    if (!options.level || !Object.values(Level).includes(options.level)) {
        // printDefaultLog('Level', Level.Debug, options.level)
        options.level = Level.Debug
    }
    if (!options.output || !Object.values(Output).includes(options.output)) {
        // printDefaultLog('Output', Output.Console, options.output)
        options.output = Output.Console
    }
    if (!options.encoding || !Object.values(Encoding).includes(options.encoding)) {
        // printDefaultLog('Encoding', Encoding.Text, options.encoding)
        options.encoding = Encoding.Text
    }

    if (!options.channels) {
        options.channels = {
            name: 'default',
        }
    }

    if (!Array.isArray(options.channels)) {
        options.channels = [options.channels]
    }

    for (const chan of options.channels) {
        checkChannel(options, chan)
    }
    checkDefaultExists(options.default as string, options.channels)

    if (options.caller == undefined && options.env !== Env.Prod) {
        options.caller = true
    }

    if (options.absentUseDefault == undefined) {
        options.absentUseDefault = true
    }
}

function printDefaultLog(name: string, use: string, current?: unknown): void {
    console.info(
        `logging: ${current ? `invaild ${name} '${current}'` : `no ${name} specified`}, use '${use}' as default`,
    )
}

function createTransport(chan: Channel): Transport {
    if (chan.output == Output.File) {
        return new transports.DailyRotateFile({
            // format: fmt, 只有在该transport专用的format时才需要设置该参数,否则应该在createLogger传参
            level: chan.level,
            filename: chan.filename,
            dirname: getLogDirectory(chan.dirname),
            datePattern: chan.datePattern ?? 'YYYY-MM-DD',
            // maxsize: chan.maxsize,
            zippedArchive: chan.zippedArchive,
            maxFiles: chan.maxFiles ?? 30,
        })
    }

    return new transports.Console({
        // format: fmt, 只有在该transport专用的format时才需要设置该参数,否则应该在createLogger传参
        level: chan.level,
    })
}

function getLogDirectory(dirname?: string) {
    const root = dirname ?? '.'
    if (typeof SERVER_ID !== 'undefined') {
        return `${root}/${SERVER_ID}`
    }
    if (typeof SERVICE_NAME !== 'undefined') {
        return `${root}/${SERVICE_NAME}`
    }
    return root
}

function checkChannel(options: LogOptions, chan: Channel) {
    if (chan.output == undefined) {
        chan.output = options.output
    }
    if (!chan.level) {
        chan.level = options.level
    }
    if (chan.output === Output.File && !chan.filename) {
        chan.filename = chan.name + '.log'
    }

    if (!options.default) {
        options.default = chan.name
    }
}

function checkDefaultExists(name: string, chans: Channel[]) {
    for (const chan of chans) {
        if (chan.name == name) {
            return
        }
    }
    throw new LoggingError(`logging: default channel '${name}' not found`)
}

function combineFormat(options: LogOptions): Format {
    const fmts: Format[] = [errors({ stack: true }), splat(), localDateTime(options)]

    if (options.output == Output.Console) {
        fmts.push(colorize(), prettyPrint())
    }

    if (options.encoding == Encoding.Text) {
        fmts.push(textFormat(options.caller))
    } else if (options.encoding == Encoding.Json) {
        fmts.push(json())
    }

    return combine(...fmts)
}

function textFormat(needCaller?: boolean): Format {
    return printf(({ level, message, timestamp, stack }) => {
        let caller = undefined
        if (needCaller === true) {
            caller = parserCaller(stack as string | undefined)
        }

        caller = caller ? ` ${caller}` : ''
        stack = stack ? `\n${stack}` : ''
        return `${timestamp} ${level}${caller}: ${message}${stack}`
    })
}

const unknownCaller: string = 'unknown'

function parserCaller(stack?: string): string {
    let ignoreLine = 1
    let lines: string[]
    if (!stack) {
        const oldLimit = Error.stackTraceLimit
        Error.stackTraceLimit = Infinity

        stack = new Error().stack
        Error.stackTraceLimit = oldLimit
        if (!stack) {
            return unknownCaller
        }
        lines = stack.split('\n')
        for (let i = lines.length - 1; i > 0; i--) {
            const line = lines[i]
            if (
                line.startsWith('    at LogWrap.') ||
                line.startsWith('    at DerivedLogger.') ||
                line.startsWith('    at Proxy.')
            ) {
                ignoreLine = i + 1
                break
            }
        }
    } else {
        lines = stack.split('\n')
    }

    if (lines.length < ignoreLine) {
        return unknownCaller
    }

    const line = lines[ignoreLine]
    const lastIndex = line.lastIndexOf('/')
    if (lastIndex === -1) {
        return unknownCaller
    }

    const subs = line.substring(lastIndex + 1).split(':')
    if (subs.length != 3) {
        return unknownCaller
    }
    return subs[0] + ':' + subs[1]
}

function localDateTime(options: LogOptions): Format {
    return {
        transform: (info) => {
            const now = new Date()
            if (hourOffset !== 0) {
                now.setHours(now.getHours() + hourOffset)
            }
            info.timestamp = moment(now).format('MM-DD HH:mm:ss.SSS')
            return info
        },
    }
}
