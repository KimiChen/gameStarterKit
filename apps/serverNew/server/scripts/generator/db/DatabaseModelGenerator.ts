import fs from 'fs'
import path from 'path'
import { Project, SourceFile, SyntaxKind } from 'ts-morph'
import { GenerationPaths, relativeImport } from '../GenerationPaths'
import { execFileSync } from 'child_process'

/**
 * 生成db的列表, 方便typeorm使用
 */
export class DatabaseModelGenerator {
    private readonly project: Project

    private saveFile = 'db-info.ts'

    private entities: string[] = []

    private entitySources = new Map<string, string>()

    constructor(
        private dbPaths: string[],
        private outputPath: string,
    ) {
        this.project = new Project()
    }

    async exec() {
        for (const dbPath of this.dbPaths) {
            if (fs.existsSync(dbPath)) await this.traverseDirectory(dbPath)
        }
        this.save()
    }

    private async traverseDirectory(directoryPath: string, isApi: boolean = false) {
        const files = fs.readdirSync(directoryPath) // 读取目录中的文件列表
        for (const file of files) {
            const filePath = path.join(directoryPath, file)
            const stats = fs.statSync(filePath)
            if (stats.isDirectory()) {
                await this.traverseDirectory(filePath) // 如果是目录，则递归遍历子目录
            } else if (stats.isFile()) {
                // 处理文件，这里仅打印文件路径，你可以根据需求做其他操作
                const sourceFile = this.project.addSourceFileAtPathIfExists(filePath)
                if (sourceFile == null) {
                    console.error(`not found ${filePath}`)
                    process.abort()
                }

                const baseClass = sourceFile.getClasses()[0]
                if (baseClass == undefined) {
                    continue
                }

                const extendType = baseClass.getExtends()?.getText()
                if (extendType != 'BaseEntity') {
                    continue
                }
                const entityName = baseClass.getName()!
                if (!this.entities.includes(entityName)) {
                    this.entities.push(entityName)
                    this.entitySources.set(entityName, filePath)
                }
                const findRegExp = new RegExp(/(?<!@arthropoda\/)typeorm/)
                const importDeclare = sourceFile?.getImportDeclaration((d) => {
                    if (findRegExp.test(d.getText())) {
                        return true
                    }
                    return false
                })
                if (importDeclare) {
                    importDeclare.setModuleSpecifier('@arthropoda/typeorm')
                }
                await this.classFieldRefactor(sourceFile)
            }
        }
    }

    /**
     * mysql里没有bool类型, 声明boolean实际是number会导致proto序列化失败, 所以将boolean全部处理成number
     * 为db类添加表的column字段名静态变量
     */
    private async classFieldRefactor(sourceFile: SourceFile) {
        let hasChange = false

        sourceFile.getClasses().forEach((classDeclaration) => {
            // 遍历类中的所有属性
            const tableColumnMap: { [id: string]: string } = {}
            const existedFieldMap: { [id: string]: string } = {}

            classDeclaration.getProperties().forEach((property) => {
                const typeNode = property.getTypeNode()
                if (typeNode && typeNode.getText() === 'boolean') {
                    // 1.boolean改number
                    property.setType('number')
                    hasChange = true
                }
                const propertyName = property.getName()
                existedFieldMap[propertyName] = propertyName
                property.getDecorators().forEach((decorator) => {
                    const args = decorator.getArguments() ?? []
                    for (let index = 0; index < args.length; index++) {
                        const arg = args[index]
                        const columnObjectLiteral = arg.asKind(SyntaxKind.ObjectLiteralExpression)
                        if (columnObjectLiteral) {
                            const columnProperty = columnObjectLiteral
                                .getProperty('name')
                                ?.asKind(SyntaxKind.PropertyAssignment)
                            if (columnProperty) {
                                const columnName = columnProperty
                                    .getInitializer()
                                    ?.getText()
                                    .replaceAll('"', '')
                                    .replaceAll("'", '')
                                if (columnName) {
                                    tableColumnMap[columnName] = columnName
                                }
                            }
                        }
                    }
                })
            })
            for (const key in tableColumnMap) {
                const columnName = tableColumnMap[key]
                const columnFieldName = `f_${columnName}`
                if (!existedFieldMap[columnFieldName]) {
                    //2.添加表字段静态变量
                    classDeclaration.addProperty({
                        name: columnFieldName,
                        isReadonly: true,
                        isStatic: true,
                        initializer: `"${columnName}"`,
                    })
                    hasChange = true
                }
            }
        })

        if (hasChange) {
            await this.project.save()
        }
    }

    private formatContent() {
        let content = "import { BaseEntity } from '@arthropoda/typeorm'"
        for (const entityName of this.entities) {
            content +=
                '\n' +
                `import { ${entityName} } from '${relativeImport(this.outputPath + '/db-info.ts', this.entitySources.get(entityName)!)}'`
        }
        content += '\n' + 'export const entities: (typeof BaseEntity)[] =['
        content += this.entities.join(',')
        content += ']'

        return content
    }

    private save() {
        const content: string = this.formatContent()
        const savePath = path.resolve(this.outputPath, this.saveFile)
        fs.mkdirSync(path.dirname(savePath), { recursive: true })
        fs.writeFileSync(savePath, content)
        execFileSync('npx', ['prettier', '--ignore-path', '/dev/null', '--write', savePath], { stdio: 'inherit' })
    }
}

const projectRoot = path.resolve(__dirname, '../../..')
const paths = new GenerationPaths(projectRoot)
const generator = new DatabaseModelGenerator(
    [paths.persistenceRoot, path.join(projectRoot, 'src', 'db')],
    paths.persistenceRoot,
)

try {
    void generator.exec()
    console.log('db-info.ts生成成功')
} catch (e) {
    console.log('db-info.ts生成报错:', e)
}
