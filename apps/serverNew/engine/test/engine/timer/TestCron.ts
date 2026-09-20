import { add } from 'winston'
import { RedisInstance } from '../../../src/database/RedisInstance'
import { CronService } from '../../../src/timer/CronService'
import { TimeAdd } from '../../../src/utils/TimeAdd'
import { strtotime, timestamp } from '../../../src/utils/common'
import { UtilTime } from '../../../src/utils/UtilTime'

async function testCron() {

    global.ADJUST_OPEN = true

    const conf = {
        host: '127.0.0.1',
        port: 6379,
        secret: '',
    }

    await RedisInstance.init(conf, [conf], [conf])

    const everyDayTask = function () {
        console.log('exec everyDayTask:', UtilTime.format())
    }

    const everyMinute = function () {
        console.log('exec everyMinute:', UtilTime.format())
    }

    await CronService.initTask('exeAt0500EveryDayTask', '0 48 14 29 * * ', everyDayTask)

    await CronService.initTask('exeAt0500EveryMinute', '0 * * * * * ', everyMinute)

    // 启动服务
    await CronService.runNextCronTask()

    // 修改时间
    const addSecond = strtotime('2023-12-29 14:47:00') - timestamp()
    TimeAdd.addTime(addSecond)
    console.log('timestamp:', timestamp())
    CronService.afterTimeAdd()
}

testCron().catchError('')
