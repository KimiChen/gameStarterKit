import { createHash } from 'node:crypto'
import json5 from 'json5'
import { User } from '../../user/bean/User'
import { AdjustOptionCatalog } from '../api/AdjustOptionCatalog'
import { ChangeDocument, ChangeDocumentFunctionAction, ChangeDocumentTreeNode } from './ChangeDocument'

export interface CustomFunctionField {
    parent: string
    label: string
    name: string
    type: string
    selectOptions: string
    options: { val: any; options: any }
    default: any
    placeholder: string
    dataType: string
    ext: Record<string, any>
}

export interface CustomFunctionNode {
    uniq: string
    parent: string
    sort: number
    originOrder: number
    route: string
    desc: string
    isLeaf: boolean
    ext: Record<string, any>
    children: CustomFunctionNode[]
    fields: CustomFunctionField[]
    flag: 'api' | 'notice' | ''
    needCheck: boolean
}

interface CustomActionMatch {
    action: ChangeDocumentFunctionAction
    groupRoute: string
}

function uniq(value: string) {
    return createHash('md5').update(value).digest('hex')
}

function isFunctionAction(action: any): action is ChangeDocumentFunctionAction {
    return typeof action?.methodName === 'string' && typeof action?.canCustom === 'boolean'
}

function fieldType(dataType: string) {
    if (dataType === 'bool' || dataType === 'boolean') return 'switch'
    if (dataType === 'timestamp') return 'dateTime'
    return 'input'
}

function fieldDefault(dataType: string, value: any) {
    if (dataType === 'bool' || dataType === 'boolean') return Boolean(value)
    if (['int', 'uint', 'number', 'float', 'timestamp'].includes(dataType)) {
        const number = Number(value)
        return Number.isFinite(number) ? number : 0
    }
    return value ?? ''
}

function actionFields(action: ChangeDocumentFunctionAction): CustomFunctionField[] {
    return (action.childNodeTemplate?.children ?? []).map((child) => ({
        parent: action.methodName,
        label: child.desc || child.route,
        name: child.route,
        type: fieldType(child.ui?.valueType ?? 'string'),
        selectOptions: child.dataProvider ?? '',
        options: { val: child.value ?? '', options: child.ui?.options ?? [] },
        default: fieldDefault(child.ui?.valueType ?? 'string', child.value),
        placeholder: '',
        dataType: child.ui?.valueType ?? 'string',
        ext: {},
    }))
}

function collectActions(document: ChangeDocument) {
    const matches: CustomActionMatch[] = []
    const walk = (node: ChangeDocumentTreeNode, groupRoute: string) => {
        for (const action of node.actions) {
            if (isFunctionAction(action) && action.canCustom) {
                matches.push({ action, groupRoute: action.group || groupRoute })
            }
        }
        node.children.forEach((child) => walk(child, groupRoute || node.route))
    }
    document.nodes.forEach((item) => walk(item, item.route))
    return matches
}

export function buildCustomFunctionTree(document: ChangeDocument): CustomFunctionNode[] {
    const groups = new Map<string, CustomFunctionNode>()
    let originOrder = 0
    for (const { action, groupRoute } of collectActions(document)) {
        let group = groups.get(groupRoute)
        if (!group) {
            group = {
                uniq: uniq(`group:${groupRoute}`),
                parent: '',
                sort: 0,
                originOrder: groups.size,
                route: groupRoute,
                desc: groupRoute,
                isLeaf: false,
                ext: {},
                children: [],
                fields: [],
                flag: '',
                needCheck: false,
            }
            groups.set(groupRoute, group)
        }
        group.children.push({
            uniq: uniq(action.methodName),
            parent: group.uniq,
            sort: action.sort ?? 0,
            originOrder: originOrder++,
            route: action.methodName,
            desc: action.desc || action.methodName,
            isLeaf: true,
            ext: {},
            children: [],
            fields: actionFields(action),
            flag: action.inApiLumen ? 'api' : 'notice',
            needCheck: false,
        })
    }
    for (const group of groups.values()) {
        group.children.sort((left, right) => left.sort - right.sort || left.originOrder - right.originOrder)
    }
    return [...groups.values()]
}

export function findCustomFunction(document: ChangeDocument, method: string, flag?: string) {
    const match = collectActions(document).find(({ action }) => {
        const actionFlag = action.inApiLumen ? 'api' : 'notice'
        return action.methodName === method && (!flag || actionFlag === flag)
    })
    return match?.action
}

function parseProviderCall(call: string) {
    const match = call.trim().match(/^([^()]+)(?:\((.*)\))?$/)
    if (!match) return { method: call, args: [] as any[] }
    if (!match[2]) return { method: match[1], args: [] as any[] }
    return { method: match[1], args: json5.parse(`[${match[2]}]`) as any[] }
}

export async function loadCustomFunctionOptions(user: User, calls: string[]) {
    const provider = new AdjustOptionCatalog(user)
    const result: Record<string, { val: any; options: any }> = {}
    for (const call of [...new Set(calls.filter(Boolean))]) {
        const { method, args } = parseProviderCall(call)
        const target = (provider as any)[method]
        if (typeof target !== 'function') {
            throw new Error(`AdjustOptionCatalog 方法不存在: ${method}`)
        }
        const options = await target.apply(provider, args)
        result[call] = { val: '', options: options ?? [] }
    }
    return result
}

export function formatCustomFunctionResult(result: any) {
    const common = { prints: '', downloadFileName: '', fullscreen: false }
    if (result && typeof result === 'object' && typeof result.type === 'string') {
        return { ...common, ...result }
    }
    if (typeof result === 'string') {
        if (result.includes('<!DOCTYPE html>')) {
            return { ...common, type: 'html', code: result }
        }
        try {
            const parsed = json5.parse(result)
            if (parsed && typeof parsed === 'object') {
                return { ...common, type: 'json', data: parsed, download: true }
            }
        } catch {
            // Plain strings are rendered by the default response.
        }
        return { ...common, type: 'default', message: result || '执行成功' }
    }
    if (result && typeof result === 'object') {
        return { ...common, type: 'json', data: result, download: true }
    }
    if (typeof result === 'boolean') {
        return { ...common, type: 'default', message: result ? 'true' : 'false' }
    }
    return {
        ...common,
        type: 'default',
        message: result === undefined || result === null ? '执行成功' : String(result),
    }
}
