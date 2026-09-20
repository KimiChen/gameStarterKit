import { HttpConfig, InitHttpConfig } from './http/config'
import commander, { program } from 'commander'
import { TraceIdGen } from './net/client/codec/TraceIdGen'
import { ProtocolConfig, ProtocolConfigMgr } from './protocol/ProtocolConfigMgr'
import { ServerTask } from './task/ServerTask'
import { IActionAttachTask, IEngineAttachTask } from './task/IAttachTask'
import { E_APP_TYPE } from './typings/conf-app'
import { RedisInstance } from './database/RedisInstance'
import { PlatformMysqlConfig, PlatformRedisConfig } from './typings/conf-platform'
import { DB } from './database/DB'
import { BaseEntity } from '@arthropoda/typeorm'
import { ContextLogic } from './context/ContextLogic'
import { ContextEngine, ContextFactory } from './context/ContextEngine'
import { PlatformLineInfo } from './Platform'
import { GameError } from './error/GameError'
import { TimeAdd } from './utils/TimeAdd'
import { DifferCache } from './differ/differCache'
import { GenModInfo } from './mod/GenModInfo'
import { ModInfoRegistry } from './mod/ModInfoRegistry'
import { UtilString } from './utils/UtilString'

/** alloy-core 用这个标记区分 master 进程与受监督的 worker 子进程。 */
export const RUNTIME_CHILD_MARKER = 'TS_SWOOLE_RUNTIME_CHILD'

/**
 * 子进程的运行参数通道。
 * alloy-core 的 ProcessSupervisor 用 `fork(entrypoint, [], ...)` 启动子进程，args 是空数组，
 * 因此子进程的 process.argv 里没有 -p/-v/--sid，program.parse() 会静默退回 commander 默认值。
 * master 必须把本次解析结果写进 env，子进程再从 env 还原 argv。
 */
export const RUNTIME_CHILD_ENV_KEYS = {
    platform: 'ALLOY_ENGINE_PLATFORM',
    version: 'ALLOY_ENGINE_VERSION',
    sid: 'ALLOY_ENGINE_SID',
} as const

/** 当前进程是否是 alloy-core fork 出来的受监督子进程。 */
export function isRuntimeChildProcess(): boolean {
    return process.env[RUNTIME_CHILD_MARKER] === '1'
}

export type EngineProcessRole = 'SINGLE' | 'MASTER' | 'WORKER' | 'TASK_WORKER' | 'USER_TASK_WORKER'

export interface EngineProcessInfo {
    workerId: number | null
    role: EngineProcessRole
    workerNum: number
    taskWorkerNum: number
    userTaskWorkerNum?: number
}

/**
 * 引擎相关初始化的汇总,方便查看和理解
 * 有些类的初始化确实只需要调用一个init, 但是还是包一层,作为中间层应对后期可能的调整
 * api和service需要的初始化方法不尽相同
 */
export class EngineInitHelper {
    /**
     * 会调用一次program.parse
     * 通用,初始化 global.APP_TYPE, global.SERVICE_ID 等基础信息
     */
    static initBase(programParam: typeof program, opts: { appType: E_APP_TYPE }) {
        programParam.option('-p | --platform <string>', '平台', 'bearjoy')
        programParam.option('-v | --version <string>', '平台版本', 'dev')
        programParam.option('--sid <number>', '固定业务区服', '1')
        //@ts-ignore
        commander.program = programParam
        this.restoreRuntimeChildArgs()
        program.parse()

        // 初始化平台和版本
        global.APP_TYPE = opts.appType
        global.PLATFORM = program.getOptionValue('platform')
        global.PLATFORM_VERSION = program.getOptionValue('version')
        global.PLATFORM_TAG = PLATFORM_VERSION == 'release' ? PLATFORM : PLATFORM + PLATFORM_VERSION
        global.SERVER_ID = Int(program.getOptionValue('sid'))
        global.SERVICE_ID = process.pid
        global.SERVICE_NAME = `sid${global.SERVER_ID}-pid${process.pid}`
        TraceIdGen.init(global.SERVICE_ID, false)
        this.publishRuntimeChildArgs()
    }

    /**
     * 子进程：把 master 写进 env 的运行参数还原成 argv。
     * 必须在 program.parse() 之前调用，否则 commander 会先落到默认值。
     */
    static restoreRuntimeChildArgs() {
        if (!isRuntimeChildProcess()) {
            return
        }
        const restored = [process.argv[0], process.argv[1]]
        const platform = process.env[RUNTIME_CHILD_ENV_KEYS.platform]
        const version = process.env[RUNTIME_CHILD_ENV_KEYS.version]
        const sid = process.env[RUNTIME_CHILD_ENV_KEYS.sid]
        if (platform) restored.push('-p', platform)
        if (version) restored.push('-v', version)
        if (sid) restored.push('--sid', sid)
        if (restored.length > 2) {
            process.argv = restored
        }
    }

    /**
     * master：把本次解析到的运行参数写进 env。
     * alloy-core 启动子进程时用的是 `{...process.env, ...options.env}`，所以这里写入的值会被子进程继承。
     */
    static publishRuntimeChildArgs() {
        process.env[RUNTIME_CHILD_ENV_KEYS.platform] = String(global.PLATFORM)
        process.env[RUNTIME_CHILD_ENV_KEYS.version] = String(global.PLATFORM_VERSION)
        process.env[RUNTIME_CHILD_ENV_KEYS.sid] = String(global.SERVER_ID)
    }

    /** 为业务初始化稳定的进程身份；单进程与多进程都必须显式设置。 */
    static initProcessInfo(info: EngineProcessInfo) {
        global.WORKER_ID = info.workerId
        global.PROCESS_ROLE = info.role
        global.WORKER_NUM = info.workerNum
        global.TASK_WORKER_NUM = info.taskWorkerNum
        global.USER_TASK_WORKER_NUM = info.userTaskWorkerNum ?? 0
        global.IS_MASTER = info.role === 'MASTER'
        const processName =
            info.role === 'SINGLE' ? 'single' : info.role === 'MASTER' ? 'master' : `worker${info.workerId}`
        global.SERVICE_NAME = `sid${global.SERVER_ID}-${processName}-pid${process.pid}`
    }

    /** 微服务,注册协议路由与 handler；路由只以字符串标识，不注册任何 wire schema */
    static async initProtocolInfo(cfg: ProtocolConfig) {
        await ProtocolConfigMgr.init(cfg)
    }

    /** 通用,初始化redis连接 */
    static async initRedisInstance(
        centerConfig: PlatformRedisConfig,
        svConfig: PlatformRedisConfig,
        userConfig: PlatformRedisConfig,
    ) {
        await RedisInstance.init(centerConfig, svConfig, userConfig)
    }

    /** 通用,初始化mysql连接 */
    static async initDB(beans: { new (): BaseEntity }[], centerConf: PlatformMysqlConfig) {
        await DB.init(beans, centerConf)
    }

    static async stopInfrastructure() {
        await Promise.allSettled([DB.clear(), RedisInstance.clear()])
    }

    /** 微服务,设置每次action需要自动创建的业务的上下文类,以及其他信息 */
    static initContextFactory(f: ContextFactory<ContextLogic>) {
        ContextEngine.contextFactory = f
        DifferCache.setGetCacheFun(getContextCache)
    }

    /** 微服务,初始化线路信息,用于计算玩家uid和区服的关系等 */
    static initPlatformLineInfo(ids: { [platfor: string]: int }) {
        PlatformLineInfo.register(ids)
    }

    /** 微服务,注册 Bean 模块描述用于变更跟踪与持久化别名；⛔ 不注册任何 wire schema */
    static initModInfoRegistry(modInfos: { [key: string]: GenModInfo }) {
        for (const [key, modInfo] of Object.entries(modInfos)) {
            const classInfo = modInfo.type._class_info!
            ModInfoRegistry.mods[key] = {
                id: classInfo.modId!,
                modName: UtilString.lowercaseFirstLetter(classInfo.name),
                type: modInfo.type,
                subMod: modInfo.subMod,
            }
        }
    }

    /* 业务生命周期调用对应任务执行业务自定义task  */
    static addActionAttackTask(task: new () => IActionAttachTask) {
        ServerTask.addActionAttackTask(task)
    }

    //#region 下面是比较不重要的注册

    /** API, 调试用的proto.json等 */
    static InitHttpConfig(cfg: HttpConfig) {
        InitHttpConfig(cfg)
    }

    /** 微服务, 引擎层遇到业务错误时传递给前端 */
    static initSomeGameError(opts: {
        runtimeError: GameError
        logicError: GameError
        requestError: GameError
        sysNoConf: GameError
        apiCallQueueTimeout: GameError
    }) {
        GameError.runtimeError = opts.runtimeError
        GameError.logicError = opts.logicError
        GameError.requestError = opts.requestError
        GameError.sysNoConf = opts.sysNoConf
        GameError.apiCallQueueTimeout = opts.apiCallQueueTimeout
    }

    /** 通用,用于调时间 */
    static async initTimeAdd() {
        const timeAddVal = await RedisInstance.getCenterRedis().get(TimeAdd.TIME_ADD_KEY)
        const timeAdd = timeAddVal ? parseInt(timeAddVal) : 0

        TimeAdd.initTimeAdd(timeAdd)
    }
}

function getContextCache(newIfNull: boolean = false): DifferCache | undefined {
    let cache = ContextEngine.currentCtxEngine!.differ
    if (cache === undefined && newIfNull) {
        ContextEngine.currentCtxEngine!.differ = cache = new DifferCache()
    }
    return cache
}
