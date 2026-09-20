
import axios from 'axios'
import { hostname } from 'os'
import { Mutex } from 'async-mutex'
import { sleep, timestamp } from './common'

/**
* 这个类不要带日志库，因为日志权限错误之类都报错只能通过网络发送了
* 必须设置超时时间，和try catch
*/
export class UtilWeixinRobot {
    static readonly PUSH_MAX_BYTES = 4096 - 1024

    static queue: [string, string][] = []

    /**
     * @param markdownContent
     * @param string fontType warning info
     */
    static async trySend(robotUrl: string, markdownContent: string) {
        if (robotUrl) {
            let content = markdownContent
            if (Buffer.byteLength(content, 'utf-8') > this.PUSH_MAX_BYTES) {
                content = content.substring(0, this.PUSH_MAX_BYTES)
            }
            try {
                //通过curl发送到微信机器人
                const param = {
                    'msgtype': 'markdown',
                    'markdown': {
                        'content': content,
                    },
                }
                await axios.post(robotUrl, param, { timeout: 1000 })
            } catch (err) {
                console.error(err)
                // 不要调用日志代码， 走到这里还报错，没辙了
            }
        }else{
            console.log(markdownContent)
        }
    }

    private static sendWithQueueLock = new Mutex()

    static async sendWithQueue(robotUrl: string, markdownContent: string) {
        this.queue.push([robotUrl, markdownContent])
        if (this.sendWithQueueLock.isLocked()) {
            return
        }
        await this.sendWithQueueLock.runExclusive(async () => {
            let maxRunTimes = 99
            while (maxRunTimes-- > 0 && this.queue.length > 0) {
                const args = this.queue.shift()!
                await this.trySend(...args)
                await sleep(5000)
            }
        })
    }

}

