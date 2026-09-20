import crypto from 'crypto'
import json5 from 'json5'

export class OpenSsl {
    /**
     * 数据加密
     *
     * @param input any
     * @param key string
     * @return string
     */
    static encryptOpenssl(input: any, key: string): string {
        key = this.checkKey(key)
        const newInput = typeof input === 'object' ? json5.stringify(input) : input

        const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key), null)
        let encrypted = cipher.update(newInput, 'utf8', 'base64')
        encrypted += cipher.final('base64')

        return encrypted
    }

    /**
     * 数据解密
     *
     * @param str string
     * @param key string
     * @return any
     */
    static decryptOpenssl(str: string, key: string): any {
        const decrypted = this.decryptOnlyOpenssl(str, key)

        if (decrypted === false) {
            return false
        }

        try {
            return json5.parse(decrypted)
        } catch (e) {
            return decrypted
        }
    }

    /**
     * 数据解密
     *
     * @param str string
     * @param key string
     * @return string | boolean
     */
    static decryptOnlyOpenssl(str: string, key: string): string | false {
        key = this.checkKey(key)

        const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key), null)
        let decrypted = decipher.update(str, 'base64', 'utf8')
        decrypted += decipher.final('utf8')

        return decrypted
    }

    // 限定了key只能为16位
    private static checkKey(key: string) {
        if (key.length > 16) {
            return key.substring(0, 16)
        } else if (key.length < 16) {
            return key.padEnd(16, '0')
        } else {
            return key
        }
    }
}

