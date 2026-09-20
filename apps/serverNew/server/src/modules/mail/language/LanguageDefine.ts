export class LanguageDefine {
    static readonly LANGUAGE_TYPE = 1

    static readonly LANGUAGE_CN = 'zh_hans'

    static readonly LANGUAGE_HANT = 'zh_hant'

    static readonly LANGUAGE_EN = 'en'

    static readonly LANGUAGE_JA = 'ja'

    static readonly LANGUAGE_KO = 'ko'

    static readonly LANGUAGE_TH = 'th'

    static readonly LANGUAGE_VN = 'vn'

    static readonly LANGUAGE_FR = 'fr'

    static readonly LANGUAGE_DE = 'de'

    static readonly LANGUAGE_ES = 'es'

    static readonly LANGUAGE_PT = 'pt'

    // 默认语言
    static readonly DEFAULT_LANGUAGE = this.LANGUAGE_CN

    static readonly LANGUAGE_MAP: { [languageSymbol: string]: string } = {
        [this.LANGUAGE_CN]: '简体中文',
        [this.LANGUAGE_HANT]: '繁体中文',
        [this.LANGUAGE_EN]: '英文',
        [this.LANGUAGE_JA]: '日文',
        [this.LANGUAGE_KO]: '韩文',
        [this.LANGUAGE_TH]: '泰文',
        [this.LANGUAGE_VN]: '越南文',
        [this.LANGUAGE_FR]: '法语',
        [this.LANGUAGE_DE]: '德语',
        [this.LANGUAGE_ES]: '西班牙语',
        [this.LANGUAGE_PT]: '葡萄牙语',
    }

    /**
     * 根据玩家语言获取多语言内容
     * @param string $value
     * @param string $language
     * @return string
     */
    public static getLanguageValue(value: string, language: string): string {
        const lang = LanguageDefine.LANGUAGE_MAP[language] ? language : LanguageDefine.DEFAULT_LANGUAGE
        const valueParseed = value == '' ? {} : JSON.parse(value)
        let content = valueParseed[lang] ?? ''
        if (!content && lang != LanguageDefine.DEFAULT_LANGUAGE) {
            content = valueParseed[LanguageDefine.DEFAULT_LANGUAGE] ?? ''
        }
        return content
    }

    /**
     * 将文本转化成多语言格式文本
     * @param string $value
     * @return string
     */
    public static getToManyLanguageValue(value: string): string {
        return JSON.stringify({
            [this.DEFAULT_LANGUAGE]: value,
        })
    }
}
