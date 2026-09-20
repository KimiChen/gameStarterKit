import { UtilString as engineUtilString } from '@arthropoda/game-engine'
import { UserErrors } from '../UserErrors'

export class UserTextValidation extends engineUtilString {
    /** 只判断utf8的长度 */
    static checkUtf8StringLenValid(str: string, utf8MaxLen: number, errorCode = UserErrors.UserTooLong): void {
        const utf8Len = str.length
        if (utf8Len > utf8MaxLen) {
            const errInfo = {
                str: str,
                utf8Len: utf8Len,
                utf8MaxLen: utf8MaxLen,
            }
            throw errorCode.params({ vars: { info: errInfo } })
        }
    }

    /**
     * 判断字符串长度是否合法
     * @param str
     * @param utf8MaxLen utf8的长度
     * @param otherMaxLen
     * @param charMaxLen 字符的长度
     * @param errorCode  错误状态码
     */
    static checkStringLenValid(
        str: string,
        utf8MaxLen: int,
        otherMaxLen = 0,
        charMaxLen = 0,
        errorCode = UserErrors.UserTooLong,
    ) {
        const utf8Len = new TextEncoder().encode(str).length
        const charLen = str.length
        charMaxLen = charMaxLen == 0 ? utf8MaxLen * 3 : charMaxLen

        let maxLen = utf8MaxLen
        if (utf8Len == charLen) {
            maxLen = otherMaxLen == 0 ? charMaxLen : otherMaxLen
        }

        if (utf8Len > maxLen || charLen > charMaxLen) {
            throw errorCode.params({
                vars: {
                    str: str,
                    utf8Len: utf8Len,
                    charLen: charLen,
                    utf8MaxLen: utf8MaxLen,
                    charMaxLen: charMaxLen,
                },
            })
        }
    }
}
