import { LogProxy } from '@arthropoda/game-engine'
import { LogChannels } from '../telemetry/LogChannels'
import { GameActionContext } from '../runtime/context/GameActionContext'
import { IPlatformConfigMap } from '@arthropoda/game-engine'
import { IAppConfigMap, E_APP_TYPE } from '@arthropoda/game-engine'
/* eslint-disable no-var */
declare global {
    /** 整数精确的最大最小值为+-9007_1992_5474_0991, 如果有小数则直接去除 */
    type int = number
    /** 正整数精确的【0-9007_1992_5474_0991】目前仅限协议定义使用 */
    type uint = number
    /** 游戏配置 */
    var C: ConfType
    /** 游戏的 */
    var Param: ParamTypes
    /** 平台独有的配置 */
    var CP: IPlatformConfigMap
    /** 应用的配置，全局的配置 */
    var CA: IAppConfigMap

    /** 平台标识 */
    var PLATFORM: string
    /** 平台的环境 */
    var PLATFORM_VERSION: string
    /** PLATFORM+VERSION的组合名 */
    var PLATFORM_TAG: string
    // 托管区服
    var PLATFORM_SERVER_IDS: int[]

    /** 项目运行根目录 */
    var ROOT_PATH: string
    var Ctx: GameActionContext
    /** 日志 */
    var Log: LogProxy<typeof LogChannels>

    /** 是否为调试环境 */
    var ADJUST_OPEN: boolean

    /** 服务名称(s1,s2) */
    var SERVICE_NAME: string
    /** 当前游戏进程承载的固定业务区服 */
    var SERVER_ID: int
    var WORKER_ID: number | null
    var PROCESS_ROLE: 'SINGLE' | 'MASTER' | 'WORKER' | 'TASK_WORKER' | 'USER_TASK_WORKER'
    var WORKER_NUM: number
    var TASK_WORKER_NUM: number
    var USER_TASK_WORKER_NUM: number
    var IS_MASTER: boolean
    var APP_TYPE: E_APP_TYPE

    /** 保证返回一个没有小数部分且非NaN的int */
    var Int: (v?: number | string | undefined | null) => int
}

export {}
