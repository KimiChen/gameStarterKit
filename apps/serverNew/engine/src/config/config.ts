import * as fs from 'fs'
import json5 from 'json5'
import path from 'path'
import { UtilDir } from '../utils/UtilDir'
import { UtilObject } from '../utils/UtilObject'
import { ConfigMap } from './ConfigReadOnlyMap'
import { program } from 'commander'
import { FixedServerConfig, PlatformConfig, ServiceConfig } from '../typings/conf-platform'
import { timestamp } from '../utils/common'
import { UtilTime } from '../utils/UtilTime'

export interface depthNode {
    field_name: string
    field_type: 'array' | 'object'
}

export interface IMapSchema {
    depth: depthNode[]
    field_name: string
    id_type: string
    createFn: () => Map<any, any>
}

export interface IRootMapSchema {
    id_type: string
    value_type: 'array' | 'object'
    map_schemas: IMapSchema[]
    createFn: () => Map<any, any>
}

export const configSchemas: { [k: string]: IRootMapSchema } = {}

/**
 * 多进程运行时的默认进程池规模。
 * workerNum 与 taskWorkerNum 同时为 0 时，区服走单进程启动，不使用多进程运行时。
 */
export const DEFAULT_SERVICE_WORKER_NUM = 2
export const DEFAULT_SERVICE_TASK_WORKER_NUM = 2
export const DEFAULT_SERVICE_USER_TASK_WORKER_NUM = 0

class ConfSpace {
    confMap: Record<string, any> = {}

    /** 最后访问时间,如果最后访问时间距离现在大于14天,则在有新的数据空间设置 */
    lastAccessTime: number = 0
}
const defaultSpaceKey = 'default'

export class Config {
    protected static gameConfigPath = 'config_game'

    protected static defaultConfigPath = 'config'

    protected static platformConfigPath = 'config/platforms'

    protected static spaces: { [key: string]: ConfSpace | undefined } = {
        [defaultSpaceKey]: new ConfSpace(),
    }

    // sid=>confMap
    protected static _confServerMap: Map<int, any> = new Map()

    protected static fileExt = '.json5'

    protected static gamefileExt = '.json'

    //#region 基本方法

    private static getSpace(key: string): ConfSpace | undefined {
        const space = this.spaces[key]
        if (!space) {
            return
        }
        if (key != defaultSpaceKey) {
            space.lastAccessTime = timestamp()
        }
        return space
    }

    private static setSpace(spaceKey: string, space: ConfSpace) {
        this.spaces[spaceKey] = space

        const now = timestamp()
        space.lastAccessTime = now
        for (const [key, val] of Object.entries(this.spaces)) {
            if (key == defaultSpaceKey) {
                continue
            }
            const expiredTime = val!.lastAccessTime + 14 * UtilTime.DAY_SECOND
            if (now > expiredTime) {
                delete this.spaces[key]
            }
        }
    }

    /**
     * 取默认空间中的游戏配置,platform配置
     * @param name 配置名
     * @param key 取配置下key的value
     * @param defaultValue 取不到数据时返回值
     * @returns
     */
    public static getConfig(name: string, opts?: { key?: any; defaultValue?: any }) {
        return this.getConfigBySpace(defaultSpaceKey, name, opts)
    }

    /** 取指定空间中的配置 */
    public static getConfigBySpace(spaceKey: string, name: string, opts?: { key?: any; defaultValue?: any }): any {
        const space = this.getSpace(spaceKey)
        if (!space) {
            return opts?.defaultValue
        }

        let conf = space.confMap[name]
        if (!conf) {
            const filePath = path.join(ROOT_PATH, this.gameConfigPath + '/' + name + this.gamefileExt)
            this.loadFile(filePath)
            conf = space.confMap[name]
        }

        const key = opts?.key
        if (conf && key !== undefined) {
            if (configSchemas[name]) {
                const value = (conf as Map<any, any>).get(key)
                return value === undefined ? opts?.defaultValue : value
            } else {
                return UtilObject.getValue(conf, key, opts?.defaultValue)
            }
        }
        return conf ?? opts?.defaultValue
    }

    public static loadDir(configPath: string) {
        const files = UtilDir.getFilesInDirectory(configPath, false, [this.fileExt])
        this.loadFiles(files)
    }

    // 把一些配置文件加载到内存
    private static loadFiles(files: string[]) {
        files.forEach((filePath) => {
            this.loadFile(filePath)
        })
    }

    private static loadFile(filePath: string, rename?: string) {
        let jsonData: any
        let fileExt = Config.fileExt
        try {
            const jsonContent = fs.readFileSync(filePath, 'utf-8')
            if (filePath.endsWith('.json5')) {
                jsonData = json5.parse(jsonContent)
                fileExt = Config.fileExt
            } else {
                jsonData = JSON.parse(jsonContent)
                fileExt = Config.gamefileExt
            }
        } catch (e) {
            throw new Error(`读取解析json文件:${filePath}报错了!${e}`)
        }

        const baseName = path.basename(filePath, fileExt)
        const newName = rename && rename != '' ? rename : baseName
        jsonData = this.convertJsonDataToMapData(newName, jsonData)
        this.saveToConfMap(defaultSpaceKey, newName, jsonData)
    }

    /** 获取精确线路文件夹下指定名字的配置；缺失时由项目基础配置提供默认值。 */
    protected static getLineConfPath(name: string) {
        const filePath = path.join(ROOT_PATH, this.platformConfigPath, PLATFORM_TAG, `${name}${this.fileExt}`)
        if (fs.existsSync(filePath)) {
            return filePath
        }
        return ''
    }

    public static createDefaultServiceConf(sid: number, defaults?: FixedServerConfig): ServiceConfig {
        if (!Number.isInteger(sid) || sid < 1) {
            throw new Error(`区服 sid 必须是正整数: ${sid}`)
        }
        if (!defaults) {
            throw new Error('platform.fixedServer 配置不存在')
        }

        const clientPort = Number(defaults.firstClientPort) + sid - 1
        if (!Number.isInteger(clientPort) || clientPort < 1 || clientPort > 65535) {
            throw new Error(`区服端口超出有效范围: sid=${sid}, port=${clientPort}`)
        }
        if (!defaults.clientHost) {
            throw new Error('platform.fixedServer.clientHost 配置不存在')
        }

        const workerNum = Number(defaults.workerNum ?? DEFAULT_SERVICE_WORKER_NUM)
        const taskWorkerNum = Number(defaults.taskWorkerNum ?? DEFAULT_SERVICE_TASK_WORKER_NUM)
        const userTaskWorkerNum = Number(defaults.userTaskWorkerNum ?? DEFAULT_SERVICE_USER_TASK_WORKER_NUM)
        this.validateRuntimePoolSize(workerNum, taskWorkerNum, userTaskWorkerNum)

        return {
            sid,
            clientHost: defaults.clientHost,
            clientPort,
            internalHost: defaults.internalHost ?? '0.0.0.0',
            internalPort: defaults.firstInternalPort === undefined ? 0 : Number(defaults.firstInternalPort) + sid - 1,
            healthPort: defaults.firstHealthPort === undefined ? 0 : Number(defaults.firstHealthPort) + sid - 1,
            heartbeatTimeoutMs: Number(defaults.heartbeatTimeoutMs),
            authTimeoutMs: Number(defaults.authTimeoutMs),
            maxPacketSize: Number(defaults.maxPacketSize),
            workerNum,
            taskWorkerNum,
            userTaskWorkerNum,
        }
    }

    /**
     * 校验多进程进程池规模。
     * 两者同时为 0 是合法的，表示整个区服走单进程启动，不加载多进程运行时。
     * 但只有 Task Worker 而没有 Event Worker 是矛盾配置：Task Worker 的产出需要 Event Worker 处理。
     */
    private static validateRuntimePoolSize(workerNum: number, taskWorkerNum: number, userTaskWorkerNum: number) {
        if (!Number.isInteger(workerNum) || workerNum < 0) {
            throw new Error(`platform.fixedServer.workerNum 必须是非负整数: ${workerNum}`)
        }
        if (!Number.isInteger(taskWorkerNum) || taskWorkerNum < 0) {
            throw new Error(`platform.fixedServer.taskWorkerNum 必须是非负整数: ${taskWorkerNum}`)
        }
        if (!Number.isInteger(userTaskWorkerNum) || userTaskWorkerNum < 0) {
            throw new Error(`platform.fixedServer.userTaskWorkerNum 必须是非负整数: ${userTaskWorkerNum}`)
        }
        if (workerNum === 0 && (taskWorkerNum > 0 || userTaskWorkerNum > 0)) {
            throw new Error(
                `platform.fixedServer.workerNum 为 0 时其他进程池必须也是 0: ` +
                    `taskWorkerNum=${taskWorkerNum}, userTaskWorkerNum=${userTaskWorkerNum}`,
            )
        }
    }

    public static createDefaultServerRedisConf(
        sid: number,
        defaults: PlatformConfig['serverRedis'],
    ): PlatformConfig['serverRedis'] {
        const firstDatabase = Number(defaults.database)
        if (!Number.isInteger(sid) || sid < 1) {
            throw new Error(`区服 sid 必须是正整数: ${sid}`)
        }
        if (!Number.isInteger(firstDatabase) || firstDatabase < 0) {
            throw new Error(`platform.serverRedis.database 必须是非负整数: ${defaults.database}`)
        }
        return { ...defaults, database: firstDatabase + sid - 1 }
    }

    public static resolveServerRedisConf(
        platformConfig: PlatformConfig['serverRedis'],
        serviceConfig?: Partial<PlatformConfig['serverRedis']>,
    ): PlatformConfig['serverRedis'] {
        return { ...platformConfig, ...serviceConfig }
    }

    // 把json的结构解析为map结构
    public static convertJsonDataToMapData(name: string, jsonData: any) {
        if (!configSchemas[name]) {
            return jsonData
        }
        const schema = configSchemas[name]
        const resMap = schema.createFn()
        if (schema.value_type == 'array') {
            for (const k in jsonData) {
                jsonData[k].forEach((element: any) => {
                    for (const mapSchema of schema.map_schemas) {
                        this.convertDeepConfigMapData(name, element, mapSchema.depth.slice(), mapSchema)
                    }
                })
            }
        } else {
            for (const k in jsonData) {
                const element = jsonData[k]
                for (const mapSchema of schema.map_schemas) {
                    this.convertDeepConfigMapData(name, element, mapSchema.depth.slice(), mapSchema)
                }
            }
        }

        for (const k in jsonData) {
            if (schema.id_type == 'int') {
                resMap.set(Number(k), jsonData[k])
            } else {
                resMap.set(k, jsonData[k])
            }
        }
        return new ConfigMap(name, resMap)
    }

    private static convertDeepConfigMapData(
        name: string,
        element: any,
        depthNodes: depthNode[],
        mapSchema: IMapSchema,
    ) {
        if (depthNodes.length > 0) {
            const node = depthNodes.shift()
            const fieldName = node ? node.field_name : ''
            element = element[fieldName]
            for (const k in element) {
                this.convertDeepConfigMapData(name, element[k], depthNodes, mapSchema)
            }
        } else {
            const oldValue = element[mapSchema.field_name]
            const newMap = mapSchema.createFn()
            for (const k in oldValue) {
                if (mapSchema.id_type == 'int') {
                    newMap.set(Number(k), oldValue[k])
                } else {
                    newMap.set(k, oldValue[k])
                }
            }
            element[mapSchema.field_name] = new ConfigMap(name, newMap)
        }
    }

    private static saveToConfMap(spaceKey: string, name: string, jsonData: any, force: boolean = false) {
        let space = this.getSpace(spaceKey)
        if (!force && jsonData instanceof ConfigMap && space?.confMap[name]) {
            throw new Error(`name:${name}已加载过`)
        }
        if (!space) {
            space = new ConfSpace()
            this.setSpace(spaceKey, space)
        }
        // 给配置表添加length属性，不会在key枚举的时候出现
        //Object.defineProperty(jsonData, 'length', { value: Object.keys(jsonData).length, writable: false })
        if (jsonData instanceof ConfigMap) {
            space.confMap[name] = jsonData
            return
        }
        // 合并json对象
        let data = {}
        if (space.confMap[name]) {
            data = space!.confMap[name]
        }
        space.confMap[name] = { ...data, ...jsonData }
    }

    /** 判断配置表名是否在表仓中存在 */
    public static existScheme(name: string): boolean {
        return Boolean(configSchemas[name])
    }

    // 设置活动配置
    private static setCustomConf(
        spaceKey: string, //活动key,一般活动名拼活动开始时间,用于为该活动创建独立的配置空间
        name: string, //配置名称
        childName: string, //子配置名称
        jsonContent: string, // 数据源
        isFullCover: boolean,
    ) {
        const jsonData = JSON.parse(jsonContent)
        let mapData
        if (isFullCover) {
            mapData = this.convertJsonDataToMapData(name, jsonData)
        } else {
            mapData = this.convertJsonDataToMapData(name, { [childName]: jsonData })
        }
        this.saveToConfMap(spaceKey, name, mapData, true)
    }

    /**
     * 设置平台配置
     * @param conf
     */
    public static setPlatformConf(conf: Partial<PlatformConfig>) {
        this.saveToConfMap(defaultSpaceKey, 'platform', conf, true)
    }

    /**
     * 加载所有的配置
     * @param autoLoad 是否自动加载游戏配置
     */
    public static loadAllConf(autoLoad = false) {
        this.loadPlatformConf()
        this.loadServiceConf('service')
        if (!autoLoad) {
            this.loadGameTable()
        }
        this.printDebugPoints()
    }

    /** 加载平台配置, config下所有配置, 再用 config/platforms 下的线路配置覆盖 platform */
    public static loadPlatformConf() {
        this.loadDir(path.join(ROOT_PATH, this.defaultConfigPath))
        const filePath = this.getLineConfPath('platform')
        if (filePath) {
            this.loadFile(filePath)
        }
    }

    /** 加载游戏配置表 */
    public static loadGameTable() {
        this.loadDir(path.join(ROOT_PATH, this.gameConfigPath))
    }

    /** 服务类型之类的配置解析 */
    public static loadServiceConf(newName: string) {
        const platform = this.getConfig('platform') as PlatformConfig
        const defaults = platform.fixedServer
        const filePath = this.getLineConfPath(`s${SERVER_ID}`)
        if (defaults) {
            this.saveToConfMap(defaultSpaceKey, newName, this.createDefaultServiceConf(SERVER_ID, defaults))
        } else if (!filePath) {
            throw new Error(`固定区服默认配置和独立配置均不存在: s${SERVER_ID}`)
        }
        if (filePath) {
            this.loadFile(filePath, newName)
        } else {
            this.saveToConfMap(defaultSpaceKey, newName, {
                serverRedis: this.createDefaultServerRedisConf(SERVER_ID, platform.serverRedis),
            })
        }
        const service = this.getConfig(newName) as ServiceConfig
        const internalPort = Number(service.internalPort || service.clientPort + 10000)
        if (!Number.isInteger(internalPort) || internalPort < 1 || internalPort > 65535) {
            throw new Error(`区服内部端口超出有效范围: sid=${SERVER_ID}, port=${internalPort}`)
        }
        const healthPort = Number(service.healthPort || service.clientPort + 20000)
        if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535) {
            throw new Error(`区服健康探针端口超出有效范围: sid=${SERVER_ID}, port=${healthPort}`)
        }
        if (healthPort === internalPort || healthPort === service.clientPort) {
            throw new Error(`区服健康探针端口不能与客户端或内部端口相同: sid=${SERVER_ID}, port=${healthPort}`)
        }
        this.saveToConfMap(defaultSpaceKey, newName, {
            internalHost: service.internalHost || '0.0.0.0',
            internalPort,
            healthPort,
        })
    }

    public static printDebugPoints() {
        const points = this.getSpace(defaultSpaceKey)!.confMap.platform.debugPoints
        if (points) {
            console.log('已加调试点：', points)
        }
    }

    /**
     *
     * @param activityName
     * @param salt
     * @param name
     * @param childName
     * @param jsonContent
     * @param isFullCover
     */
    static setActivityConf(
        spaceKey: string, //活动名
        name: string, //配置名称
        childName: string, //子配置名称
        jsonContent: string, // 数据源
        isFullCover: boolean,
    ) {
        this.setCustomConf(spaceKey, name, childName, jsonContent, isFullCover)
    }
}
