import { LogChannels } from '../action/LogChannels'
import { LogProxy } from '../logging/type'
import { IPlatformConfigMap } from './conf-platform'

/* eslint-disable no-var */
declare global {
    // 整数精确的最大最小值为+-9007_1992_5474_0991, 如果有小数则直接去除
    type int = number
    // 正整数精确的【0-9007_1992_5474_0991】目前仅限协议定义使用
    type uint = number
    // 平台独有的配置
    // @ts-ignore
    var CP: IPlatformConfigMap
    // 项目运行根目录
    var ROOT_PATH: string
    // 日志
    var Log: LogProxy<typeof LogChannels>

    // 平台标识
    var PLATFORM: string
    // 平台的环境
    var PLATFORM_VERSION: string
    // PLATFORM+VERSION的组合名
    var PLATFORM_TAG: string
    // 托管区服
    var PLATFORM_SERVER_IDS: int[]

    // 服务名称(s1,s2)
    var SERVICE_ID: int
    var SERVICE_NAME: string
    var SERVER_ID: int
    var WORKER_ID: number | null
    var PROCESS_ROLE: 'SINGLE' | 'MASTER' | 'WORKER' | 'TASK_WORKER' | 'USER_TASK_WORKER'
    var WORKER_NUM: number
    var TASK_WORKER_NUM: number
    var USER_TASK_WORKER_NUM: number
    var IS_MASTER: boolean

    var APP_TYPE: E_APP_TYPE

    // 是否为调试环境
    var ADJUST_OPEN: boolean

    /** 保证返回一个没有小数部分且非NaN的int */
    const Int: (v?: number | string | undefined | null) => int
}

export {}
