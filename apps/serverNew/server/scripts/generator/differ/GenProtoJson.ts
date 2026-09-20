import path from 'path'
import fs from 'fs'
import json5 from 'json5'
import { RecProject } from './record/RecProject'
import { RecProperty } from './record/RecProperty'

export interface ProtoItem {
    name: string
    longName: string
    package: string
    fields: Record<string, ProtoField>
    comment: string
}

export interface ProtoField {
    id: number
    name: string
    comment: string
    type: string
    rule?: string
}

export interface RouteMapField {
    name: string
    number: number
    description: string
}

export interface MessageField {
    defaultValue: string
    description: string
    fullType: string
    ismap: boolean
    isoneof: boolean
    label: string
    longType: string
    name: string
    oneofdecl: string
    type: string
}

export interface Message {
    name: string
    extensions: string[]
    description: string
    fullName: string
    hasExtensions: boolean
    hasFields: boolean
    hasOneofs: boolean
    longName: string
    fields: MessageField[]
}

export interface Ctrl {
    type: string
    ctrl: string
    method: string
    id: string
    p: string
    label: string
}

export interface Route {
    id: string
    label: string
    children: Ctrl[]
}

export interface Proto {
    proto: {
        nested: {
            pb: {
                nested: Record<string, ProtoItem>
            }
        }
    }
    doc: {
        enum: {
            RouteMap: Record<string, RouteMapField>
        }
        message: Record<string, Message>
        route: Record<string, Route>
    }
}

export class GenProtoJson {
    static protoTypes: { [key: string]: string } = {
        string: 'string',
        number: 'double',
        boolean: 'bool',
        int: 'int64',
        uint: 'uint64',
    }

    public static getProtoType(tsType: string) {
        return this.protoTypes[tsType] ?? tsType
    }

    private static isFilter(name: string) {
        const filterArry = ['@comm']
        for (const f of filterArry) {
            if (name.startsWith(f)) {
                return true
            }
        }
        return false
    }

    static getProp(prop: RecProperty) {
        const propItem: ProtoField = {
            id: prop.id,
            name: prop.name,
            comment: prop.comment!,
            type: prop.protobufType(),
        }
        if (prop.type === 'Array') {
            propItem.rule = 'repeated'
        }
        return propItem
    }

    public static makeJson(project: RecProject) {
        const p: Proto = {
            proto: {
                nested: {
                    pb: {
                        nested: {},
                    },
                },
            },
            doc: {
                enum: {
                    RouteMap: {},
                },
                message: {},
                route: {},
            },
        }

        const types = project.getMsgTypes('C2S')
        // 生成pb的types
        for (const tp of types) {
            const item: ProtoItem = {
                fields: {},
                name: tp.name,
                longName: '.' + tp.package + tp.name,
                package: '',
                comment: tp.comment,
            }
            for (const prop of tp.propsExist) {
                item.fields[prop.name] = this.getProp(prop)
            }
            p.proto.nested.pb.nested[tp.name] = item
            p.doc.message[tp.name] = this.getMessageItem(tp.name, tp.comment, tp.package + tp.name, tp.propsExist)
        }
        // RouteMap
        const values: { values: Record<string, int> } = { values: {} }
        p.proto.nested.pb.nested.RouteMap = values as any

        // 生成pb的types
        for (const file of project.protocols.get('C2S')!.protocols.values()) {
            if (file.deleted) continue
            for (const [name, api] of file.apis) {
                p.doc.enum.RouteMap[api.req.id] = {
                    name: api.req.msgPath,
                    number: api.req.id,
                    description: api.req.comment,
                }
            }

            const route: Route = (p.doc.route[file.name] = {
                id: file.name,
                label: file.name,
                children: [],
            })
            for (const msg of file.types(true)) {
                const paths = msg.msgPath.split('/')
                const child: Ctrl = {
                    type: msg.name.startsWith('Req') ? 'api' : 'msg',
                    ctrl: paths[0],
                    method: paths[1],
                    id: `${msg.id}`,
                    p: msg.msgPath,
                    label: msg.comment,
                }
                route.children.push(child)
                values.values[msg.name] = msg.id
            }
        }

        const jsonStr = json5.stringify(p)
        const protoPath = project.paths.protoJsonFile
        console.log('生成文件：' + protoPath)
        fs.mkdirSync(path.dirname(protoPath), { recursive: true })
        fs.writeFileSync(protoPath, jsonStr)
        project.toFormatFiles.push(protoPath)
    }

    private static getMessageItem(
        name: string,
        comment: string,
        longName: string,
        props: IterableIterator<RecProperty>,
    ) {
        const msgItem: Message = {
            name: name,
            extensions: [],
            description: comment,
            fullName: '.' + longName,
            hasExtensions: false,
            hasFields: true,
            hasOneofs: false,
            longName: longName,
            fields: [],
        }

        for (const prop of props) {
            const type = prop.typeImport
                ? 'reference'
                : prop.collectionTypes
                  ? prop.collectionTypes![prop.collectionTypes!.length - 1]
                  : prop.type
            const field: MessageField = {
                defaultValue: '',
                description: prop.comment!,
                fullType: type,
                ismap: prop.type === 'Map',
                isoneof: false,
                label: '',
                longType: '',
                name: prop.name,
                oneofdecl: '',
                type: type,
            }
            msgItem.fields.push(field)
        }
        return msgItem
    }
}
