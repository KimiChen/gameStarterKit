import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { ClassDeclaration, Project } from 'ts-morph'
import { program } from 'commander'
import { GenerationPaths, relativeImport } from '../GenerationPaths'
import { registerClassSource, stableClassNames } from './ClassListOrder'

/**
 * 生成db的列表, 方便typeorm使用
 */
export class ClassListGen {
    private readonly project: Project

    private classMap: { [name: string]: string } = {}

    constructor(
        private scanDir: string,
        private outputFile: string,
        private bastTypeName: string,
        private nameReg: string,
    ) {
        // 继承链可能跨模块、跨路径别名；无 tsconfig 的孤立 Project 会在解析新模块时让
        // ts-morph 的 getBaseClass 崩溃，生成器却会在异步失败前错误打印“生成成功”。
        this.project = new Project({ tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json') })
    }

    async exec() {
        await this.traverseDirectory(this.scanDir)
        this.save()
    }

    private async traverseDirectory(directoryPath: string) {
        const files = fs.readdirSync(directoryPath).sort() // 读取目录中的文件列表
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
                let extendsTarget = false
                let tmpClass: ClassDeclaration | undefined = baseClass
                while (tmpClass) {
                    const text = tmpClass.getExtends()?.getText()
                    if (text == this.bastTypeName) {
                        extendsTarget = true
                        break
                    }
                    tmpClass = tmpClass.getBaseClass()
                }
                if (!extendsTarget) {
                    continue
                }
                const className = baseClass.getName()!
                if (this.nameReg) {
                    if (!new RegExp(this.nameReg).test(className)) {
                        continue
                    }
                }
                registerClassSource(this.classMap, className, filePath)
            }
        }
    }

    private formatContent() {
        let content = ''
        const previousContent = fs.existsSync(this.outputFile) ? fs.readFileSync(this.outputFile, 'utf8') : ''
        const classNames = stableClassNames(this.classMap, previousContent)
        for (const name of classNames) {
            const classPath = relativeImport(this.outputFile, this.classMap[name])
            // import { EmailActionSendEmail } from './email/GmEmailActionSendEmail'
            content += `import { ${name} } from '${classPath}'\n`
        }
        content += 'export const classList ={\n'
        for (const name of classNames) {
            content += `'${name}':${name},\n`
        }
        content += '}'

        return content
    }

    private save() {
        const content: string = this.formatContent()
        const savePath = this.saveFilePath()
        fs.mkdirSync(path.dirname(savePath), { recursive: true })
        fs.writeFileSync(savePath, content)
        execSync(`npx prettier --ignore-path /dev/null --write ${JSON.stringify(savePath)}`)
    }

    saveFilePath() {
        return this.outputFile
    }
}
//需要传递三个参数 扫描目录 列表文件名(gm-info.ts) 需要继承基类名

program.option('-s | --scanDir <string>', '扫描目录', '')
program.option('-o | --exportFileName <string>', '导出文件名', '')
program.option('-b | --baseClassName <string>', '基类名', '')
program.option('-r | --nameReg <string>', '类名匹配正则', '')
program.parse()

const scanDir = program.getOptionValue('scanDir')
const exportFileName = program.getOptionValue('exportFileName')
const baseClassName = program.getOptionValue('baseClassName')
const nameReg = program.getOptionValue('nameReg')

try {
    if (scanDir && exportFileName && baseClassName) {
        const projectRoot = path.resolve(__dirname, '../../..')
        const paths = new GenerationPaths(projectRoot)
        const sourcePath = path.resolve(__dirname, scanDir)
        const outputFile = path.join(paths.generatedRoot, 'configTypes', exportFileName)
        const gen = new ClassListGen(sourcePath, outputFile, baseClassName, nameReg)
        void gen.exec()
        console.log(exportFileName + ' 生成成功')
    } else {
        console.log(program.helpInformation())
    }
} catch (e) {
    console.log(exportFileName + ' 生成报错:', e)
}
