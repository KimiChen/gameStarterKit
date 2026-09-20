import { Config, UtilTime, timestamp } from '@arthropoda/game-engine'
import { TestConfigModel } from '../../../../generated/persistence/TestConfigModel'

/**
 * Loads short-lived database overrides used by adjust environments.
 */
export class AdjustConfigLoader {
    static async loadAllTestConfig() {
        await this.loadTestConfigFromDB()
        await this.markTestConfigAvailable()
    }

    static async loadTestConfigFromDB() {
        if (!ADJUST_OPEN) {
            return false
        }

        const now = timestamp()
        const confs = await TestConfigModel.find()
        for (const conf of confs) {
            if (conf.configContent.length == 0) {
                await TestConfigModel.delete({ id: conf.id })
                continue
            }
            if (UtilTime.dayDiffOfNature(now, conf.updateTs) > 0) {
                await TestConfigModel.delete({ id: conf.id })
                Log.warn('配置超过一天为防止旧配置导致的报错，已经自动删除 ' + conf.configName)
                continue
            }
            if (!conf.available) {
                conf.available = 1
                await conf.save()
            }
            Config.setActivityConf(String(conf.serverId), conf.configName, '', conf.configContent, true)
        }
    }

    /** Mark overrides as bootable after Config.loadAllConf succeeds. */
    static async markTestConfigAvailable() {
        if (!ADJUST_OPEN) {
            return false
        }
        await TestConfigModel.update({ available: 1 }, { canStart: 1 })
    }
}
