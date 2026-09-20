import { GmConfigModel } from '../../../../generated/persistence/GmConfigModel'
import json5 from 'json5'

type propertyType = 'exchange' | 'words' | 'stats' | 'click_house' | 'ip_service' | 'version' | 'white'

class GmConfigCatalogState {
    // 兑换码
    public exchange?: GmConfigExchange

    // 敏感词
    public words?: GmConfigWords

    // 统计分析
    public stats?: GmConfigStats

    // click house的配置
    public click_house?: GmConfigClickHouse

    // ip 服务
    public ip_service?: GmConfigIpEndpoint

    // 版本管理配置
    public version?: GmConfigVersion

    // 白名单
    public white?: GmConfigWhite

    // 加载所有的配置
    public async loadAllConfig() {
        const models = await GmConfigModel.find()

        const propertys = Object.keys(this)

        for (const v of models) {
            if (propertys.includes(v.module)) {
                this.build(v)
            }
        }
    }

    private build(configModel: GmConfigModel) {
        const property = configModel.module as propertyType
        let data: any
        try {
            data = json5.parse(configModel.configContent)
        } catch (e) {
            return
        }
        switch (property) {
            case 'exchange':
                this.exchange = GmConfigExchange.build(data)
                break
            case 'words':
                this.words = GmConfigWords.build(data)
                break
            case 'stats':
                this.stats = GmConfigStats.build(data)
                break
            case 'click_house':
                this.click_house = GmConfigClickHouse.build(data)
                break
            case 'ip_service':
                this.ip_service = GmConfigIpEndpoint.build(data)
                break
            case 'version':
                this.version = GmConfigVersion.build(data)
                break
            case 'white':
                this.white = GmConfigWhite.build(data)
                break
        }
    }
}

export const GmConfigCatalog = new GmConfigCatalogState()

abstract class GmConfigSection {
    init(data: any) {
        for (const property in this) {
            // eslint-disable-next-line no-prototype-builtins
            if (data.hasOwnProperty(property)) {
                ;(this as any)[property] = data[property]
            }
        }
    }

    /**
     * 构造 GmConfig 配置对象
     * @param data 配置参数
     * @return 返回数据
     */
    public static build<T extends typeof GmConfigSection>(this: T, data: any): InstanceType<T> | undefined {
        const properties = this.necessaryProperties()
        for (const item of properties) {
            if (!data[item]) {
                return undefined
            }
        }
        const value = new (this as any)()
        value.init(data)
        return value as InstanceType<T>
    }

    /**
     * 必要的配置
     * @return array
     */
    protected static necessaryProperties(): string[] {
        return []
    }
}

/**
 * GmConfigExchange
 * 兑换码服务的配置
 */
export class GmConfigExchange extends GmConfigSection {
    // 兑换地址
    public exchange_url: string = ''

    // 兑换加密秘钥
    public app_secret: string = ''

    // 游戏id
    public game_id: string = ''

    // 线路id
    public platform_id: string = ''

    protected static necessaryProperties(): string[] {
        return ['game_id']
    }
}

/**
 * GmConfigWords
 * 敏感词服务的配置
 */
export class GmConfigWords extends GmConfigSection {
    // 敏感词验证地址
    public words_url: string = ''

    // 加密秘钥
    public app_secret: string = ''

    // 游戏id
    public game_id: string = ''

    // 线路id
    public platform_id: string = ''

    protected static necessaryProperties(): string[] {
        return ['game_id']
    }
}

/**
 * GmConfigStats
 * 统计服务的配置
 */
export class GmConfigStats extends GmConfigSection {
    // 统计上报地址
    public stats_url: string = ''

    // 上报加密秘钥
    public app_secret: string = ''

    // 上报需要的appid
    public app_id: string = ''

    // 客户端上报日志的地址
    public js_url: string = ''

    protected static necessaryProperties(): string[] {
        return ['app_id']
    }
}

/**
 * GmConfigClickHouse
 * clickhouse 服务的配置
 */
export class GmConfigClickHouse extends GmConfigSection {
    // 统计的应用id
    public app_id: string = ''

    // ip
    public host: string = ''

    // 端口
    public port: string = ''

    // 用户名
    public username: string = ''

    // 密码
    public password: string = ''

    // 库名
    public database: string = ''

    protected static necessaryProperties(): string[] {
        return ['app_id']
    }
}

/**
 * GmConfigIpEndpoint
 * ip 服务的配置
 */
export class GmConfigIpEndpoint extends GmConfigSection {
    // ip 服务地址
    public ip_service_url: string = ''

    // 加密秘钥
    public app_secret: string = ''

    // 游戏id
    public game_id: string = ''

    // 线路id
    public platform_id: string = ''

    protected static necessaryProperties(): string[] {
        return ['game_id']
    }
}

export class GmConfigVersion extends GmConfigSection {
    public version_url: string = ''

    public app_secret: string = ''

    public game_id: string = ''

    public platform_id: string = ''

    protected static necessaryProperties(): string[] {
        return ['game_id']
    }
}

/**
 * GmConfigWhite
 * 白名单配置
 */
export class GmConfigWhite extends GmConfigSection {
    // 白名单IP列表
    public ip: string[] = []
}
