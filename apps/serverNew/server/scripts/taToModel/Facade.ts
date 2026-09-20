import * as ejs from 'ejs'
import * as ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { ClassItem } from './bean/structure/ClassItem'
import { Config } from './conf/Config'
import { TelemetryGlobalPropertiesConverter } from './convert/TelemetryGlobalPropertiesConverter'
import { ConvertEvents } from './convert/ConvertEvents'
import { ConvertUser } from './convert/ConvertUser'
import { execFileSync } from 'child_process'

export class Facade {
    projectPath: string = path.resolve(__dirname, '../../')

    protected config: Config = new Config()

    protected workbook!: ExcelJS.Workbook

    protected changeFilePahts: string[] = []

    public async init() {
        const excelPath = this.projectPath + this.config.excelFilePath
        if (!fs.existsSync(excelPath)) {
            throw new Error('文件不存在:' + excelPath)
        }
        this.workbook = new ExcelJS.Workbook()
        await this.workbook.xlsx.readFile(excelPath)
    }

    public async handleUser() {
        const userData = new ConvertUser(this.config, this.workbook)
        userData.run()
        await this.createClass(userData.class)
    }

    public async handleCommon() {
        const common = new TelemetryGlobalPropertiesConverter(this.config, this.workbook)
        common.run()
        await this.createClass(common.class)
    }

    public async handleEvents() {
        const events = new ConvertEvents(this.config, this.workbook)
        await events.run()
        for (const item of events.classes) {
            // 生成模块函数
            if (item.namespace === this.config.taModuleNamespace) {
                await this.createModule(item)
            } else {
                // 生成数数结构
                await this.createClass(item)
            }
        }
    }

    public async createClass(data: ClassItem, forceCreate = true) {
        const savePath = path.join(this.projectPath, data.savePath)

        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true })
        }

        const fileName = `${savePath}${data.name}.ts`
        if (!forceCreate && fs.existsSync(fileName)) {
            return
        }

        const ejsTpl = this.projectPath + this.config.tplClass
        const classBody = await ejs.renderFile(ejsTpl, { data: data })
        fs.writeFileSync(fileName, classBody)

        this.changeFilePahts.push(fileName)
    }

    public async createModule(data: ClassItem) {
        const savePath = path.join(this.projectPath, data.savePath)

        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true })
        }

        for (const module of data.methods) {
            const fileName = `${savePath}${module.eventName}.ts`
            if (fs.existsSync(fileName)) {
                continue
            }

            const ejsTpl = this.projectPath + this.config.tplModuleMethod
            const classBody = await ejs.renderFile(ejsTpl, { method: module })
            fs.writeFileSync(fileName, classBody)

            this.changeFilePahts.push(fileName)
        }
    }

    public formatCode() {
        if (this.changeFilePahts.length === 0) return
        execFileSync('npx', ['prettier', '--ignore-path', '/dev/null', '--write', ...this.changeFilePahts], {
            stdio: 'inherit',
        })
    }
}
