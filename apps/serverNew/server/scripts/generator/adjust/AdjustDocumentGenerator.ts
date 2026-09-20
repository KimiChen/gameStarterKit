import { MethodDeclaration, Project } from 'ts-morph'
import fs from 'fs'
import path from 'path'
import json5 from 'json5'
import { DocSegment, parseDoc } from '../util/DocumentationParser'
import { ChangeDocumentFunctionAction } from './base/ChangeDocumentFunctionAction'
import { ChangeDocumentTreeNode } from './base/ChangeDocumentTreeNode'
import { ChangeDocumentAction } from './base/ChangeDocumentAction'
import { createHash } from 'crypto'
import { adjustFileKey } from './adjustFileKey'
import { GenerationPaths } from '../GenerationPaths'

/** Generates the adjust change document from module-owned capabilities. */
export class AdjustDocumentGenerator {
    private readonly project: Project

    // 根节点，列出来所有的大项
    private rootNode: ChangeDocumentTreeNode = new ChangeDocumentTreeNode('root', 'root')

    // 分组节点，记录详细信息
    private groupNodes = new Map<string, ChangeDocumentTreeNode>()

    // 分组的action
    private groupActions = new Map<string, ChangeDocumentFunctionAction[]>()

    // adjust文件Md5值
    private fileMd5: { [key: string]: string } = {}

    constructor(
        private adjustPaths: string[],
        private adjustPathApi: string,
        private savePath: string,
        private projectRoot: string = path.resolve(__dirname, '../../..'),
    ) {
        this.project = new Project()
    }

    /**
     * 解析文件与注释
     */
    async doParse() {
        await this.traverseDirectories(this.adjustPaths)
        await this.traverseDirectories([this.adjustPathApi], true)

        this.formatActionsToGroupNodes()

        this.save()
    }

    private async traverseDirectories(directoryPaths: string[], isApi: boolean = false) {
        const filePaths = directoryPaths
            .flatMap((directoryPath) => this.collectFiles(directoryPath))
            .sort((left, right) => path.basename(left).localeCompare(path.basename(right)) || left.localeCompare(right))

        for (const filePath of filePaths) {
            await this.parseFile(filePath, isApi)
        }
    }

    private collectFiles(directoryPath: string): string[] {
        const filePaths: string[] = []
        const files = fs.readdirSync(directoryPath) // 读取目录中的文件列表
        for (const file of files) {
            const filePath = path.join(directoryPath, file)
            const stats = fs.statSync(filePath)
            if (stats.isDirectory()) {
                filePaths.push(...this.collectFiles(filePath))
            } else if (stats.isFile()) {
                filePaths.push(filePath)
            }
        }
        return filePaths
    }

    private async parseFile(filePath: string, isApi: boolean) {
        const file = path.basename(filePath)
        if (file.startsWith('Adjust')) {
            const fileContent = fs.readFileSync(filePath, 'utf8')
            this.fileMd5[adjustFileKey(this.projectRoot, filePath)] = createHash('md5')
                .update(fileContent)
                .digest('hex')
        }

        const sourceFile = this.project.addSourceFileAtPathIfExists(filePath)
        if (sourceFile == null) {
            console.error(`not found ${filePath}`)
            process.abort()
        }

        const baseClass = sourceFile.getClasses()[0]
        if (baseClass == undefined) {
            return
        }

        const extendType = baseClass.getExtends()?.getText()
        if (extendType != 'AdjustChange') {
            return
        }
        baseClass.getMethods().forEach((methodDec) => {
            const action = this.parseMethod(methodDec)
            if (action) {
                action.inApiLumen = isApi
            }
        })
    }

    private parseMethod(methodDec: MethodDeclaration) {
        const docText = methodDec.getJsDocs()[0].getFullText()

        const docSegments = parseDoc(docText)
        const paramTypes: { [k: string]: string } = {}
        methodDec.getParameters().forEach((p) => {
            //console.log(p.getText(), p.getFullText(), p.getName(), p.getType().getText())
            paramTypes[p.getName()] = p.getType().getText()
        })
        docSegments.forEach((docSegment: any) => {
            if (docSegment.at == '@param') {
                docSegment.type = paramTypes[docSegment.name] ?? ''
            }
        })
        //console.log(docSegments, methodDec.getName())

        return this.methodToDataModifyAction(methodDec, docSegments)
    }

    private methodToDataModifyAction(methodDec: MethodDeclaration, docSegments: DocSegment[]) {
        let group = ''
        const comments: string[] = []
        const params: DocSegment[] = []
        const dataProviders = new Map<int, string>()
        let canCustom = false
        let sort = 0

        docSegments.forEach((doc) => {
            switch (doc.at) {
                case '@group':
                    group = doc.desc
                    break
                case '@link':
                    dataProviders.set(params.length - 1, doc.desc.split('#')[1])
                    break
                case '@param':
                    params.push(doc)
                    break
                case '@canCustom':
                    canCustom = true
                    break
                case '@sort':
                    sort = parseInt(doc.desc)
                    break
                case '':
                    comments.push(doc.desc)
                    break
            }
        })
        if (!group) {
            return
        }
        const comment = comments.length > 0 ? comments[0] : ''
        const action = new ChangeDocumentFunctionAction(ChangeDocumentFunctionAction.FUNCTION, comment)
        action.group = group
        action.methodName = methodDec.getName()
        action.canCustom = canCustom
        action.sort = sort
        action.childNodeTemplate = new ChangeDocumentTreeNode('', '自定义:' + comment)

        params.forEach((param, index) => {
            const editAction = new ChangeDocumentAction(ChangeDocumentAction.EDIT, '改')
            editAction.setUiIcon('el-icon-edit')
            editAction.setUiAutoReload(1)

            const tmpNode = new ChangeDocumentTreeNode(param.name, param.desc)
            tmpNode.addAction(editAction)
            tmpNode.setUiValueType(param.type)

            tmpNode.dataProvider = dataProviders.get(index)
            if (tmpNode.dataProvider) {
                tmpNode.setUiOptions({})
            } else {
                tmpNode.setUiOptions(null)
            }
            action.childNodeTemplate!.children.push(tmpNode)
        })

        // 添加分组action
        if (!this.groupActions.has(group)) {
            this.groupActions.set(group, [])
        }
        this.groupActions.get(group)!.push(action)

        return action
    }

    private addActionsToTreeNode(group: string, actions: ChangeDocumentFunctionAction[]) {
        // 把group添加到root的children
        this.rootNode.addChild(new ChangeDocumentTreeNode(group, group))

        // 创建group详情节点
        this.groupNodes.set(group, new ChangeDocumentTreeNode(group, group))

        actions.forEach((action) => {
            const subNode = new ChangeDocumentTreeNode(action.methodName, '')
            subNode.setUiIsLeaf()
            subNode.addAction(action)

            this.groupNodes.get(group)!.addChild(subNode)
        })
    }

    private formatActionsToGroupNodes() {
        this.groupActions.forEach((actions, group) => {
            actions.sort((a, b) => {
                return b.sort - a.sort
            })
            this.addActionsToTreeNode(group, actions)
        })
    }

    private save() {
        const data: { root: ChangeDocumentTreeNode; nodes: ChangeDocumentTreeNode[]; md5: { [key: string]: string } } =
            {
                root: this.rootNode,
                nodes: [],
                md5: this.fileMd5,
            }
        this.groupNodes.forEach((treeNode) => {
            data.nodes.push(treeNode)
        })

        fs.mkdirSync(path.dirname(this.savePath), { recursive: true })
        fs.writeFileSync(this.savePath, json5.stringify(data))
    }
}

const projectRoot = path.resolve(__dirname, '../../..')
const generationPaths = new GenerationPaths(projectRoot)
const modulesPath = path.join(projectRoot, 'src/modules')
const adjustPaths = [
    path.join(modulesPath, 'adjust/change'),
    ...fs
        .readdirSync(modulesPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name != 'adjust' && entry.name != 'pay')
        .map((entry) => path.join(modulesPath, entry.name, 'adjust'))
        .filter((directoryPath) => fs.existsSync(directoryPath)),
]
const adjustPathApi = path.join(modulesPath, 'pay/adjust')
const savePath = generationPaths.adjustDocumentFile
const gen = new AdjustDocumentGenerator(adjustPaths, adjustPathApi, savePath, projectRoot)

try {
    void gen.doParse()
    console.log('文件生成成功:', savePath)
} catch (e) {
    console.log('生成报错:', e)
}
