import fs from 'fs'
import { Service } from 'typedi'
import { ClientConfigVersion } from './DownloadQuery'
import { TestConfigModel } from '../../../../generated/persistence/TestConfigModel'

@Service()
export class ClientConfigCatalog {
    readonly SUCCESS_CODE = 0

    /**
     * 包含测试配置不压缩为false
     * 要不要使用zip的方式下载这些配置
     */
    readonly IS_ZIP = false

    /**
     * 配置文件夹
     */
    readonly ConfigGamePath = ROOT_PATH + '/config_game/'

    /**
     * 盐值配置文件路径
     */
    readonly SaltJsonPath = ROOT_PATH + '/config_game/salt.json'

    /**
     * 获取可下载的配置文件名称
     * @returns
     */
    getConfigNames() {
        return this.getAllJsonConfig()
    }

    /**
     * 获取所有下发配置json
     */
    getAllJsonConfig() {
        // 获取允许下载的配置表名
        const files = fs.readdirSync(this.ConfigGamePath)
        const tmpParams = []
        for (const fileName of files) {
            const baseName = fileName.split('.json')[0]
            tmpParams.push(baseName)
        }
        return tmpParams
    }

    /**
     * 生成配置映射
     * @param configBaseNames
     * @param sId
     */
    async getConfInfoMap(configBaseNames: string[], sId?: int) {
        const fileData = fs.readFileSync(this.SaltJsonPath, 'utf8')
        const saltConf = JSON.parse(fileData)

        const confVerList: Map<string, ClientConfigVersion> = new Map()

        const tempConfList: Map<string, TestConfigModel> = new Map()
        if (ADJUST_OPEN) {
            //测试配置
            const testConfList = await TestConfigModel.find({ where: { serverId: sId } })
            testConfList.forEach((value) => {
                tempConfList.set(value.configName, value)
            })
        }

        for (const baseName of configBaseNames) {
            const configName = baseName + '.json'
            const verConf: ClientConfigVersion = {
                salt: '',
                size: 0,
                uri: '',
                isTestConfig: false,
            }

            const testConf = tempConfList.get(baseName)
            if (ADJUST_OPEN && testConf) {
                // 测试配置
                verConf.isTestConfig = true
                verConf.size = testConf.jsonContent.length
                verConf.salt = testConf.salt
                verConf.uri = '/client/download?name=' + baseName + '&sId=' + sId
            } else {
                // json配置
                verConf.isTestConfig = false
                verConf.size = fs.statSync(this.ConfigGamePath + configName).size
                verConf.salt = saltConf[baseName]
                verConf.uri = '/client/downloadConf?name=' + baseName
            }

            confVerList.set(baseName, verConf)
        }

        return confVerList
    }
}
