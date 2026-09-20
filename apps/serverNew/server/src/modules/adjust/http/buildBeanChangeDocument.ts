import fs from 'node:fs'
import path from 'node:path'
import json5 from 'json5'
import { Bean, DiffArray, DiffMap, FieldInfo } from '@arthropoda/game-engine'
import { User } from '../../user/bean/User'
import { ChangeDocumentAction, ChangeDocumentTreeNode } from './ChangeDocument'

interface BeanFieldDocument {
    name: string
    type: string
    comment?: string
    itemType?: string
}

interface BeanDocument {
    simpleName: string
    fields: Record<string, BeanFieldDocument>
}

interface BeanDocumentFile {
    diffInfos: Record<string, BeanDocument>
}

type RoutePart = string | number

interface ResolvedValue {
    value: any
    metaName?: string
    itemType?: string
    field?: BeanFieldDocument
}

const USER_META_NAME = 'User'
const readonlyUserFields = new Set(['id', 'sId', 'openid', 'lineOpenId'])
let beanDocuments: Record<string, BeanDocument> | undefined

function loadBeanDocuments() {
    if (!beanDocuments) {
        const filePath = path.resolve(ROOT_PATH, 'generated/records/bean.json5')
        const content = json5.parse(fs.readFileSync(filePath, 'utf8')) as BeanDocumentFile
        beanDocuments = content.diffInfos
    }
    return beanDocuments
}

function node(route: RoutePart, desc: string, partial: Partial<ChangeDocumentTreeNode> = {}): ChangeDocumentTreeNode {
    return {
        route: String(route),
        desc,
        ui: {},
        ext: {},
        actions: [],
        runAction: [],
        children: [],
        isLeaf: false,
        value: '',
        ...partial,
    }
}

function action(route: string, desc: string, icon: string, buttonType: string): ChangeDocumentAction {
    return {
        route,
        desc,
        ui: {
            icon,
            buttonType,
            autoReload: 1,
        },
        ext: {},
    }
}

function editAction() {
    return action('edit', '改', 'el-icon-edit', 'primary')
}

function deleteAction() {
    return action('del', '删', 'el-icon-delete', 'danger')
}

function isPrimitiveType(type?: string) {
    return ['bool', 'boolean', 'int', 'uint', 'number', 'float', 'string', 'text'].includes(type ?? '')
}

function valueType(field: BeanFieldDocument, value: unknown) {
    if (/time$/i.test(field.name) && ['int', 'uint', 'number'].includes(field.type)) {
        return 'timestamp'
    }
    switch (field.type) {
        case 'bool':
        case 'boolean':
            return 'bool'
        case 'int':
        case 'uint':
        case 'number':
        case 'float':
            return 'number'
        case 'string':
        case 'text':
            return 'text'
        default:
            if (typeof value === 'boolean') return 'bool'
            if (typeof value === 'number') return 'number'
            return 'text'
    }
}

function fieldDescription(field: BeanFieldDocument) {
    return field.comment ? `${field.comment}.${field.name}` : field.name
}

function runtimeFieldMetadata(value: any, fieldName: string): FieldInfo | undefined {
    if (!(value instanceof Bean)) return undefined
    return value.getClassInfo().fieldMap[fieldName]
}

function isPersistentField(field: BeanFieldDocument, value: any) {
    const info = runtimeFieldMetadata(value, field.name)
    return info ? info.forRedis : true
}

function isEditableField(metaName: string, field: BeanFieldDocument, value: any) {
    return isPersistentField(field, value) && !(metaName === USER_META_NAME && readonlyUserFields.has(field.name))
}

function readField(value: any, fieldName: string) {
    try {
        return value[fieldName]
    } catch {
        return undefined
    }
}

function fieldNode(owner: any, ownerMetaName: string, field: BeanFieldDocument): ChangeDocumentTreeNode | undefined {
    if (!isPersistentField(field, owner)) return undefined
    const desc = fieldDescription(field)
    if (isPrimitiveType(field.type)) {
        const value = readField(owner, field.name)
        const actions = isEditableField(ownerMetaName, field, owner) ? [editAction()] : []
        return node(field.name, desc, {
            ui: { valueType: valueType(field, value), options: null },
            actions,
            isLeaf: true,
            value: value ?? '',
        })
    }
    if (field.type === 'DiffMap') {
        return node(field.name, desc, { ui: { valueType: 'arrayRedis' } })
    }
    if (field.type === 'DiffArray') {
        return node(field.name, desc, { ui: { valueType: 'array' } })
    }
    return node(field.name, desc, { ui: { valueType: 'object' } })
}

function beanNode(route: RoutePart, value: any, metaName: string, desc?: string) {
    const document = loadBeanDocuments()[metaName]
    const children = document
        ? Object.values(document.fields)
              .map((field) => fieldNode(value, metaName, field))
              .filter((item): item is ChangeDocumentTreeNode => item !== undefined)
        : []
    return node(route, desc ?? metaName, {
        ui: { valueType: 'object' },
        children,
    })
}

function collectionEntryNode(route: RoutePart, value: any, itemType?: string) {
    const desc = String(route)
    if (isPrimitiveType(itemType) || value === null || value === undefined || typeof value !== 'object') {
        const field: BeanFieldDocument = {
            name: String(route),
            type: itemType || typeof value,
        }
        return node(route, `${desc}=>${String(value ?? '')}`, {
            ui: { valueType: valueType(field, value), options: null },
            actions: [editAction(), deleteAction()],
            isLeaf: true,
            value: value ?? '',
        })
    }
    return node(route, desc, {
        ui: { valueType: 'object' },
        actions: [deleteAction()],
    })
}

function mapNode(route: RoutePart, value: DiffMap<any, any>, itemType?: string, desc?: string) {
    const children: ChangeDocumentTreeNode[] = []
    value.forEach((item, key) => children.push(collectionEntryNode(key, item, itemType)))
    return node(route, desc ?? String(route), {
        ui: { valueType: 'arrayRedis' },
        children,
    })
}

function arrayNode(route: RoutePart, value: DiffArray<any>, itemType?: string, desc?: string) {
    const children: ChangeDocumentTreeNode[] = []
    value.forEach((item, index) => children.push(collectionEntryNode(index, item, itemType)))
    return node(route, desc ?? String(route), {
        ui: { valueType: 'array' },
        children,
    })
}

function collectionKey(value: DiffMap<any, any>, route: RoutePart) {
    if (value.has(route as any)) return route
    const numeric = Number(route)
    return Number.isNaN(numeric) || !value.has(numeric) ? String(route) : numeric
}

function resolveValue(user: User, routeList: RoutePart[]): ResolvedValue {
    if (routeList.length === 0 || String(routeList[0]) !== USER_META_NAME) {
        throw new Error('数据路径必须从 User 开始')
    }
    let resolved: ResolvedValue = { value: user, metaName: USER_META_NAME }
    for (const route of routeList.slice(1)) {
        const current = resolved.value
        if (current instanceof DiffMap) {
            resolved = {
                value: current.get(collectionKey(current, route) as any),
                metaName: isPrimitiveType(resolved.itemType) ? undefined : resolved.itemType,
            }
            continue
        }
        if (current instanceof DiffArray) {
            resolved = {
                value: current.at(Number(route)),
                metaName: isPrimitiveType(resolved.itemType) ? undefined : resolved.itemType,
            }
            continue
        }
        const document = resolved.metaName ? loadBeanDocuments()[resolved.metaName] : undefined
        const field = document?.fields[String(route)]
        if (!field) throw new Error(`数据字段不存在: ${String(route)}`)
        resolved = {
            value: readField(current, field.name),
            metaName: isPrimitiveType(field.type) ? undefined : field.type,
            itemType: field.itemType || undefined,
            field,
        }
    }
    return resolved
}

export function buildBeanChangeDocument(user: User, routeList: RoutePart[]) {
    if (routeList.length === 0) {
        return node('root', 'root', {
            ui: { valueType: 'object' },
            children: [node(USER_META_NAME, 'User.用户数据', { ui: { valueType: 'object' } })],
        })
    }
    const resolved = resolveValue(user, routeList)
    const route = routeList[routeList.length - 1]
    const desc = resolved.field ? fieldDescription(resolved.field) : String(route)
    if (resolved.value instanceof DiffMap) {
        return mapNode(route, resolved.value, resolved.itemType, desc)
    }
    if (resolved.value instanceof DiffArray) {
        return arrayNode(route, resolved.value, resolved.itemType, desc)
    }
    if (resolved.value instanceof Bean || resolved.metaName) {
        const metaName = resolved.metaName || resolved.value.getClassInfo().name
        return beanNode(route, resolved.value, metaName, routeList.length === 1 ? 'User.用户数据' : desc)
    }
    const field = resolved.field ?? { name: String(route), type: typeof resolved.value }
    return node(route, desc, {
        ui: { valueType: valueType(field, resolved.value), options: null },
        actions: [editAction()],
        isLeaf: true,
        value: resolved.value ?? '',
    })
}
