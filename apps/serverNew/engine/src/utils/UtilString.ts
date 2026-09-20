import { lcfirst } from './common'

export class UtilString {
    static lowercaseFirstLetter(str: string): string {
        return lcfirst(str)
    }

    /**
     * 转驼峰可以处理以下情况
     * a_b_c => aBC
     * ABC => aBC
     */
    static camelCase(v: string) {
        return v.replace(/^([A-Z])|_([a-z])/g, function (all: any, p1: string, p2: string) {
            if (p1) {
                return p1.toLowerCase()
            }
            return p2.toUpperCase()
        })
    }

    /**
     * 转下划线,可以处理下面情况
     * aBbCc =>  a_bb_cc
     * ABC => aBC
     */
    static snakeCase(v: string) {
        return v.replace(/^([A-Z])|([a-z][A-Z])/g, function (all: any, p1: string, p2: string) {
            if (p1) {
                return p1.toLowerCase()
            }
            return p2[0] + '_' + p2[1].toLowerCase()
        })
    }
}