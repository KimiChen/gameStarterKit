import { E_APP_TYPE, UtilTime } from '@arthropoda/game-engine'
import { AbstractConsumer } from './AbstractConsumer'
import * as fs from 'fs'
import lockfile from 'lockfile'

/**
 * 批量实时写本地文件，文件以天为分隔，需要与LogBus搭配使用进行数据上传，不支持多线程
 * @package StatTa
 * @version Id
 */
export class FileConsumer extends AbstractConsumer {
    /** 文件名 */
    private fileName: string

    /** 日志文件保存目录. 默认为当前目录 */
    private fileDirectory: string

    /** 生成的日志文件前缀 */
    private filePrefix: string

    /** 单个日志文件大小. 单位 MB, 无默认大小 */
    private fileSize: int

    /** 是否按小时切分文件 */
    private rotateHourly: string

    /** 是否开启多进程处理 */
    private progress: boolean = false

    /** 上次存储日期 */
    private static lastDate: string = ''

    /** 当日切割计数器 */
    private static count: int = 0

    /**
     * 创建指定文件保存目录和指定单个日志文件大小的 FileConsumer
     * 默认是按天切分，无默认大小切分
     * @param string file_directory 日志文件保存目录. 默认为当前目录
     * @param int    file_size      单个日志文件大小. 单位 MB, 无默认大小
     * @param string rotate_hourly  是否按小时切分文件
     * @param string file_prefix    生成的日志文件前缀
     */

    constructor(
        file_directory: string = '.',
        file_size: int = 0,
        rotate_hourly: string = 'Y-M-D',
        file_prefix: string = '',
    ) {
        super()
        this.fileDirectory = file_directory

        if (!fs.existsSync(file_directory)) {
            fs.mkdirSync(file_directory, { recursive: true })
        }
        this.fileSize = file_size
        this.rotateHourly = rotate_hourly
        this.filePrefix = file_prefix
        this.fileName = this.getFileName()
    }

    /**
     * 消费数据，将数据追加到本地日志文件
     * @param message
     */
    public async send(message: string) {
        if (this.progress) {
            const lockPath = this.fileName + '.lock'
            try {
                lockfile.lockSync(lockPath, { stale: 5000 })
                fs.appendFileSync(this.fileName, `${message}\n`)
            } catch (error) {
                Log.error('', error)
            } finally {
                lockfile.unlockSync(lockPath)
            }
            return
        }
        fs.appendFileSync(this.fileName, `${message}\n`)
    }

    public close() {}

    /**
     * 获取文件名
     * @return string
     */
    private getFileName() {
        const date = UtilTime.format(0, 'Y-M-D')
        if (FileConsumer.lastDate !== date) {
            FileConsumer.count = 0
        }

        FileConsumer.lastDate = date

        let file_base = ''
        // 判断区服是否定义
        if (APP_TYPE == E_APP_TYPE.SERVICE) {
            file_base = this.fileDirectory + '/log.' + SERVICE_NAME + '_' + FileConsumer.lastDate + '_'
        } else {
            file_base = this.fileDirectory + '/log.' + FileConsumer.lastDate + '_'
        }

        // 判断文件大小是否超出设定大小
        if (this.fileSize > 0) {
            while (
                fs.existsSync(`${file_base}${FileConsumer.count}`) &&
                this.fileSizeOut(`${file_base}${FileConsumer.count}`)
            ) {
                FileConsumer.count += 1
            }
        }

        return `${file_base}${FileConsumer.count}`
    }

    /**
     * 是否开启多进程处理
     * @param bool progress
     * @return void
     */
    public setProgress(progress: boolean) {
        this.progress = progress
    }

    /**
     * 判断文件大小是否超出设定大小
     * @param path
     * @return
     */
    public fileSizeOut(path: string) {
        const fpSize = fs.statSync(path).size / (1024 * 1024)
        if (fpSize >= this.fileSize) {
            return true
        } else {
            return false
        }
    }
}
