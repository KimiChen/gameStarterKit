import json5 from 'json5'
export class UtilObject {
    static hasOwnProp(obj: any, key: string) {
        return Object.prototype.hasOwnProperty.call(obj, key)
    }

    static getValue(data: any, dataPath: any, defVal: any = null): any {
        if (!data) {
            return defVal
        }
        let path = dataPath as string
        if (typeof dataPath !== 'string') {
            path = dataPath.toString()
        }
        const keyArr = path.split('.')
        let curObj = data
        for (let i = 0; i < keyArr.length; i += 1) {
            const key = keyArr[i]
            if (Array.isArray(curObj)) {
                curObj = curObj[parseInt(key, 10)]
            } else if (key !== '') {
                curObj = curObj[key]
            }
            if (!curObj) {
                break
            }
        }

        if (!curObj) {
            return defVal
        }
        return curObj
    }

    static toJson(obj: any, sort: boolean = false): string {
        let realObj = obj
        if (sort) {
            realObj = {}
            Object.keys(obj).sort().map(key => {
                realObj[key] = obj[key]
            })
        }
        return json5.stringify(realObj)
    }

    static getField<T, K extends keyof T>(obj: T, fieldName: K): T[K] {
        return obj[fieldName]
    }

    static setFieldVal<T, K extends keyof T>(obj: T, fieldName: K, value: any) {
        obj[fieldName] = value
    }

    /**
     * 判断是否为一般对象, 非数组/字符串/方法/等等 形如{},
     */
    static isPlainObject(arg: any): boolean {
        return arg && typeof arg === 'object' && !Array.isArray(arg)

    }
}
