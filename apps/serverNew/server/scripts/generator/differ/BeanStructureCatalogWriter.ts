import path from 'path'
import fs from 'fs'

import json5 from 'json5'
import { convertToBase52, md5 } from '@arthropoda/game-engine'
import { RecProject } from './record/RecProject'
import { writeFileEnsuringParentDirectory } from '../util/writeFileEnsuringParentDirectory'

export interface ProtocolCatalogEntry {
    type: string
    keyTip: string
    diffInfoName: string
    doc: string
}

export interface BeanFieldCatalogEntry {
    name: string
    type: string
    fieldName: string
    comment: string
    itemType: string
    defaultValue: string
    dataProvider: string[]
}

export interface BeanDifferenceDescriptor {
    simpleName: string
    fields: { [key: string]: BeanFieldCatalogEntry }
    namesByFieldName: Record<string, string>
    key: string
    keyNet: string
}

export interface BeanStructureCatalog {
    diffInfos: { [key: string]: BeanDifferenceDescriptor }
    md5: string
    protocols: { [key: string]: ProtocolCatalogEntry }
}

/** 生成 Bean 结构记录，用于 Redis 工具展示。 */
export class BeanStructureCatalogWriter {
    static async write(pro: RecProject) {
        // 写入文件
        const filePath = pro.paths.beanJsonFile
        const beanJson: BeanStructureCatalog = {
            diffInfos: {},
            md5: '',
            protocols: {},
        }
        for (const bean of pro.beans.values()) {
            if (!bean.diffType) continue
            const diffItem: BeanDifferenceDescriptor = {
                simpleName: bean.name,
                fields: {},
                namesByFieldName: {},
                key: '',
                keyNet: '',
            }
            const namesByFieldName: { [key: string]: string } = {}
            for (const field of bean.propsExist) {
                const aliasName = convertToBase52(field.id)
                const tmp: BeanFieldCatalogEntry = {
                    name: field.name,
                    type: field.type,
                    fieldName: aliasName,
                    comment: field.comment,
                    itemType: field.collectionTypes ? field.collectionTypes[field.collectionTypes.length] : '',
                    defaultValue: '',
                    dataProvider: [],
                }
                switch (field.type) {
                    case 'Map':
                        tmp.type = 'DiffMap'
                        break
                    case 'Array':
                        tmp.type = 'DiffArray'
                        break
                }
                namesByFieldName[aliasName] = field.name
                diffItem.fields[field.name] = tmp
            }
            diffItem.namesByFieldName = namesByFieldName
            beanJson.diffInfos[bean.name] = diffItem
        }

        const previousContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : ''
        const previous = previousContent ? (json5.parse(previousContent) as BeanStructureCatalog) : undefined
        const schemaJson = json5.stringify({ diffInfos: beanJson.diffInfos, protocols: beanJson.protocols })
        const previousSchemaJson = previous
            ? json5.stringify({ diffInfos: previous.diffInfos, protocols: previous.protocols })
            : undefined
        beanJson.md5 =
            previousSchemaJson === schemaJson && previous?.md5 ? previous.md5 : md5('123456' + md5(schemaJson))
        const jsonStr = json5.stringify(beanJson)
        writeFileEnsuringParentDirectory(filePath, jsonStr)
        console.log()
    }
}
