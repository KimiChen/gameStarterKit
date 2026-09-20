import { UtilObject } from './UtilObject'

export class UtilJson {

    /**
     * 对比两个json的结构和字段类型是否一致
     * 
     */
    static structCompare(template: Record<string, any>, json: Record<string, any>, opts?: { printDebug: boolean }): boolean {
        const ctx = {
            printDebug: opts?.printDebug ?? false, errorNum: 0, currentPath: [],
            errorCB: () => {
                ctx.errorNum += 1
                if (ctx.printDebug) {
                    if (typeof Log !== 'undefined') {
                        Log.warn('check struct fail, path:' + ctx.currentPath.join('/'))
                    } else {
                        console.warn('check struct fail, path:' + ctx.currentPath.join('/'))
                    }
                }
            },
        }
        this.structCompareValues(template, json, ctx)
        if (ctx.errorNum) {
            return false
        }
        return true
    }

    /**
     * 递归对比json的六个值类型,遇到数组或者数字类型做key的挑第一个元素继续对比结构
     */
    private static structCompareValues = function (template: any, right: any,
        ctx: { printDebug: boolean, errorNum: number, currentPath: string[], errorCB: Function }): void {

        if (template === undefined || template == null) {
            throw new Error('can not handle unexpected template value')
        }
        // 目前导刷表应该不传递空值,暂时这么处理
        if (right === null || right === undefined) {
            ctx.errorCB && ctx.errorCB()
        } else if (Array.isArray(template)) {
            if (!Array.isArray(right)) {
                ctx.errorCB && ctx.errorCB()
            }
            if (template.length > 0 && right.length > 0) {
                ctx.currentPath.push('0')
                UtilJson.structCompareValues(template[0], right[0], ctx)
                ctx.currentPath.pop()
            }
        } else if (UtilObject.isPlainObject(template)) {
            if (!UtilObject.isPlainObject(right)) {
                ctx.errorCB && ctx.errorCB()
            }
            let templateNumericKey, rightNumericKey
            for (const key in template) {
                if (!Number.isNaN(parseInt(key)) || !Number.isNaN(parseFloat(key))) {
                    if (!templateNumericKey) {
                        templateNumericKey = key
                    }
                } else {
                    ctx.currentPath.push(key)
                    UtilJson.structCompareValues(template[key], right[key], ctx)
                    ctx.currentPath.pop()
                }
            }
            for (const key in right) {
                if (!Number.isNaN(parseInt(key)) || !Number.isNaN(parseFloat(key))) {
                    if (!rightNumericKey) {
                        rightNumericKey = key
                    }
                }
            }
            if (templateNumericKey && rightNumericKey) {
                ctx.currentPath.push(rightNumericKey)
                UtilJson.structCompareValues(template[templateNumericKey], right[rightNumericKey], ctx)
                ctx.currentPath.pop()
            }
        } else if (typeof template === 'string') {
            if (typeof right !== 'string') {
                ctx.errorCB && ctx.errorCB()
            }
        } else if (typeof template === 'number') {
            if (typeof right !== 'number') {
                ctx.errorCB && ctx.errorCB()
            }
        } else if (typeof template === 'boolean') {
            if (typeof right !== 'boolean') {
                ctx.errorCB && ctx.errorCB()
            }
        }
    }
}