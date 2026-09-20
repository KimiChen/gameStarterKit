import fs from 'fs'
import path from 'path'
import json5 from 'json5'
import { Service } from 'typedi'
import { User } from '../../user/bean/User'
import { AdjustOptionCatalog } from '../api/AdjustOptionCatalog'
import { ChangeDocument, ChangeDocumentTreeNode } from './ChangeDocument'
import { filterCustomFunctionDocument } from './filterCustomFunctionDocument'
import { buildBeanChangeDocument } from './buildBeanChangeDocument'
import { AdjustPageName, PAGE_CUSTOM_FUNCTION, PAGE_INDEX } from './NewUserQuery'

@Service()
export class AdjustDocumentQuery {
    async getData(user: User, routeList: (string | number)[], pageName: AdjustPageName = PAGE_INDEX) {
        if (pageName === PAGE_INDEX) return buildBeanChangeDocument(user, routeList)
        return this.getCustomData(user, routeList.map(String), pageName)
    }

    async getCustomData(user: User, routeList: string[], pageName: AdjustPageName = PAGE_INDEX) {
        const sourceDocument = this.loadChangeDocument()
        const document =
            pageName === PAGE_CUSTOM_FUNCTION ? filterCustomFunctionDocument(sourceDocument) : sourceDocument
        if (pageName !== PAGE_INDEX && pageName !== PAGE_CUSTOM_FUNCTION) {
            throw new Error(`不支持的修改器页面类型: ${pageName}`)
        }
        if (routeList.length == 0) return document.root

        const optionCatalog = new AdjustOptionCatalog(user)
        const group = routeList[0]
        for (const node of document.nodes) {
            if (node.route != group) continue
            await this.fillOptions(optionCatalog, node)
            return node
        }
        return undefined
    }

    private async fillOptions(optionCatalog: AdjustOptionCatalog, node: ChangeDocumentTreeNode) {
        for (const child of node.children) {
            if (child.dataProvider && child.ui) {
                const provider = (optionCatalog as any)[child.dataProvider]
                if (typeof provider !== 'function') {
                    throw new Error(`DataProvider 方法不存在: ${child.dataProvider}`)
                }
                child.ui.options = await provider.call(optionCatalog)
            }
            for (const action of child.actions) {
                if (action.childNodeTemplate) await this.fillOptions(optionCatalog, action.childNodeTemplate)
            }
        }
    }

    loadChangeDocument() {
        const filePath = path.resolve(ROOT_PATH, 'generated', 'adjust', 'change_document.json5')
        try {
            return json5.parse(fs.readFileSync(filePath, 'utf-8')) as ChangeDocument
        } catch (error) {
            throw new Error(`读取解析json文件:${filePath}报错了!${error}`)
        }
    }
}
