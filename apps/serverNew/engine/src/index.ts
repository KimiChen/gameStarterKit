import { EventSystem } from './event/EventSystem'

/** 工具类,php翻译js的函数 */
export {
    sleep,
    timestamp,
    millisecond,
    md5,
    base64_encode,
    base64_decode,
    strtotime,
    datetotime,
    timetodate,
    ucfirst,
    lcfirst,
    http_build_query_sort,
    mapFirst,
    mapEnd,
    mapValues,
    mapKeys,
    clone,
    clonedeep,
    mt_rand,
    Map2Array,
    map2Object,
    md5File,
    recursiveDirectoryFile,
    filemtime,
    convertToBase52,
    getUserServersMapId,
    array_unique,
    templateRender,
    isInnerIp,
    lowercaseFirstLetter,
    is_numeric,
    generateId,
    getLocalIp,
    getIPv4OfMachine,
} from './utils/common'
export { OpenSsl } from './utils/OpenSsl'
export { RedisLock } from './utils/RedisLock'
export { TimeAdd } from './utils/TimeAdd'
export { Url, UrlResonse } from './utils/Url'
export { UtilDir } from './utils/UtilDir'
export { UtilJson } from './utils/UtilJson'
export { UtilObject } from './utils/UtilObject'
export { UtilString } from './utils/UtilString'
export { UtilTime } from './utils/UtilTime'
export { UtilFile } from './utils/UtilFile'
export { UtilWeixinRobot } from './utils/UtilWeixinRobot'
export { Singleton } from './comm/Singleton'
export { SortedMap } from './utils/SortedMap'

/** cronTask的相关interface */
export { tickAfter, TickAfterReturnType } from './timer/timer'

/** 引擎初始化帮助类,提供方法初始化global.PLATFORM,global.SERVICE_ID, protocol注册等 */
export {
    EngineInitHelper,
    RUNTIME_CHILD_MARKER,
    RUNTIME_CHILD_ENV_KEYS,
    isRuntimeChildProcess,
} from './EngineInitHelper'

/** 注册业务协议的字符串路由元数据 */
export { ServiceProto, ProtocolDef, ProtocolType } from './protocol/ProtocolInterface'
export { ProtocolConfig, ProtocolConfigMgr } from './protocol/ProtocolConfigMgr'

/** redis mysql platform等配置的interface */
export { LoginKeyItem, LoginKeyConfig, GameUrlConfig, IAppConfigMap, E_APP_TYPE } from './typings/conf-app'
export {
    PlatformMysqlConfig,
    cdnInfo,
    PlatformRedisConfig,
    AdjustSsoConfig,
    AdjustQuickMenuConfig,
    AdjustRedisConnectionConfig,
    AdjustRedisConfig,
    FixedServerConfig,
    PlatformConfig,
    ServiceConfig,
    IPlatformConfigMap,
} from './typings/conf-platform'
export { getAdjustRedisCommandAccess } from './http/controllers/adjust/redisPolicy'

/** cron定时任务类 */
export { CronService } from './timer/CronService'
export { default as RouteAction } from './task/RouteAction'

/** 在线玩家信息获取 */
export { UserOnlineMgr, IUserOnline, MONITOR_OFFLINE_TIME } from './net/UserOnlineMgr'
/** 玩家分区分组,uid中编解码区服id相关函数 */
export { PlatformLineInfo, getServerIdByUid, SID_BASE_NUM } from './Platform'

/** 当前固定区服的客户端接入服务（原生 WebSocket Lobby） */
export {
    LobbyAuthRejection,
    LobbyServer,
    type LobbyAuthInput,
    type LobbyAuthProvider,
    type LobbyAuthRejectionInit,
    type LobbyConnectionContext,
    type LobbyIdentity,
    type LobbyInboundFrame,
    type LobbyOutboundFrame,
    type LobbyRouteHandler,
    type LobbyRouteRegistry,
    type LobbyServerOptions,
    type LobbyWireBusinessError,
    type LobbyWireCodec,
} from './net/lobby/LobbyServer'

/** 获取bean的change数据用于推送,设置自动change相关；两者都不依赖 wire schema */
export { LoadedHashMod, ModSync } from './mod/ModSync'
export { ModInfoRegistry } from './mod/ModInfoRegistry'
export { GenModInfo } from './mod/GenModInfo'
export { ModInfo } from './mod/ModInfo'

/** 日志相关 */
export { LogProxy, Logger } from './logging/type'
export { log } from './logging/log'

/** http服务相关, req res interface结构等 */
export { HttpRequest, HttpResponse, routeCallBack } from './http/routes/base'
export { AdjustRouter } from './http/routes/adjust'
export { getHttpReqClientIp } from './http/util/util'

/** 业务抛出给客户端的错误提示类 */
export { GameError } from './error/GameError'

/** beanDiffer相关 */
export { UserHash } from './bean/redis/userRedis'
export { ServerHash, ServerHashJson, ServerZSet } from './bean/redis/serverRedis'
export { CenterHash, CenterHashJson } from './bean/redis/centerRedis'
export { BeanStatus, FieldStatus } from './differ/status'
export { OnlyNet, Mod, OnlyRedis, ClassNetMap } from './differ/hash'
export { Bean, IdFieldType, RootBean } from './differ/bean'
export { FieldInfo, ModType, ClassInfo, SaveType } from './differ/diff'
export { DiffRank } from './differ/DiffRank'
export { ZSet, RankInfo } from './differ/ZSet'
export { HashJson } from './differ/hashJson'
export { Hash } from './differ/hash'
export { DiffArray } from './differ/DiffArray'
export { DiffMap } from './differ/DiffMap'
export { RankRefBase } from './differ/rankRefBase'
export { Redis, JSONData, JSONArray, JSONObject } from './differ/redis'
export { RedisRecord } from './differ/RedisRecord'
export { RefHash, FromData } from './differ/RefHash'
export { HashLoadOpts, OtherLoadOpts } from './differ/subs/optsInterface'
export { ReadonlyBean, ReadonlyDiffArray, ReadonlyDiffMap } from './differ/readonly'
export { RedisService } from './differ/RedisService'

/** Redis,Mysql连接使用相关 */
export { DBExport as DB } from './database/DB'
export { RedisInstanceExport as RedisInstance } from './database/RedisInstance'
export { MemberType, RedisCache } from './database/RedisCache'
/** ServerRedisProxy里redis操作会给key加上区服前缀,形如 1:xxxx */
export { ServerRedisProxy } from './database/ServerRedisProxy'

/** 上下文基类,业务里继承使用 */
export { ContextLogic } from './context/ContextLogic'
export { ContextEngineExport as ContextEngine } from './context/ContextEngine'

/** action生命周期相关, 请求的apiCall对象返回类型等  */
export { IActionLogic } from './action/IActionLogic'
export {
    ObjectActionCall,
    executeObjectAction,
    executeForwardedRoute,
    type ObjectActionHandler,
    type ObjectActionIdentity,
} from './action/ObjectAction'
export { IActionAttachTask } from './task/IAttachTask'
export { LocalActionRegistry, LocalActionClass } from './action/LocalActionRegistry'

/** tsprc 调用相关 */
export { ApiCall } from './net/client/base/ApiCall'
export { AsyncReturn, AsyncReturnError, AsyncReturnSucc } from './protocol/ProtocolInterface'
export { MessageHelper, Call } from './comm/MessageHelper'
export { MsgType } from './protocol/MsgType'

/** 游戏配置活动配置存放 */
export { Config, configSchemas } from './config/config'
export { ConfigReadonlyMap } from './config/ConfigReadOnlyMap'

/** 事件系统 */
export { EventSystem, EventArgs, EventHandler, EventCalculate, Event } from './event/EventSystem'
export { Listen, ListenArgs, ListenHandler } from './event/EventSystem'
export { ActionEventSystem, ActionEventHandlerBase, ActionEventArgs } from './event/ActionEventSystem'

import './utils/DeclareExtends'
