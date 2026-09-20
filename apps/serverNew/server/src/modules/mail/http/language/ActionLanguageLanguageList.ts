import { LanguageDefine } from '../../language/LanguageDefine'
import { Language } from './Language'

/**
 * 获取语言列表
 */
export class ActionLanguageLanguageList extends Language {
    public doAction(params: any) {
        const response = []

        for (const [languageKey, languageVal] of Object.entries(LanguageDefine.LANGUAGE_MAP)) {
            response.push({
                language_key: languageKey,
                language_val: languageVal,
                is_default: languageKey == LanguageDefine.DEFAULT_LANGUAGE ? 1 : 0,
            })
        }

        return {
            list: response,
            count: response.length,
        }
    }
}
