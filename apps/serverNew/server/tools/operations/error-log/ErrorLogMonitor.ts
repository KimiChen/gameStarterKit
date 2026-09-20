import {
    UtilFile,
    UtilTime,
    UtilWeixinRobot,
    base64_encode,
    getIPv4OfMachine,
    recursiveDirectoryFile,
    sleep,
    timestamp,
    timetodate,
} from '@arthropoda/game-engine'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import * as fs from 'fs'
import { hostname } from 'os'
import { basename } from 'path'
type LogScanState = {
    taskKey: string //所属的配置的key
    filePath: string //扫面的文件路径
    expiredTime: number // 数据过期时间, 到达该时间后可以检查进行删除
    lastSize: number // 上次扫描时文件大小,用于对比文件是否变化
    lastReadLineNum: number //上次有读到行,说明还没到文件尾部,还可以再扫描
    lastOffset: number //上下扫描到的位置
}

export class ErrorLogMonitor {
    static scanInfo: Record<string, LogScanState> = {}

    static async run() {
        this.loadCache()
        let lastRunDirScan = 0
        let lastDate = ''
        for (;;) {
            try {
                const now = timestamp()
                const nowDate = UtilTime.format(now, 'YYYY-MM-DD')
                //5分钟一次信息提取,或者跨天时
                if (lastRunDirScan + 15 * 60 < now || lastDate != nowDate) {
                    await this.searchNeedScan()
                    await this.scanAllInfo()

                    lastRunDirScan = now
                    lastDate = nowDate
                } else {
                    //只检查含有今天日期的日志
                    await this.scanAllInfo({ baseNameNeedContain: lastDate })
                }
            } catch (err) {
                console.error(err)
            } finally {
                await sleep(5000)
            }
        }
    }

    /** 检索需要进行扫描的文件路径并列举 */
    static async searchNeedScan() {
        for (const key in CP.platform.log_monitor.tasks) {
            const taskConf = CP.platform.log_monitor.tasks[key]
            const files = await recursiveDirectoryFile(taskConf.rootPath)
            const regExp = new RegExp(taskConf.regexp)
            const targetFiles = files.filter((fileName) => regExp.test(fileName)).sort()
            for (const filePath of targetFiles) {
                this.getOrCreateFileInfo(key, filePath)
            }
            //扫描一遍文件夹后等待5分钟再发起全部扫描
        }
        this.tidyCache()
    }

    /**
     * 对所有文件扫描一遍
     * @param baseNameContainStr 文件的basename需要匹配该参数才会进行扫描
     */
    static async scanAllInfo(ruler?: { baseNameNeedContain?: string }) {
        for (const key in this.scanInfo) {
            const scanInfo = this.scanInfo[key]
            if (ruler?.baseNameNeedContain) {
                if (basename(scanInfo.filePath).indexOf(ruler?.baseNameNeedContain) < 0) {
                    continue
                }
            }
            let maxTry = 999
            while (maxTry-- > 0) {
                const hasNew = await this.scanOneInfo(scanInfo)
                if (!hasNew) {
                    break
                }
                this.dumpCache()
                await sleep(5000)
            }
        }
    }

    static async scanOneInfo(scanInfo: LogScanState): Promise<boolean> {
        const filePath = scanInfo.filePath
        let size = 0
        try {
            size = fs.statSync(filePath).size
        } catch (err) {
            //找不到文件暂时跳过
            return false
        }
        if (scanInfo.lastReadLineNum == 0 && scanInfo.lastSize == size) {
            return false
        }

        //一次读取10M
        const res = await UtilFile.readLines(filePath, scanInfo.lastOffset, 10_000_000)
        scanInfo.lastOffset = res.nextOffset
        scanInfo.lastReadLineNum = res.lines.length
        scanInfo.lastSize = size
        this.delayExpiredTime(scanInfo)
        try {
            const errorInfos = this.buildErrorInfo(scanInfo, res.lines, res.linesInfo)
            await this.buildAndPush(scanInfo, filePath, errorInfos)
        } catch (err) {
            console.error(err)
        }
        return true
    }

    static buildErrorInfo(
        info: LogScanState,
        lines: string[],
        linesInfo: { startOffset: number; endOffset: number }[],
    ): { str: string; start: number; end: number }[] {
        const taskConf = CP.platform.log_monitor.tasks[info.taskKey]
        const errLineReg = new RegExp(taskConf.errorLineRegexp)
        const newLineReg = new RegExp(taskConf.newLineRegexp)
        let collectInfo = { str: '', start: 0, end: 0 }
        let startCollect = false
        const errorInfos: { str: string; start: number; end: number }[] = []
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            const lineInfo = linesInfo[index]
            if (newLineReg.test(line)) {
                if (startCollect) {
                    errorInfos.push(collectInfo)
                    collectInfo = { str: '', start: 0, end: 0 }
                    startCollect = false
                }
            }

            if (errLineReg.test(line)) {
                startCollect = true
                collectInfo.start = lineInfo.startOffset
            }
            if (startCollect) {
                collectInfo.str += line + '\n'
                collectInfo.end = lineInfo.endOffset
            }
        }
        if (startCollect) {
            errorInfos.push(collectInfo)
            collectInfo = { str: '', start: 0, end: 0 }
            startCollect = false
        }
        return errorInfos
    }

    static async buildAndPush(
        info: LogScanState,
        filePath: string,
        errInfos: { str: string; start: number; end: number }[],
    ) {
        if (errInfos.length == 0) {
            return
        }
        const taskConf = CP.platform.log_monitor.tasks[info.taskKey]
        let content = ''
        content += `> 标题 **${taskConf.title}** \n`
        content += '> 环境：**' + PLATFORM + '-' + PLATFORM_VERSION + '** \n'
        content += '> 主机名：**' + hostname() + '** \n'
        content += '> 文件路径：**' + filePath + '** \n'
        content += '> 错误日志共**' + errInfos.length + ' 条** \n'

        for (let index = 0; index < errInfos.length; index++) {
            const errInfo = errInfos[index]

            //拼点击访问错误的url
            const searchInfo = JSON.stringify({
                ip: getIPv4OfMachine(),
                port: CP.platform.port,
                filePath: filePath,
                start: errInfo.start,
                end: errInfo.end,
            })
            const str = base64_encode(searchInfo)
            const url = `http://${CP.platform.host}:${CP.platform.port}/exception/info?data=${str}`

            const errStr = `> [第 ${index + 1} 条](${url})：<font color='red'>${errInfo.str}</font>\n`
            if (
                Buffer.byteLength(content, 'utf-8') + Buffer.byteLength(errStr, 'utf-8') >
                UtilWeixinRobot.PUSH_MAX_BYTES
            ) {
                //消息拼接后超过规定长度
                const hideNum = errInfos.length - index //被隐藏条数
                content += `> 因长度受限，有 <font color='warning'>${hideNum}</font> 条错误被隐藏...`
                break
            } else {
                content += errStr
            }
        }
        UtilWeixinRobot.sendWithQueue(taskConf.robotUrl, content).catch((err) => {
            console.error(err)
        })
    }

    static getOrCreateFileInfo(taskKey: string, filePath: string) {
        const salt = `${taskKey}:${filePath}`
        const info: LogScanState = this.scanInfo[salt] ?? {
            taskKey: taskKey,
            filePath: filePath,
            lastSize: 0,
            lastOffset: 0,
            lastReadLineNum: 0,
        }
        this.delayExpiredTime(info)
        this.scanInfo[salt] = info
        return info
    }

    static tidyCache() {
        for (const key in this.scanInfo) {
            const scanInfo = this.scanInfo[key]
            if (scanInfo.expiredTime + UtilTime.DAY_SECOND * 3 < timestamp()) {
                if (fs.existsSync(scanInfo.filePath)) {
                    this.delayExpiredTime(scanInfo)
                } else {
                    delete this.scanInfo[key]
                }
            }
        }
    }

    static delayExpiredTime(scanInfo: LogScanState) {
        scanInfo.expiredTime = timestamp() + UtilTime.DAY_SECOND * 3
    }

    static loadCache() {
        if (existsSync(CP.platform.log_monitor.scanCachePath)) {
            const fileContent = readFileSync(CP.platform.log_monitor.scanCachePath, { encoding: 'utf-8' }) || '{}'
            try {
                this.scanInfo = JSON.parse(fileContent)
            } catch (err) {
                console.error(err)
                throw err
            }
        }
    }

    static dumpCache() {
        try {
            writeFileSync(CP.platform.log_monitor.scanCachePath, JSON.stringify(this.scanInfo), { encoding: 'utf-8' })
        } catch (err) {
            console.error(err)
        }
    }
}
