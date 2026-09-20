import { RedisInstance } from '@arthropoda/game-engine'
import { timestamp } from '@arthropoda/game-engine'
import { LanguageDefine } from '../../language/LanguageDefine'
import { GmAction } from '../../../gm/http/GmAction'

/**
 * 语言
 */
export abstract class Language extends GmAction {
    static readonly MODULE_SERVER_NAME = 'ServerName'

    static readonly LANGUAGE_SERVER_KEY = 'language_server' // 语言对应推荐区服hash key

    static readonly LANGUAGE_OPEN_SERVER_KEY = 'language_open_server' // 定时开区设置的语言hash key

    static readonly LANGUAGE_SERVER_TMP_KEY = 'language_server_tmp' // 临时记录上次请求区服列表的数据

    public static getDefault(): string {
        return LanguageDefine.DEFAULT_LANGUAGE
    }

    /**
     * 校验多语言格式
     * @param $languageContent
     * @return array
     */
    public static checkLanguageContent(languageContent: { [key: string]: any }): [boolean, string] {
        if (!languageContent) {
            return [false, 'language_content格式错误']
        }
        const defaultLanguage = this.getDefault()
        if (!languageContent[defaultLanguage]?.title || !languageContent[defaultLanguage]?.content) {
            return [false, '默认语言必填']
        }
        return [true, '']
    }

    public static getLanguageTitleAndContent(languageContent: { [key: string]: any }): [string, string] {
        if (!languageContent) {
            return ['', '']
        }
        const titleMap: { [key: string]: any } = {}
        const contentMap: { [key: string]: any } = {}
        for (const lang in languageContent) {
            const value = languageContent[lang]
            titleMap[lang] = value.title ?? ''
            contentMap[lang] = value.content ?? ''
        }

        return [JSON.stringify(titleMap), JSON.stringify(contentMap)]
    }

    /**
     * 获取对应语言推荐区服列表
     * @return [语言=>sId]
     */
    public static async getServerList(): Promise<{ [key: string]: number }> {
        const redis = RedisInstance.getCenterRedis()
        const tmpServerList = await redis.hGetAll(this.LANGUAGE_SERVER_KEY)
        const serverList = Object.fromEntries(Object.entries(tmpServerList).map(([k, v]) => [k, Number(v)]))
        const openServerList = await redis.hGetAll(this.LANGUAGE_OPEN_SERVER_KEY)
        const now = timestamp()

        let changed = false
        for (const sId in openServerList) {
            const item = JSON.parse(openServerList[sId])
            const openTime = item.open_time ?? 0
            if (openTime > 0 && now >= openTime) {
                const languages = item.languages ?? []
                for (const language of languages) {
                    serverList[language] = Number(sId)
                }
                changed = true
                await redis.hDel(this.LANGUAGE_OPEN_SERVER_KEY, sId)
            }
        }

        changed && (await redis.hMset(this.LANGUAGE_SERVER_KEY, serverList))

        return serverList
    }
}
