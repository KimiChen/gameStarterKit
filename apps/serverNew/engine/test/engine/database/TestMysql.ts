import { DB } from '../../../src/database/DB'
import path from 'path'
import * as common from '../../../src/common'
import { CenterUser } from '../../../src/bean/db/center/CenterUser'
import { Config, setConfigProxy } from '../../../src/config/config'

common.init()
Config.loadAllConf()
setConfigProxy()

const beanPath = path.resolve(ROOT_PATH, 'src/bean/db')

async function testCenterUser() {
    await DB.init(beanPath, CP.platform.centerMysql)

    const user = await CenterUser.findBy({ id: 1 })
    const users = await CenterUser.find()

    console.log(user)
    console.log(users)

    await DB.clear()
}

testCenterUser()
