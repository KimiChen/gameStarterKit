import { LanguageDefine } from './LanguageDefine'

export class MailLocalization {
    static getValueByUserLanguage(language: string, value: string): string {
        if (language !== '' && this.getLanguageType()) {
            return LanguageDefine.getLanguageValue(value, language ?? '')
        }
        return value
    }

    static getLanguageType(): int {
        return LanguageDefine.LANGUAGE_TYPE ?? 0
    }
}
