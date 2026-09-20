import path from 'path'
import { initializeConfigGlobals } from '../runtime/config/initializeConfigGlobals'
import { Config, E_APP_TYPE, EngineInitHelper, datetotime, log, timestamp } from '@arthropoda/game-engine'
import { program } from 'commander'
import '../runtime/persistence/TypeOrmExtensions'
import { execSync } from 'child_process'
import * as fs from 'fs'
import { entities } from '../../generated/persistence/db-info'
import { configSchemaVersion } from '../../generated/configTypes/map_schema'
import { LocalAction } from '../runtime/action/LocalAction'
import { Actions } from '../../generated/protocol/server/S2S/actions'
import { ProtocolConfigInitializer } from '../runtime/protocol/ProtocolConfigInitializer'
import { InternalJsonActionRegistry } from '../runtime/action/S2S/http/InternalJsonActionRegistry'
import { createHash } from 'crypto'
import json5 from 'json5'
import { GameModuleCatalog } from './GameModuleCatalog'
import { GameModuleLifecycle } from './GameModuleLifecycle'

/** 非业务的,引擎和框架通用初始化放在这里 */
export function initializeLaunchConfiguration(opts: { appType?: E_APP_TYPE }) {
    EngineInitHelper.initBase(program, { appType: opts.appType ?? E_APP_TYPE.DEFAULT })
    global.ROOT_PATH = resolveApplicationRoot()
    global.ADJUST_OPEN = PLATFORM == 'bearjoy' || PLATFORM_VERSION == 'beta' || PLATFORM_VERSION == 'dev'
    initializeConfigGlobals()
    Config.loadPlatformConf()
    Config.loadServiceConf('service')
    Config.printDebugPoints()
}

/** 非业务的,引擎和框架通用初始化放在这里 */
export async function initializeApplication(opts: { appType?: E_APP_TYPE; launchConfigurationLoaded?: boolean }) {
    if (!opts.launchConfigurationLoaded) {
        initializeLaunchConfiguration(opts)
    }
    checkTscCompileOK()
    checkAdjustApiDoc()

    //初始化策划配置和程序配置
    if (process.env.ALLOY_CONFIG_MEMORY_PROBE === '1') {
        captureConfigMemory('before-config-game')
        loadAllConfigGameFiles()
    }
    for (const entry of GameModuleCatalog.systems.configuration.entries) {
        if (matchesApp(entry.contribution.app, opts.appType)) entry.contribution.handler()
    }
    await GameModuleLifecycle.run(moduleApp(opts.appType), 'configuration-loaded')

    //初始化日志
    log.init(CP.platform.log)
    if (process.env.ALLOY_CONFIG_MEMORY_PROBE === '1') {
        captureConfigMemory('after-config-game')
    }
    //configSchemaVersion的引用不能删除，否则会导致map_schema里的代码不执行
    Log.info('配置加载完成:' + PLATFORM_TAG + ',策划配置ver:' + configSchemaVersion)

    // 初始化redis链接
    const serverRedis = Config.resolveServerRedisConf(CP.platform.serverRedis, CP.service.serverRedis)
    await EngineInitHelper.initRedisInstance(CP.platform.centerRedis, serverRedis, CP.platform.userRedis)

    //设置时区
    setTimeZone()
    // 设置时间偏移量(需要访问redis)
    await EngineInitHelper.initTimeAdd()

    // 初始化数据库
    await EngineInitHelper.initDB(entities, CP.platform.centerMysql)

    //初始化协议
    LocalAction.registerAction2ApiName(Actions)
    const actionExecutors = GameModuleCatalog.systems.protocol.entries.flatMap((entry) =>
        entry.contribution.kind === 'actionExecutor' && matchesApp(entry.contribution.app, opts.appType)
            ? [entry.contribution]
            : [],
    )
    if (actionExecutors.length !== 1) {
        throw new Error(`expected exactly one protocol Action executor, received ${actionExecutors.length}`)
    }
    ProtocolConfigInitializer.registerActionExecutor(actionExecutors[0].executor)
    for (const entry of GameModuleCatalog.systems.protocol.entries) {
        const contribution = entry.contribution
        if (contribution.kind === 'internalJsonAction' && matchesApp(contribution.app, opts.appType)) {
            InternalJsonActionRegistry.register(contribution.key, contribution.handler)
        }
    }
    await ProtocolConfigInitializer.init()
}

function loadAllConfigGameFiles() {
    const configPath = path.join(ROOT_PATH, 'config_game')
    const configNames = fs
        .readdirSync(configPath)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.basename(name, '.json'))
        .sort()
    for (const name of configNames) Config.getConfig(name)
    fs.writeSync(1, `[config-memory] loaded-files=${configNames.length}\n`)
}

function captureConfigMemory(label: string) {
    const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
    for (let i = 0; i < 3; i++) gc?.()
    fs.writeSync(1, `[config-memory] ${JSON.stringify({ label, pid: process.pid, ...process.memoryUsage() })}\n`)
    process.kill(process.pid, 'SIGSTOP')
}

function moduleApp(appType: E_APP_TYPE | undefined) {
    return appType === E_APP_TYPE.API ? ('management' as const) : ('service' as const)
}

function matchesApp(app: 'service' | 'management' | 'all', appType: E_APP_TYPE | undefined) {
    return app === 'all' || app === moduleApp(appType)
}

export function resolveApplicationRoot(candidates: readonly string[] = applicationRootCandidates()) {
    const requiredMarkers = ['generated/records/record.json', 'config']
    const evidence = [...new Set(candidates.map((candidate) => path.resolve(candidate)))].map((candidate) => ({
        candidate,
        missing: requiredMarkers.filter((marker) => !fs.existsSync(path.join(candidate, marker))),
    }))
    const match = evidence.find((item) => item.missing.length === 0)
    if (match) return match.candidate

    const details = evidence
        .map((item) => `${item.candidate}: missing ${item.missing.join(', ') || 'nothing'}`)
        .join('; ')
    throw new Error(`unable to locate application root; ${details}`)
}

function applicationRootCandidates() {
    return [path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../../..'), process.cwd()]
}

function checkTscCompileOK(): boolean {
    if (!ADJUST_OPEN) {
        return true
    }
    if (process.platform != 'darwin') {
        return true
    }
    const isTsNode = path.extname(__filename) === '.ts'
    if (isTsNode) {
        return true
    }

    try {
        const findResult = execSync("ps -ax | grep 'tspc -w' | grep -v grep")?.toString('utf-8')
        if (findResult.indexOf('tspc -w') < 0) {
            console.error('tspc -w编译监听进程未启动,当前js文件执行可能不是最新的#1')
            return true
        }
    } catch (err) {
        console.error('tspc -w编译监听进程未启动,当前js文件执行可能不是最新的#2')
        return true
    }

    const logPath = '/tmp/tsc-output.log'
    if (!fs.existsSync(logPath)) {
        return true
    }
    const checkCompileResult = execSync(`tail -n 2 ${logPath}`).toString('utf-8')
    //有好几种Starting, 所以统一用这个判断
    if (checkCompileResult.indexOf('Starting ') >= 0) {
        throw new Error('tsc编译中请等待')
    }
    const checkErrorResult = execSync(`tail -n 1 ${logPath}`).toString('utf-8')
    const regexp = new RegExp(/Found\s[1-9]+\serror/)
    if (regexp.test(checkErrorResult)) {
        throw new Error(execSync(`tail ${logPath}`).toString('utf-8'))
    }
    return true
}

// 设置时区
export function setTimeZone() {
    process.env.TZ = CP.platform.timeZone ?? 'Asia/Shanghai'
}

/**
 * 本地自动检测Api文档生成
 */
function checkAdjustApiDoc() {
    if (!(PLATFORM == 'bearjoy' && PLATFORM_VERSION == 'dev')) {
        return
    }

    try {
        const filePath = path.resolve(ROOT_PATH, 'generated', 'adjust', 'change_document.json5')
        const jsonContent = fs.readFileSync(filePath, 'utf-8')

        const modulesPath = path.resolve(ROOT_PATH, 'src/modules/')
        const adjustPaths = [
            path.join(modulesPath, 'adjust/change'),
            ...fs
                .readdirSync(modulesPath, { withFileTypes: true })
                .filter((entry) => entry.isDirectory() && entry.name != 'adjust')
                .map((entry) => path.join(modulesPath, entry.name, 'adjust'))
                .filter((directoryPath) => fs.existsSync(directoryPath)),
        ]
        const fileDic: { [key: string]: string } = {}
        adjustPaths.forEach((adjustPath) => traverseDirectory(adjustPath, fileDic))

        const jsonObject = json5.parse(jsonContent)
        const md5Dic = jsonObject.md5
        let isChange = md5Dic && Object.keys(md5Dic).length != Object.keys(fileDic).length
        if (md5Dic) {
            for (const key in fileDic) {
                const recordMd5 = md5Dic[key]
                if (recordMd5 && recordMd5 == fileDic[key]) {
                    continue
                }
                isChange = true
                break
            }
        }

        if (md5Dic == undefined || isChange) {
            execSync('pnpm exec ts-node --files ./scripts/generator/adjust/AdjustDocumentGenerator.ts', {
                stdio: 'inherit',
            })
        }
    } catch (err) {
        console.error('checkAdjustApiDoc fail ', err)
    }
}

function traverseDirectory(directoryPath: string, fileDic: { [key: string]: string }) {
    const files = fs.readdirSync(directoryPath)
    for (const file of files) {
        const filePath = path.join(directoryPath, file)
        const stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
            traverseDirectory(filePath, fileDic)
        } else if (stats.isFile()) {
            if (!file.startsWith('Adjust')) {
                continue
            }
            const fileContent = fs.readFileSync(filePath)
            const fileKey = path.relative(ROOT_PATH, filePath).replaceAll(path.sep, '/')
            fileDic[fileKey] = createHash('md5').update(fileContent).digest('hex')
        }
    }
}
